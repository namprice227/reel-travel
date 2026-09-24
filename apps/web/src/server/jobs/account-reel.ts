import { ClueListSchema, extractAndMapPlaces, isTransientYouTubeError, normalizeYouTubeUrl, YouTubeTranscriptError } from "@reel/ai";
import type { ExtractionAndMappingResult } from "@reel/ai";
import { supportedTimezone, type AccountReel, type AccountReelJob } from "@reel/contracts";
import { config } from "../config";
import { repos } from "../db";
import { nowIso } from "../ids";
import { accountPlacesFromStops, mapAccountPlaceStops, reelCountry } from "../services/account-reels";
import { newInspiration } from "../services/inspirations";
import { statusFromPlaces } from "../services/places";
import { draftTripFromReel } from "../services/trips";
import { saveStopsAsCandidates } from "./import-inspiration";
import { getProviders } from "../providers";
import { abandonedBefore } from "./policy";

const retrySeconds = [10, 60];

/**
 * Itinerary reel: create (or, on retry, reuse) the draft trip, then save its stops as trip candidates with
 * provider options and source-day hints. Place lookup uses the source-named destination. False: lease lost.
 */
async function saveItineraryDraft(job: AccountReelJob, reel: AccountReel, result: ExtractionAndMappingResult): Promise<boolean> {
  const r = repos();
  const trip = await r.accountReels.attachDraftTrip(job, draftTripFromReel(reel, result));
  if (!trip) return false;
  const existing = (await r.inspirations.listByTrip(trip.id)).find((item) => item.url === reel.url);
  const inspiration = existing ?? { ...newInspiration(trip.id, "link", { url: reel.url }), status: "processing" as const };
  if (!existing) await r.inspirations.insert(inspiration);

  const { lookup } = getProviders();
  const stops = [];
  for (const [index, stop] of result.stops.entries()) {
    const searchable = lookup && (!lookup.maxClues || index < lookup.maxClues);
    stops.push({ ...stop, options: searchable
      ? await lookup.search({ query: stop.name, hint: stop.area_hint, excerpt: stop.excerpt }, { destination: trip.destination })
      : null });
  }
  const placeIds = await saveStopsAsCandidates(trip.id, inspiration, stops);
  const latest = await r.inspirations.get(inspiration.id);
  if (latest) await r.inspirations.update({ ...latest, status: await statusFromPlaces(placeIds), placeIds,
    failureCode: null, failureMessage: null, updatedAt: nowIso() });
  return true;
}

/** Durable worker path for a reel saved before a trip exists. */
export async function runAccountReelJob(jobId: string): Promise<"succeeded" | "retrying" | "failed" | "not_run"> {
  const r = repos();
  const job = await r.accountReels.claim(jobId, { now: nowIso(), staleBefore: abandonedBefore() });
  if (!job) return "not_run";
  if (job.status === "failed") return "failed";
  const reel = await r.accountReels.get(job.targetId);
  if (!reel || reel.ownerId !== job.ownerId) return "not_run";

  const settle = (next: AccountReelJob, status: typeof reel.status, failureCode: typeof reel.failureCode,
    failureMessage: string | null, places?: ReturnType<typeof accountPlacesFromStops>) =>
    r.accountReels.settle(next, { status, failureCode, failureMessage, ...(places ? { places } : {}) });
  const done = { ...job, status: "succeeded" as const, updatedAt: nowIso(), lastError: null };
  try {
    if (reel.details?.trim()) {
      const providers = getProviders();
      const result = await providers.extractor.extract({
        sourceType: "text", text: reel.details, note: null, details: null,
      });
      if (result.status === "needs_input") {
        return await settle(done, "needs_input", result.failureCode, result.message)
          ? "succeeded" : "not_run";
      }
      const { clues } = ClueListSchema.parse({ clues: result.clues });
      const stops = await mapAccountPlaceStops(clues.map((clue) => ({
        name: clue.query, area_hint: clue.hint, category: clue.classification?.category?.value ?? null,
        excerpt: clue.excerpt, country: clue.classification?.country ?? null,
      })), providers.lookup);
      const places = accountPlacesFromStops(reel, stops);
      return await settle(done, places.length ? "ready" : "needs_input",
        places.length ? null : "NO_PLACES_FOUND",
        places.length ? null : "No identifiable places were found in those details.", places)
        ? "succeeded" : "not_run";
    }
    if (!normalizeYouTubeUrl(reel.url)) {
      return await settle(done, "needs_input", "SOURCE_INACCESSIBLE",
        "Only public YouTube Shorts can be read automatically. Add the place names or caption below.")
        ? "succeeded" : "not_run";
    }
    if (config.aiProvider !== "openai") {
      return await settle(done, "needs_input", "UNSUPPORTED_SOURCE",
        "Reel extraction is unavailable in this environment. Your link remains saved.")
        ? "succeeded" : "not_run";
    }
    const result = await extractAndMapPlaces(reel.url, {
      destination: "", skipMapping: true,
      geminiApiKey: process.env.GOOGLE_AI_API_KEY,
      geminiModel: process.env.GEMINI_TRANSCRIPTION_MODEL,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_EXTRACTION_MODEL,
    });
    if (result.format.kind === "itinerary" && result.stops.length) {
      // Trips cover the supported countries only. Elsewhere the itinerary's places stay ideas, and the
      // recorded format lets Home explain why no trip was made.
      if (supportedTimezone(result.format.city, result.format.country)) {
        return await saveItineraryDraft(job, reel, result) && await settle(done, "ready", null, null)
          ? "succeeded" : "not_run";
      }
      if (!await r.accountReels.recordFormat(job, "itinerary")) return "not_run";
    }
    const country = reelCountry(result.format);
    const stops = await mapAccountPlaceStops(
      result.stops.map((stop) => ({ ...stop, country })),
      getProviders().lookup,
    );
    const places = accountPlacesFromStops(reel, stops);
    return await settle(done, places.length ? "ready" : "needs_input",
      places.length ? null : "NO_PLACES_FOUND",
      places.length ? null : "No identifiable places were found in this reel.", places)
      ? "succeeded" : "not_run";
  } catch (error) {
    // Busy, rate-limited or slow providers use the retry below, not the unreadable-Short message.
    if (error instanceof YouTubeTranscriptError && !isTransientYouTubeError(error)) {
      return await settle(done, "needs_input", "SOURCE_INACCESSIBLE",
        "This Short could not be read. The original link remains saved.")
        ? "succeeded" : "not_run";
    }
    const at = nowIso();
    if (job.attempt < job.maxAttempts) {
      const seconds = retrySeconds[job.attempt - 1] ?? 60;
      const queued: AccountReelJob = { ...job, status: "queued", updatedAt: at,
        runAfter: new Date(Date.now() + seconds * 1000).toISOString(), lastError: "Place extraction failed; retry scheduled." };
      return await settle(queued, "queued", null, null) ? "retrying" : "not_run";
    }
    const failed: AccountReelJob = { ...job, status: "failed", updatedAt: at,
      lastError: "Place extraction failed after 3 attempts." };
    return await settle(failed, "failed", "EXTRACTION_ERROR",
      "Place extraction failed after 3 attempts. Your original reel is still saved.") ? "failed" : "not_run";
  }
}

import {
  ClueListSchema,
  ProviderError,
  extractAndMapImagePlaces,
  extractAndMapPlaces,
  normalizeYouTubeUrl,
  YouTubeTranscriptError,
  type ExtractionInput,
} from "@reel/ai";
import type { Evidence, Inspiration, PlaceOption } from "@reel/contracts";
import { trackServer } from "../analytics";
import { config } from "../config";
import { assetStorage, repos } from "../db";
import type { ImportChanges, ImportLease } from "../db/types";
import { nowIso } from "../ids";
import { getProviders } from "../providers";
import { statusFromPlaces, upsertCandidate } from "../services/places";

/**
 * Import pipeline for one save (logic: Member 3, execution: Member 4).
 * extract clues -> validate -> optional provider lookup -> save candidates with evidence for confirmation.
 * When multimodal extraction is active on YouTube links or screenshots, uses unified multimodal observation.
 * Idempotent, so retries never duplicate places. Throw to let the job retry.
 */
export async function processImport(inspirationId: string, lease?: ImportLease): Promise<void> {
  const r = repos();
  const inspiration = await r.imports.transition(inspirationId, { status: "processing" }, nowIso(), lease);
  if (!inspiration) return;
  const trip = await r.trips.get(inspiration.tripId);
  if (!trip) return;

  const isScreenshotMultimodal =
    inspiration.sourceType === "screenshot" &&
    config.extractionWorkflow !== "legacy" &&
    config.aiProvider !== "fake";

  if (isScreenshotMultimodal) {
    const asset = inspiration.assetId ? await repos().assets.get(inspiration.assetId) : null;
    const bytes = asset ? await assetStorage().get(asset.id) : null;
    if (!asset || !bytes) {
      await finish(inspirationId, {
        status: "needs_input",
        failureCode: "IMAGE_UNREADABLE",
        failureMessage: "Screenshot image is missing or unavailable.",
      }, lease);
      return;
    }

    const { lookup } = getProviders();
    let result;
    try {
      result = await extractAndMapImagePlaces(
        { bytes, contentType: asset.contentType },
        {
          destination: trip.destination,
          geminiApiKey: process.env.GOOGLE_AI_API_KEY,
          geminiModel: process.env.GEMINI_IMAGE_MODEL || process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3.5-flash-lite",
          openaiApiKey: process.env.OPENAI_API_KEY,
          openaiModel: process.env.OPENAI_EXTRACTION_MODEL,
          googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
          lookup: lookup ?? undefined,
        },
      );
    } catch (err) {
      if (err instanceof ProviderError && (err.code === "IMAGE_UNREADABLE" || err.code === "EXTRACTION_ERROR")) {
        await finish(inspirationId, {
          status: "needs_input",
          failureCode: "IMAGE_UNREADABLE",
          failureMessage: "Could not read places from this screenshot. Add the place names as a note.",
        }, lease);
        return;
      }
      throw err;
    }

    if (!result.stops.length) {
      await finish(inspirationId, {
        status: "needs_input",
        failureCode: "NO_PLACES_FOUND",
        failureMessage: "No identifiable places found in the screenshot. Add the place name.",
        placeIds: [],
      }, lease);
      return;
    }

    if (!await r.imports.transition(inspirationId, {}, nowIso(), lease)) return;

    const unique = await saveStopsAsCandidates(trip.id, inspiration, result.stops);
    await finish(inspirationId, {
      status: await statusFromPlaces(unique),
      placeIds: unique,
      failureCode: null,
      failureMessage: null,
    }, lease);
    trackServer(inspiration.details ? "import_recovered" : "import_completed", {
      sourceType: inspiration.sourceType,
      places: unique.length,
    });
    return;
  }

  const isYouTubeLink =
    inspiration.sourceType === "link" &&
    Boolean(inspiration.url && normalizeYouTubeUrl(inspiration.url));

  // Delegate to legacy pipeline when explicitly configured, in unit tests,
  // for fake AI providers, for non-link sources (text notes, screenshots),
  // or when the traveler added details to recover a link: extract from what they typed.
  if (
    config.extractionWorkflow === "legacy" ||
    config.aiProvider !== "openai" ||
    (!isYouTubeLink && inspiration.sourceType !== "link") ||
    Boolean(inspiration.details?.trim())
  ) {
    return processImportLegacy(inspirationId, lease);
  }

  // Handle unsupported/inaccessible links (e.g. TikTok, Instagram)
  if (inspiration.sourceType === "link" && !isYouTubeLink) {
    await finish(inspirationId, {
      status: "needs_input",
      failureCode: "SOURCE_INACCESSIBLE",
      failureMessage: "We only support YouTube Shorts currently. Add details or upload screenshot.",
    }, lease);
    return;
  }

  // Multimodal extraction workflow
  const { lookup } = getProviders();
  let result;
  try {
    result = await extractAndMapPlaces(inspiration.url!, {
      destination: trip.destination,
      geminiApiKey: process.env.GOOGLE_AI_API_KEY,
      geminiModel: process.env.GEMINI_TRANSCRIPTION_MODEL,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_EXTRACTION_MODEL,
      googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      lookup: lookup ?? undefined,
    });
  } catch (err) {
    // Busy, rate-limited or slow providers throw to the job queue for a delayed retry.
    if (err instanceof YouTubeTranscriptError && err.code === "TRANSCRIPTION_FAILED") {
      await finish(inspirationId, {
        status: "needs_input",
        failureCode: "SOURCE_INACCESSIBLE",
        failureMessage: "Could not access or transcribe YouTube video content. Add places as text.",
      }, lease);
      return;
    }
    throw err;
  }

  if (!result.stops.length) {
    await finish(inspirationId, {
      status: "needs_input",
      failureCode: "NO_PLACES_FOUND",
      failureMessage: "No identifiable places. Add the place name.",
      placeIds: [],
    }, lease);
    return;
  }

  // Recheck after provider I/O, before persisting candidate output from an obsolete attempt.
  if (!await r.imports.transition(inspirationId, {}, nowIso(), lease)) return;

  // Stops past the lookup cap were not searched: save them unverified (null options), not as "not found".
  const unique = await saveStopsAsCandidates(trip.id, inspiration,
    result.stops.map((stop) => stop.status === "unverified" ? { ...stop, options: null } : stop));
  await finish(inspirationId, {
    status: await statusFromPlaces(unique),
    placeIds: unique,
    failureCode: null,
    failureMessage: null,
  }, lease);
  trackServer(inspiration.details ? "import_recovered" : "import_completed", {
    sourceType: inspiration.sourceType,
    places: unique.length,
  });
}

/**
 * Legacy import pipeline for one save (logic: Member 3, execution: Member 4).
 * extract clues -> validate -> look up each clue -> upsert candidate places with evidence.
 * Preserved for backward compatibility, testing, and non-video source types.
 */
export async function processImportLegacy(inspirationId: string, lease?: ImportLease): Promise<void> {
  const r = repos();
  const inspiration = await r.inspirations.get(inspirationId);
  if (!inspiration || inspiration.status === "skipped") return;
  const trip = await r.trips.get(inspiration.tripId);
  if (!trip) return;
  const { extractor, lookup } = getProviders();
  const result = await extractor.extract(await toExtractionInput(inspiration));

  if (result.status === "needs_input") {
    await finish(inspirationId, {
      status: "needs_input",
      failureCode: result.failureCode,
      failureMessage: result.message,
    }, lease);
    return;
  }

  // Model output is untrusted: malformed clues throw here and the job retries.
  const { clues } = ClueListSchema.parse({ clues: result.clues });
  if (!clues.length) {
    await finish(inspirationId, { status: "needs_input", failureCode: "NO_PLACES_FOUND", failureMessage: "No identifiable places. Add the place name.", placeIds: [] }, lease);
    return;
  }
  const placeIds: string[] = [];
  const keyFor = (clue: (typeof clues)[number]) => JSON.stringify([clue.query.trim().toLowerCase(), clue.hint?.trim().toLowerCase() ?? null]);
  if (lookup?.maxClues && new Set(clues.map(keyFor)).size > lookup.maxClues) {
    await finish(inspirationId, { status: "needs_input", failureCode: "LOOKUP_ERROR",
      failureMessage: `This import names too many places. Submit a shorter source with at most ${lookup.maxClues} places for location search.` }, lease);
    return;
  }
  // Repeated source passages can name the same place. Look up each query/hint once per attempt.
  const matches = new Map<string, PlaceOption[]>();
  for (const clue of clues) {
    const searchKey = keyFor(clue);
    let options: PlaceOption[] | null = null;
    if (lookup) {
      options = matches.get(searchKey) ?? await lookup.search(clue, { destination: trip.destination });
      matches.set(searchKey, options);
    }
    // Recheck after provider I/O, before persisting candidate output from an obsolete attempt.
    if (!await r.imports.transition(inspirationId, {}, nowIso(), lease)) return;
    const identity = clues.some(other => other.query.toLowerCase() === clue.query.toLowerCase() && other.hint !== clue.hint)
      ? `${clue.query} (${clue.hint ?? "unspecified area"})` : clue.query;
    const evidence: Evidence = {
      inspirationId,
      sourceType: inspiration.sourceType,
      clue: identity,
      hint: clue.hint,
      excerpt: clue.excerpt,
      ...(clue.classification ? { classification: clue.classification } : {}),
      extractedAt: nowIso(),
    };
    placeIds.push(await upsertCandidate(trip.id, identity, options, evidence));
  }

  const unique = [...new Set(placeIds)];
  await finish(inspirationId, {
    status: await statusFromPlaces(unique),
    placeIds: unique,
    failureCode: null,
    failureMessage: null,
  }, lease);
  trackServer(inspiration.details ? "import_recovered" : "import_completed", {
    sourceType: inspiration.sourceType,
    places: unique.length,
  });
}

/**
 * Save extracted stops as trip candidates with source evidence. Re-running with the same save adds no
 * duplicates. options null means no provider lookup ran. A source itinerary day is kept as a planning hint.
 */
export async function saveStopsAsCandidates(
  tripId: string,
  inspiration: Pick<Inspiration, "id" | "sourceType">,
  stops: Array<{ name: string; area_hint: string | null; excerpt: string | null; day_number?: number | null; options: PlaceOption[] | null }>,
): Promise<string[]> {
  const placeIds: string[] = [];
  for (const stop of stops) {
    const evidence: Evidence = {
      inspirationId: inspiration.id,
      sourceType: inspiration.sourceType,
      clue: stop.area_hint ? `${stop.name} (${stop.area_hint})` : stop.name,
      excerpt: stop.excerpt ?? null,
      ...(stop.day_number ? { sourceDay: stop.day_number } : {}),
      extractedAt: nowIso(),
    };
    placeIds.push(await upsertCandidate(tripId, stop.name, stop.options, evidence));
  }
  return [...new Set(placeIds)];
}

/** Conditional database patch preserves Skip and rejects obsolete worker attempts. */
async function finish(inspirationId: string, changes: ImportChanges, lease?: ImportLease): Promise<void> {
  await repos().imports.transition(inspirationId, changes, nowIso(), lease);
}

async function toExtractionInput(inspiration: Inspiration): Promise<ExtractionInput> {
  const extra = { note: inspiration.note, details: inspiration.details };
  switch (inspiration.sourceType) {
    case "text":
      return { sourceType: "text", text: inspiration.text ?? "", ...extra };
    case "link":
      return { sourceType: "link", url: inspiration.url ?? "", ...extra };
    case "screenshot": {
      const asset = inspiration.assetId ? await repos().assets.get(inspiration.assetId) : null;
      const bytes = asset ? await assetStorage().get(asset.id) : null;
      if (!asset || !bytes) throw new Error("Screenshot upload is missing.");
      return { sourceType: "screenshot", image: { bytes, contentType: asset.contentType }, ...extra };
    }
  }
}

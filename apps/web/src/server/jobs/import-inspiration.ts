import {
  ClueListSchema,
  extractAndMapPlaces,
  normalizeYouTubeUrl,
  YouTubeTranscriptError,
  type ExtractionInput,
} from "@reel/ai";
import type { Evidence, Inspiration } from "@reel/contracts";
import { trackServer } from "../analytics";
import { config } from "../config";
import { assetStorage, repos } from "../db";
import { nowIso } from "../ids";
import { getProviders } from "../providers";
import { statusFromPlaces, upsertCandidate } from "../services/places";

/**
 * Modern import pipeline: uses unified multimodal video + speech observation,
 * structured stop extraction, and Google Places API mapping.
 */
export async function processImport(inspirationId: string): Promise<void> {
  const r = repos();
  const inspiration = await r.inspirations.get(inspirationId);
  if (!inspiration || inspiration.status === "skipped") return;
  const trip = await r.trips.get(inspiration.tripId);
  if (!trip) return;

  const isYouTubeLink =
    inspiration.sourceType === "link" &&
    Boolean(inspiration.url && normalizeYouTubeUrl(inspiration.url));

  // Delegate to legacy pipeline when explicitly configured, in unit tests,
  // for fake AI providers, or for non-link sources (text notes, screenshots)
  if (
    config.extractionWorkflow === "legacy" ||
    config.aiProvider !== "openai" ||
    (!isYouTubeLink && inspiration.sourceType !== "link")
  ) {
    return processImportLegacy(inspirationId);
  }

  // Handle unsupported/inaccessible links (e.g. TikTok, Instagram)
  if (inspiration.sourceType === "link" && !isYouTubeLink) {
    await finish(inspirationId, {
      status: "needs_input",
      failureCode: "SOURCE_INACCESSIBLE",
      failureMessage: "Provide a supported YouTube video link, or supply transcript text instead.",
    });
    return;
  }

  // Multimodal extraction workflow
  await r.inspirations.update({
    ...inspiration,
    status: "processing",
    attempts: inspiration.attempts + 1,
    updatedAt: nowIso(),
  });

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
      lookup,
    });
  } catch (err) {
    if (err instanceof YouTubeTranscriptError && err.code === "TRANSCRIPTION_FAILED") {
      await finish(inspirationId, {
        status: "needs_input",
        failureCode: "SOURCE_INACCESSIBLE",
        failureMessage: "Could not access or transcribe YouTube video content. Add places as text.",
      });
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
    });
    return;
  }

  const placeIds: string[] = [];
  for (const stop of result.stops) {
    const identity = stop.name;
    const evidence: Evidence = {
      inspirationId,
      sourceType: inspiration.sourceType,
      clue: stop.area_hint ? `${stop.name} (${stop.area_hint})` : stop.name,
      excerpt: stop.excerpt ?? null,
      extractedAt: nowIso(),
    };
    placeIds.push(await upsertCandidate(trip.id, identity, stop.options, evidence));
  }

  const unique = [...new Set(placeIds)];
  await finish(inspirationId, {
    status: await statusFromPlaces(unique),
    placeIds: unique,
    failureCode: null,
    failureMessage: null,
  });
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
export async function processImportLegacy(inspirationId: string): Promise<void> {
  const r = repos();
  const inspiration = await r.inspirations.get(inspirationId);
  if (!inspiration || inspiration.status === "skipped") return;
  const trip = await r.trips.get(inspiration.tripId);
  if (!trip) return;

  await r.inspirations.update({
    ...inspiration,
    status: "processing",
    attempts: inspiration.attempts + 1,
    updatedAt: nowIso(),
  });

  const { extractor, lookup } = getProviders();
  const result = await extractor.extract(await toExtractionInput(inspiration));

  if (result.status === "needs_input") {
    await finish(inspirationId, {
      status: "needs_input",
      failureCode: result.failureCode,
      failureMessage: result.message,
    });
    return;
  }

  // Model output is untrusted: malformed clues throw here and the job retries.
  const { clues } = ClueListSchema.parse({ clues: result.clues });
  if (!clues.length) {
    await finish(inspirationId, {
      status: "needs_input",
      failureCode: "NO_PLACES_FOUND",
      failureMessage: "No identifiable places. Add the place name.",
      placeIds: [],
    });
    return;
  }
  const placeIds: string[] = [];
  for (const clue of clues) {
    const options = await lookup.search(clue, { destination: trip.destination });
    const identity = clues.some(
      (other) => other.query.toLowerCase() === clue.query.toLowerCase() && other.hint !== clue.hint,
    )
      ? `${clue.query} (${clue.hint ?? "unspecified area"})`
      : clue.query;
    const evidence: Evidence = {
      inspirationId,
      sourceType: inspiration.sourceType,
      clue: identity,
      excerpt: clue.excerpt,
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
  });
  trackServer(inspiration.details ? "import_recovered" : "import_completed", {
    sourceType: inspiration.sourceType,
    places: unique.length,
  });
}

export async function markImportQueued(inspirationId: string): Promise<void> {
  await finish(inspirationId, { status: "queued" });
}

export async function markImportFailed(inspirationId: string, attempts: number): Promise<void> {
  await finish(inspirationId, {
    status: "failed",
    failureCode: "EXTRACTION_ERROR",
    failureMessage: `Import failed after ${attempts} attempt(s). Retry, or add details.`,
  });
}

/** Re-reads first so a skip that happened while the job ran is not overwritten. */
async function finish(inspirationId: string, changes: Partial<Inspiration>): Promise<void> {
  const r = repos();
  const latest = await r.inspirations.get(inspirationId);
  if (!latest || latest.status === "skipped") return;
  await r.inspirations.update({ ...latest, ...changes, updatedAt: nowIso() });
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

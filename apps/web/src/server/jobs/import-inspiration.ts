import { ClueListSchema, type ExtractionInput } from "@reel/ai";
import type { Evidence, Inspiration } from "@reel/contracts";
import { trackServer } from "../analytics";
import { assetStorage, repos } from "../db";
import { nowIso } from "../ids";
import { getProviders } from "../providers";
import { statusFromPlaces, upsertCandidate } from "../services/places";

/**
 * Import pipeline for one save (logic: Member 3, execution: Member 4).
 * extract clues -> validate -> look up each clue -> upsert candidate places with evidence.
 * Idempotent, so retries never duplicate places. Throw to let the job retry.
 */
export async function processImport(inspirationId: string): Promise<void> {
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
  const placeIds: string[] = [];
  for (const clue of clues) {
    const options = await lookup.search(clue, { destination: trip.destination });
    const evidence: Evidence = {
      inspirationId,
      sourceType: inspiration.sourceType,
      clue: clue.query,
      excerpt: clue.excerpt,
      extractedAt: nowIso(),
    };
    placeIds.push(await upsertCandidate(trip.id, clue.query, options, evidence));
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

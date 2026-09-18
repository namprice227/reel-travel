import { ClueListSchema, type ExtractionInput } from "@reel/ai";
import type { Evidence, Inspiration, PlaceOption } from "@reel/contracts";
import { trackServer } from "../analytics";
import { assetStorage, repos } from "../db";
import type { ImportChanges, ImportLease } from "../db/types";
import { nowIso } from "../ids";
import { getProviders } from "../providers";
import { statusFromPlaces, upsertCandidate } from "../services/places";

/**
 * Import pipeline for one save (logic: Member 3, execution: Member 4).
 * extract clues -> validate -> optional provider lookup -> save candidates with evidence for confirmation.
 * Idempotent, so retries never duplicate places. Throw to let the job retry.
 */
export async function processImport(inspirationId: string, lease?: ImportLease): Promise<void> {
  const r = repos();
  const inspiration = await r.imports.transition(inspirationId, { status: "processing" }, nowIso(), lease);
  if (!inspiration) return;
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
  // Repeated source passages can name the same place. Look up each query/hint once per attempt.
  const matches = new Map<string, PlaceOption[]>();
  for (const clue of clues) {
    const searchKey = JSON.stringify([clue.query.trim().toLowerCase(), clue.hint?.trim().toLowerCase() ?? null]);
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

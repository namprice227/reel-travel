import { CandidatePlace, PlaceDetails, ProviderReview } from "@reel/contracts";

// Keep the exact database document for optimistic writes, including pre-default fields.
// Weak keys release snapshots when the request/worker finishes with a candidate.
const snapshots = new WeakMap<CandidatePlace, unknown>();
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Compatibility at the storage boundary only; new writes still use strict contracts. */
export function readStoredPlace(raw: unknown): CandidatePlace {
  const value: unknown = structuredClone(raw);
  function option(item: unknown) {
    if (!object(item) || !object(item.details)) return;
    const details = item.details;
    for (const key of ["websiteUrl", "providerUrl"] as const) {
      if (!PlaceDetails.shape[key].safeParse(details[key]).success) details[key] = null;
    }
    if (Array.isArray(details.reviews)) for (const review of details.reviews) {
      if (!object(review)) continue;
      for (const key of ["authorPhotoUrl", "googleMapsUri"] as const) {
        if (!ProviderReview.shape[key].safeParse(review[key]).success) review[key] = null;
      }
    }
  }
  if (object(value)) {
    if (Array.isArray(value.options)) value.options.forEach(option);
    option(value.selected);
  }
  const place = CandidatePlace.parse(value);
  snapshots.set(place, structuredClone(raw));
  return place;
}

export function storedPlaceSnapshot(place: CandidatePlace): unknown {
  return snapshots.get(place) ?? place;
}

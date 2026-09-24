import type { CandidatePlace, PlaceOption } from "@reel/contracts";
import type { PlannablePlace } from "./types";

export const DEFAULT_VISIT_MINUTES = 60;

/** A provider option can be used for routing without claiming the traveler confirmed it. */
export function toPlannablePlace(place: CandidatePlace, routeOption?: PlaceOption): PlannablePlace | null {
  const selected = routeOption ?? (place.status === "confirmed" ? place.selected : null);
  if (!selected) return null;
  return {
    placeId: place.id,
    providerPlaceId: selected.providerPlaceId,
    title: selected.name,
    location: selected.location,
    openingHours: selected.details.openingHours,
    visitMinutes: selected.details.typicalVisitMinutes ?? DEFAULT_VISIT_MINUTES,
    category: selected.details.category,
    priceLevel: selected.details.priceLevel,
    sourceInspirationIds: [...new Set(place.evidence.map((e) => e.inspirationId))],
    sourceDay: place.evidence.find((e) => e.sourceDay != null)?.sourceDay ?? null,
  };
}

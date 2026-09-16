import type { CandidatePlace } from "@reel/contracts";
import type { PlannablePlace } from "./types";

export const DEFAULT_VISIT_MINUTES = 60;

/** Only confirmed places reach the planner. */
export function toPlannablePlace(place: CandidatePlace): PlannablePlace | null {
  if (place.status !== "confirmed" || !place.selected) return null;
  const { selected } = place;
  return {
    placeId: place.id,
    title: selected.name,
    location: selected.location,
    openingHours: selected.details.openingHours,
    visitMinutes: selected.details.typicalVisitMinutes ?? DEFAULT_VISIT_MINUTES,
    category: selected.details.category,
    priceLevel: selected.details.priceLevel,
    sourceInspirationIds: [...new Set(place.evidence.map((e) => e.inspirationId))],
  };
}

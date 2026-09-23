import type { Reservation, TripPreferences } from "@reel/contracts";
import type { PlannablePlace } from "./types";

/** Changes whenever anything the planner reads changes. Used to mark an itinerary stale. */
export function planFingerprint(input: {
  destination?: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  preferences: TripPreferences;
  places: PlannablePlace[];
  selectionIds?: string[];
  reservations: Reservation[];
}): string {
  return fnv1a(
    stableStringify({
      // Existing saved plans must be regenerated to adopt explicit unknown-travel validation.
      plannerVersion: 3,
      dates: [input.startDate, input.endDate],
      destination: input.destination ?? null,
      timezone: input.timezone ?? null,
      preferences: input.preferences,
      ...(input.selectionIds === undefined ? {} : { selectionIds: [...input.selectionIds].sort() }),
      places: input.places.map((p) => [p.placeId, p.title, p.visitMinutes, p.location, p.openingHours,
        p.category ?? null, p.priceLevel ?? null, p.providerPlaceId ?? null, [...p.sourceInspirationIds].sort(),
        // Appended only when set, so plans without source-day hints keep their existing fingerprints.
        ...(p.sourceDay ? [p.sourceDay] : [])]).sort(compareJson),
      reservations: input.reservations.map((r) => [r.id, r.title, r.start, r.end, r.locked, r.placeId]).sort(compareJson),
    }),
  );
}

const compareJson = (a: unknown, b: unknown) => stableStringify(a).localeCompare(stableStringify(b));

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

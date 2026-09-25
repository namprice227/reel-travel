import type { AccountPlace, Trip } from "@reel/contracts";
import { destinationLocation } from "../library/library-model";
import { tripGroup } from "../../lib/trip-dates";

// Rules behind Home's detected-places popup, kept apart from the dialog so they can be tested.
// Places are already saved to the account when a reel is read; the popup decides which ones stay
// (unticked ones are removed) and, optionally, which trip receives copies of the ticked ones.

/** Where the ticked places go: nowhere beyond the library, a new trip, or an existing trip. */
export type Destination = { kind: "library" } | { kind: "new" } | { kind: "trip"; tripId: string };

export type TripChoice = { trip: Trip; sameCountry: boolean };

/** Most places in one reel share a country; that country decides which trips are marked as a fit. */
export function placesCountry(places: Pick<AccountPlace, "country">[]): string | null {
  const counts = new Map<string, number>();
  for (const place of places) if (place.country) counts.set(place.country.code, (counts.get(place.country.code) ?? 0) + 1);
  let best: string | null = null;
  for (const [code, count] of counts) if (best === null || count > counts.get(best)!) best = code;
  return best;
}

/** Trips that can still take places: not past, same-country trips first, then soonest. */
export function tripChoices(trips: Trip[], countryCode: string | null, today = new Date()): TripChoice[] {
  return trips
    .filter((trip) => tripGroup(trip, today) !== "past")
    .map((trip) => ({ trip, sameCountry: countryCode !== null && destinationLocation(trip.destination).countryId === countryCode }))
    .sort((a, b) => Number(b.sameCountry) - Number(a.sameCountry)
      || (a.trip.startDate ?? "9999").localeCompare(b.trip.startDate ?? "9999")
      || b.trip.updatedAt.localeCompare(a.trip.updatedAt));
}

/** Label for the confirm button, which must say what will happen. Null means nothing can be done yet. */
export function confirmLabel(ticked: number, total: number, destination: Destination): string | null {
  if (destination.kind !== "library") return ticked ? (destination.kind === "new" ? "Continue" : "Add") : null;
  if (ticked === 0) return total === 1 ? "Remove place" : "Remove all";
  return "Save to library";
}

/** A trip's selection after adding copies. Undefined selection means "confirmed places", matching the server. */
export function withAdded(selected: string[] | undefined, confirmed: string[], added: string[]): string[] {
  return [...new Set([...(selected ?? confirmed), ...added])].slice(0, 100);
}

import { dayStays, type Accommodation, type LatLng, type StayFit } from "@reel/contracts";
import { distanceKm } from "./travel";

/**
 * A trip destination as the Places provider knows it. `bounds` is the provider's viewport, which can be far larger
 * than the city (Google's "Tokyo" is the whole prefecture, islands included), so it is never enough on its own.
 */
export interface DestinationArea {
  center: LatLng;
  bounds: { south: number; west: number; north: number; east: number } | null;
  countryCode: string | null;
  /** Names the destination goes by, e.g. "Tokyo"; matched against the hotel's address parts. */
  names?: string[];
}

// Starting thresholds, not yet tuned against real trips. Straight-line km, independent of transport mode,
// because they answer "same city?" rather than "how long is the ride?".
/** Outside the destination, a hotel this close to its centre is a nearby town the traveler must accept; further is refused. */
export const STAY_NEARBY_KM = 40;
/** A hotel inside the provider viewport and this close to the centre counts as inside, even without a matching address name. */
export const STAY_CENTRE_RADIUS_KM = 15;
/** A stay whose median distance to the trip's places exceeds this is flagged as far from them. */
export const STAY_FAR_FROM_PLACES_KM = 15;
/** A day's first or last stop this far from where the traveler sleeps is flagged by validatePlan. */
export const STAY_FAR_STOP_KM = 25;

/**
 * Where a hotel sits against the destination. Another country is always refused. Inside means the hotel's provider
 * address names the destination (its town, district, prefecture or country), or it lies in the provider viewport
 * close to the centre. Otherwise distance from the centre decides between a nearby town and another city. Without a
 * destination area only the country can be checked. Every input is provider data, never model text.
 */
export function stayFit(
  hotel: { location: LatLng; countryCode: string | null; addressNames?: readonly string[] },
  area: DestinationArea | null,
  tripCountryCode: string | null,
): { fit: StayFit; distanceKm: number | null } {
  const fromCentre = area ? Math.round(distanceKm(hotel.location, area.center) * 10) / 10 : null;
  const country = tripCountryCode ?? area?.countryCode ?? null;
  if (country && hotel.countryCode && hotel.countryCode !== country) return { fit: "other_country", distanceKm: fromCentre };
  if (!area || fromCentre === null) return { fit: "unchecked", distanceKm: null };
  const named = new Set((area.names ?? []).map(placeName).filter(Boolean));
  const inside = (hotel.addressNames ?? []).some((n) => named.has(placeName(n)))
    || (withinBounds(hotel.location, area) && fromCentre <= STAY_CENTRE_RADIUS_KM);
  if (inside) return { fit: "inside", distanceKm: 0 };
  return { fit: fromCentre <= STAY_NEARBY_KM ? "nearby" : "elsewhere", distanceKm: fromCentre };
}

/** "Minato City", "Tokyo-to" and "Osaka Prefecture" compare as "minato", "tokyo" and "osaka". */
function placeName(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[-\s](city|prefecture|metropolis|province|shi|to|fu|ken)$/, "").trim();
}

function withinBounds(point: LatLng, area: DestinationArea): boolean {
  if (!area.bounds) return true;
  const { south, west, north, east } = area.bounds;
  // A viewport crossing the antimeridian has west > east.
  const insideLng = west <= east ? point.lng >= west && point.lng <= east : point.lng >= west || point.lng <= east;
  return point.lat >= south && point.lat <= north && insideLng;
}

/** Median straight-line km from a stay to the given places; null without a stay location or located places. */
export function stayDistanceToPlaces(stay: LatLng | null, places: readonly (LatLng | null)[]): number | null {
  if (!stay) return null;
  const km = places.flatMap((p) => (p ? [distanceKm(stay, p)] : [])).sort((a, b) => a - b);
  if (!km.length) return null;
  const mid = Math.floor(km.length / 2);
  return km.length % 2 ? km[mid]! : (km[mid - 1]! + km[mid]!) / 2;
}

/** Where the traveler is at the start of `date`: the stay slept in the night before. See dayStays. */
export const dayStartLocation = (stays: readonly Accommodation[], date: string): LatLng | null =>
  dayStays(stays, date).start?.location ?? null;
/** Where the traveler sleeps after `date`; null on the departure day. */
export const dayEndLocation = (stays: readonly Accommodation[], date: string): LatLng | null =>
  dayStays(stays, date).end?.location ?? null;

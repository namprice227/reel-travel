import {
  countryCodeFromName,
  SUPPORTED_COUNTRIES,
  type Accommodation,
  type StayPlace,
  type StaySearchResult,
  type StaySuggestion,
  type Trip,
  type User,
} from "@reel/contracts";
import type { StayLookup } from "@reel/ai";
import { stayFit, type DestinationArea } from "@reel/planner";
import { invalidState, notFound, validationFailed } from "../errors";
import { getStayLookup } from "../providers";
import { getOwnedTrip } from "./access";
import { enforceRateLimit } from "./rate-limits";

// ------------------------------------------------------------------ stays (F3, owner: Member 4)

/** Suggestions while the traveler types a stay: in the trip's country, biased to the destination. Nothing is saved. */
export async function suggestStays(user: User, tripId: string, input: string, sessionToken: string): Promise<{ suggestions: StaySuggestion[]; attribution: string }> {
  const trip = await getOwnedTrip(user, tripId);
  const lookup = requireLookup();
  // Keystrokes, not searches: a separate, looser limit than place search.
  await enforceRateLimit(`stay-suggest-minute:${user.id}`, { limit: 90, windowMs: 60_000 });
  await enforceRateLimit(`stay-suggest-day:${user.id}`, { limit: 1_500, windowMs: 86_400_000 });
  const area = await destinationArea(lookup, trip.destination);
  const found = await lookup.suggest(input.trim(), { area, countryCode: tripCountryCode(trip) ?? area?.countryCode ?? null, sessionToken });
  return {
    suggestions: found.map((s) => ({ ...s, name: s.name.slice(0, 300), secondary: s.secondary?.slice(0, 300) ?? null })),
    attribution: lookup.attribution,
  };
}

/** Provider facts and destination fit for one picked hotel. Nothing is saved. */
export async function checkStayPlace(user: User, tripId: string, providerPlaceId: string, sessionToken?: string): Promise<StaySearchResult> {
  const trip = await getOwnedTrip(user, tripId);
  const result = await checkedPlace(user, trip, requireLookup(), providerPlaceId, sessionToken);
  if (!result) throw notFound("That hotel is no longer available on the map. Pick another.");
  return result;
}

/**
 * Give linked stays provider facts before a trip is saved. A link is re-checked when it is new or changed, or
 * when the destination changed; the provider then supplies location, address, town and fit. Unchanged links
 * keep their saved facts. Whatever location or fit the browser sent for a linked stay is replaced, except that
 * fit="nearby" is how the traveler accepts a hotel just outside the destination.
 */
export async function resolveStayPlaces(user: User, before: Trip, next: Trip): Promise<Accommodation[]> {
  const stays = next.preferences.accommodations;
  if (!stays.some((s) => s.place)) return stays;
  const lookup = getStayLookup();
  const resolved: Accommodation[] = [];
  for (const [index, stay] of stays.entries()) {
    if (!stay.place) {
      resolved.push(stay);
      continue;
    }
    const saved = before.preferences.accommodations.find((s) => s.place?.providerPlaceId === stay.place!.providerPlaceId);
    if (saved?.place && saved.place.checkedFor === next.destination) {
      resolved.push({ ...stay, location: saved.location, place: saved.place });
      continue;
    }
    if (!lookup) {
      // Keep an existing link when the destination changed but nothing can re-check it; never accept a new one.
      if (!saved?.place) throw invalidState("Hotel search isn't set up here. Save the stay by name instead.");
      resolved.push({ ...stay, location: saved.location, place: { ...saved.place, fit: "unchecked", checkedFor: next.destination } });
      continue;
    }
    const path = `preferences.accommodations.${index}`;
    const match = await checkedPlace(user, next, lookup, stay.place.providerPlaceId);
    if (!match) throw validationFailed(`“${stay.name}” is no longer available on the map. Pick it again.`, [{ path, message: "Pick again" }]);
    const name = match.option.name;
    const where = match.locality ? `in ${match.locality}` : `${match.distanceKm ?? "far"} km away`;
    if (match.fit === "other_country") {
      throw validationFailed(`${name} is in another country. Choose a hotel in ${next.destination}.`, [{ path, message: "Another country" }]);
    }
    if (match.fit === "elsewhere") {
      throw validationFailed(`${name} is ${where}, not ${next.destination}. Choose a hotel in ${next.destination}.`, [{ path, message: "Another city" }]);
    }
    if (match.fit === "nearby" && stay.place.fit !== "nearby") {
      throw validationFailed(`${name} is ${match.distanceKm} km from ${next.destination}. Confirm the nearby town to use it.`, [{ path, message: "Confirm nearby town" }]);
    }
    const place: StayPlace = {
      provider: match.option.details.provider,
      providerPlaceId: match.option.providerPlaceId,
      query: stay.place.query,
      address: match.option.address,
      locality: match.locality?.slice(0, 120) ?? null,
      fit: match.fit,
      checkedFor: next.destination,
    };
    resolved.push({ ...stay, location: match.option.location, place });
  }
  return resolved;
}

function requireLookup(): StayLookup {
  const lookup = getStayLookup();
  if (!lookup) throw invalidState("Hotel search isn't set up here. Save the stay by name instead.");
  return lookup;
}

/** Shares place search's limits: each check is one or two paid provider calls. */
async function checkedPlace(user: User, trip: Trip, lookup: StayLookup, providerPlaceId: string, sessionToken?: string): Promise<StaySearchResult | null> {
  await enforceRateLimit(`place-search-minute:${user.id}`, { limit: 20, windowMs: 60_000 });
  await enforceRateLimit(`place-search-day:${user.id}`, { limit: 200, windowMs: 86_400_000 });
  const area = await destinationArea(lookup, trip.destination);
  const found = await lookup.details(providerPlaceId, sessionToken);
  if (!found) return null;
  return {
    option: found.option,
    locality: found.locality?.slice(0, 120) ?? null,
    ...stayFit({ location: found.option.location, countryCode: found.countryCode, addressNames: found.addressNames }, area, tripCountryCode(trip)),
  };
}

// Destination areas rarely change; remember a few per server instance to halve provider calls.
const areas = new Map<string, { area: DestinationArea | null; at: number }>();
const AREA_TTL_MS = 6 * 60 * 60_000;
async function destinationArea(lookup: StayLookup, destination: string): Promise<DestinationArea | null> {
  const key = destination.trim().toLowerCase();
  const cached = areas.get(key);
  if (cached && Date.now() - cached.at < AREA_TTL_MS) return cached.area;
  const area = await lookup.area(destination);
  if (areas.size >= 200) areas.delete(areas.keys().next().value!);
  areas.set(key, { area, at: Date.now() });
  return area;
}

/** Test hook: forget remembered destination areas. */
export const clearDestinationAreas = () => areas.clear();

/** The trip's country from its own fields: an explicit ", Country" suffix, else its supported-country timezone. */
export function tripCountryCode(trip: Pick<Trip, "destination" | "timezone">): string | null {
  const suffix = trip.destination.includes(",") ? countryCodeFromName(trip.destination.split(",").at(-1)!) : null;
  if (suffix) return suffix;
  const country = SUPPORTED_COUNTRIES.find((c) => c.timezone === trip.timezone);
  return country ? countryCodeFromName(country.name) : null;
}

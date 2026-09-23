import type { CandidatePlace, PlaceOption, Trip } from "@reel/contracts";

/** A missing selection field means a legacy trip still uses its confirmed places. */
export function selectedPlaceIds(trip: Trip, candidates: CandidatePlace[]): string[] {
  const available = new Set(candidates.filter((place) => place.status !== "rejected").map((place) => place.id));
  return (trip.selectedPlaceIds ?? candidates.filter((place) => place.status === "confirmed").map((place) => place.id))
    .filter((id) => available.has(id));
}

/**
 * Pick a provider location for planning without altering the traveler-confirmed match.
 * Source name/area and destination narrow the options; proximity to the other selected
 * venues and stays breaks plausible ties. The itinerary model then orders these venues.
 */
export function routeMatches(trip: Trip, candidates: CandidatePlace[]): {
  matches: Map<string, PlaceOption>;
  unresolvedPlaceIds: string[];
} {
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const chosen = selectedPlaceIds(trip, candidates)
    .map((id) => byId.get(id))
    .filter((place): place is CandidatePlace => Boolean(place && place.status !== "rejected"));
  const matches = new Map<string, PlaceOption>();
  const unresolvedPlaceIds: string[] = [];
  const stayLocations = trip.preferences.accommodations.flatMap((stay) => stay.location ? [stay.location] : []);
  const alternatives = new Map<string, PlaceOption[]>();

  for (const place of chosen) {
    if (place.status === "confirmed" && place.selected) {
      matches.set(place.id, place.selected);
      continue;
    }
    if (place.options.length === 0) {
      unresolvedPlaceIds.push(place.id);
      continue;
    }
    const identity = place.options.map((option) => ({ option, score: identityScore(place, option, trip.destination) }));
    const bestIdentity = Math.max(...identity.map((item) => item.score));
    const plausible = identity.filter((item) => item.score >= bestIdentity - 1).map((item) => item.option);
    alternatives.set(place.id, plausible);
    const ranked = plausible.map((option) => {
      const neighborCosts = chosen.filter((other) => other.id !== place.id).flatMap((other) => {
        const options = other.selected ? [other.selected] : other.options;
        return options.length ? [Math.min(...options.map((candidate) => distanceKm(option, candidate)))] : [];
      });
      const stayCosts = stayLocations.map((location) => distanceKm(option, { location }));
      return { option, hours: openingRank(option, trip), cost: [...neighborCosts, ...stayCosts].reduce((sum, km) => sum + Math.min(km, 100), 0) };
    }).sort((a, b) => a.hours - b.hours || a.cost - b.cost || a.option.providerPlaceId.localeCompare(b.option.providerPlaceId));
    matches.set(place.id, ranked[0]!.option);
  }

  // The first pass sees every branch as a possible neighbor. Refine against the
  // actual chosen cluster so two ambiguous clues do not drift to separate areas.
  for (let pass = 0; pass < 3; pass++) {
    for (const [placeId, options] of alternatives) {
      if (options.length < 2) continue;
      const anchors = [...matches].filter(([id]) => id !== placeId).map(([, option]) => option);
      const ranked = options.map((option) => ({
        option,
        hours: openingRank(option, trip),
        cost: [...anchors.map((anchor) => distanceKm(option, anchor)),
          ...stayLocations.map((location) => distanceKm(option, { location }))]
          .reduce((sum, km) => sum + Math.min(km, 100), 0),
      })).sort((a, b) => a.hours - b.hours || a.cost - b.cost || a.option.providerPlaceId.localeCompare(b.option.providerPlaceId));
      matches.set(placeId, ranked[0]!.option);
    }
  }
  return { matches, unresolvedPlaceIds };
}

/** Known opening windows on a trip day rank ahead of unknown hours and known closures. */
function openingRank(option: PlaceOption, trip: Trip): number {
  const hours = option.details.openingHours;
  if (hours.status !== "known" || !trip.startDate || !trip.endDate) return 1;
  for (let day = trip.startDate; day <= trip.endDate;) {
    const date = new Date(`${day}T12:00:00Z`);
    if (hours.windows.some((window) => window.day === date.getUTCDay())) return 0;
    date.setUTCDate(date.getUTCDate() + 1);
    day = date.toISOString().slice(0, 10);
  }
  return 2;
}

function tokens(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

function identityScore(place: CandidatePlace, option: PlaceOption, destination: string): number {
  const query = new Set(tokens(place.name));
  const title = new Set(tokens(option.name));
  const nameScore = query.size ? [...query].filter((word) => title.has(word)).length / query.size : 0;
  const locationText = `${option.name} ${option.address ?? ""}`.toLocaleLowerCase();
  const hints = place.evidence.map((item) => item.hint).filter((hint): hint is string => Boolean(hint));
  const hintScore = hints.some((hint) => tokens(hint).some((word) => locationText.includes(word))) ? 2 : 0;
  const destinationScore = tokens(destination).some((word) => locationText.includes(word)) ? 1 : 0;
  return nameScore * 5 + hintScore + destinationScore;
}

function distanceKm(a: { location: { lat: number; lng: number } }, b: { location: { lat: number; lng: number } }): number {
  const rad = Math.PI / 180;
  const lat = (b.location.lat - a.location.lat) * rad;
  const lng = (b.location.lng - a.location.lng) * rad;
  const haversine = Math.sin(lat / 2) ** 2
    + Math.cos(a.location.lat * rad) * Math.cos(b.location.lat * rad) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

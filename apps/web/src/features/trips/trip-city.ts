import { destinationLocation } from "../library/library-model";

// Browser-only checks around a trip's one city. Neither is validation: the server does not check city
// spelling or place locations yet, so these only warn the traveler and never block them.

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/**
 * Compare a typed city with the country's listed cities. `exact` ignores case and accents;
 * `suggestion` is the closest listed city within a small spelling distance ("Kyotto" -> "Kyoto").
 */
export function matchCity(typed: string, cities: string[]): { exact: string | null; suggestion: string | null } {
  const text = normalize(typed);
  if (!text) return { exact: null, suggestion: null };
  const exact = cities.find((city) => normalize(city) === text) ?? null;
  if (exact) return { exact, suggestion: null };
  let best: { city: string; distance: number } | null = null;
  for (const city of cities) {
    const distance = editDistance(text, normalize(city));
    if (distance <= Math.min(2, Math.max(1, Math.floor(city.length / 4))) && (!best || distance < best.distance)) best = { city, distance };
  }
  return { exact: null, suggestion: best?.city ?? null };
}

/**
 * The trip's city when every provider address found for a place leaves that city out, e.g. a Kyoto temple
 * in a Tokyo trip. Null when the place looks in the city, or when there is no address or city to compare.
 * A text check on provider addresses, so it can miss or misfire; it only warns the traveler.
 */
export function outsideTripCity(
  place: { selected?: { address: string | null } | null; options: Array<{ address: string | null }> },
  destination: string,
): string | null {
  const city = destinationLocation(destination).city;
  if (!city || !normalize(city)) return null;
  const addresses = (place.selected ? [place.selected] : place.options).flatMap((option) => option.address ? [normalize(option.address)] : []);
  if (!addresses.length) return null;
  const needle = normalize(city);
  return addresses.some((address) => address.includes(needle)) ? null : city;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

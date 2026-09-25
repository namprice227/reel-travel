import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { CountryCode } from "@reel/contracts";
import { invalidState } from "../errors";

type CityRecord = [geonameId: number, name: string, asciiName: string, region: string, population: number, aliases: string[], latitude: number, longitude: number];
type Catalog = { source: string; snapshotDate: string; countries: Record<string, CityRecord[]> };
export type CitySuggestion = { geonameId: number; name: string; region: string | null };
export type CityLocation = CitySuggestion & { asciiName: string; aliases: string[]; latitude: number; longitude: number };

let catalog: Catalog | null = null;

function cityCatalog(): Catalog {
  if (catalog) return catalog;
  const relative = path.join("src", "server", "data", "geonames-cities500.json.gz");
  const locations = [path.join(process.cwd(), relative), path.join(process.cwd(), "apps", "web", relative)];
  const file = locations.find((candidate) => fs.existsSync(candidate));
  if (!file) throw invalidState("City suggestions are unavailable right now.");
  try {
    catalog = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) as Catalog;
    return catalog;
  } catch {
    throw invalidState("City suggestions are unavailable right now.");
  }
}

const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "")
  .toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function findCityCatalog(countryCode: CountryCode, geonameId: number): CityLocation | null {
  const city = cityCatalog().countries[countryCode]?.find((item) => item[0] === geonameId);
  return city ? { geonameId: city[0], name: city[1], region: city[3] || null,
    asciiName: city[2], aliases: city[5], latitude: city[6], longitude: city[7] } : null;
}

function nameRank(city: CityRecord, query: string): number {
  const names = [city[1], city[2]].map(normalize);
  if (names.some((name) => name === query)) return 0;
  if (names.some((name) => name.startsWith(query))) return 1;
  if (names.some((name) => name.split(" ").some((part) => part.startsWith(query)))) return 2;
  if (names.some((name) => name.includes(query))) return 5;
  return 99;
}

const order = (a: { city: CityRecord; rank: number }, b: { city: CityRecord; rank: number }) =>
  a.rank - b.rank || b.city[4] - a.city[4] || a.city[1].localeCompare(b.city[1]);

/** ISO country keys from GeoNames; results stay suggestions until Google verifies trip creation. */
export function searchCityCatalog(countryCode: CountryCode, text: string, limit = 8): CitySuggestion[] {
  const [cityText, regionText] = text.split(",", 2);
  const query = normalize(cityText ?? "");
  const regionQuery = normalize(regionText ?? "");
  if (query.length < 2) return [];
  const cities = (cityCatalog().countries[countryCode] ?? [])
    .filter((city) => !regionQuery || normalize(city[3]).includes(regionQuery));
  const named = cities.map((city) => ({ city, rank: nameRank(city, query) })).filter(({ rank }) => rank < 99);
  // Most keystrokes already match enough city names. Search aliases only when needed.
  const aliases = named.length >= limit ? [] : cities.filter((city) => nameRank(city, query) === 99)
    .map((city) => ({ city, rank: city[5].some((alias) => normalize(alias) === query) ? 3
      : city[5].some((alias) => normalize(alias).startsWith(query)) ? 4 : 99 }))
    .filter(({ rank }) => rank < 99);
  return [...named, ...aliases]
    .sort(order)
    .slice(0, limit)
    .map(({ city }) => ({ geonameId: city[0], name: city[1], region: city[3] || null }));
}

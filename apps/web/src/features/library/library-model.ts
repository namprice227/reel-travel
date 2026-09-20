import { countryCodes, countryName, countryAliases } from "@reel/contracts";
import type { CandidatePlace, Inspiration, Trip } from "@reel/contracts";
import { sourceLabels } from "../places/source-labels";

export const CATEGORIES = ["Food & drink", "Attractions", "Nature", "Shopping", "Stays", "Other", "Unsorted"] as const;
export type LibraryCategory = (typeof CATEGORIES)[number];
export interface TripSaves {
  inspirations: Inspiration[];
  places: CandidatePlace[];
}
export interface LibraryLocation {
  countryId: string;
  country: string;
  city: string | null;
}
export interface SaveItem {
  trip: Trip;
  save: Inspiration;
  places: CandidatePlace[];
  location: LibraryLocation;
  locations: LibraryLocation[];
  categories: LibraryCategory[];
  title: string;
  sample: boolean;
  needsReview: boolean;
}

// Transitional destination lookup, not AI/geocoding. Match whole names only. Explicit country
// suffixes take precedence; unknown/ambiguous destinations stay visible in Unsorted.
const CITIES: Record<string, string> = {
  tokyo: "JP",
  kyoto: "JP",
  osaka: "JP",
  sapporo: "JP",
  fukuoka: "JP",
  nara: "JP",
  seoul: "KR",
  busan: "KR",
  jeju: "KR",
  bangkok: "TH",
  phuket: "TH",
  "chiang mai": "TH",
  singapore: "SG",
  hanoi: "VN",
  "ho chi minh city": "VN",
  "da nang": "VN",
  "kuala lumpur": "MY",
  penang: "MY",
  bali: "ID",
  jakarta: "ID",
  manila: "PH",
  taipei: "TW",
  beijing: "CN",
  shanghai: "CN",
  "hong kong": "HK",
  london: "GB",
  paris: "FR",
  rome: "IT",
  florence: "IT",
  venice: "IT",
  barcelona: "ES",
  madrid: "ES",
  lisbon: "PT",
  amsterdam: "NL",
  berlin: "DE",
  sydney: "AU",
  melbourne: "AU",
  auckland: "NZ",
  "new york": "US",
  "los angeles": "US",
};
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
const countryNames = new Map(countryCodes.flatMap(code => [
  [normalize(countryName(code)), code], [code.toLowerCase(), code],
]));
for (const [alias, code] of Object.entries(countryAliases)) countryNames.set(alias, code);

export function destinationLocation(destination: string): LibraryLocation {
  const parts = destination
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const explicit = countryNames.get(normalize(parts.at(-1) ?? ""));
  const inferred = parts.length === 1 ? CITIES[normalize(destination)] : undefined;
  const code = explicit ?? inferred;
  if (!code) return { countryId: "unsorted", country: "Unsorted", city: destination.trim() || null };
  const city = explicit ? parts.slice(0, -1).join(", ") || null : destination.trim();
  return { countryId: code, country: regionNames.of(code)!, city };
}

const CATEGORY_MAP: Record<string, LibraryCategory> = {
  restaurant: "Food & drink",
  cafe: "Food & drink",
  bar: "Food & drink",
  food: "Food & drink",
  bakery: "Food & drink",
  temple: "Attractions",
  shrine: "Attractions",
  museum: "Attractions",
  viewpoint: "Attractions",
  attraction: "Attractions",
  tourist_attraction: "Attractions",
  entertainment: "Attractions",
  park: "Nature",
  garden: "Nature",
  beach: "Nature",
  nature: "Nature",
  shopping: "Shopping",
  shop: "Shopping",
  shopping_mall: "Shopping",
  store: "Shopping",
  hotel: "Stays",
  lodging: "Stays",
  accommodation: "Stays",
};

export function placeCategories(places: CandidatePlace[], inspirationId?: string): LibraryCategory[] {
  const categories = new Set<LibraryCategory>();
  for (const place of places.filter((p) => p.status !== "rejected")) {
    const labels = sourceLabels(place, inspirationId);
    if (labels.present) {
      for (const category of labels.categories) categories.add(category);
      if (!labels.categories.length) categories.add("Unsorted");
      continue;
    }
    // All plausible matches contribute categories. Choosing a tab never confirms a branch.
    const options = place.selected ? [place.selected] : place.options;
    for (const option of options) {
      const category = option.details.category?.trim().toLowerCase();
      if (!category) continue;
      if (category === "market") {
        categories.add("Food & drink");
        categories.add("Shopping");
      } else categories.add(CATEGORY_MAP[category] ?? CATEGORIES.find((c) => c.toLowerCase() === category) ?? "Other");
    }
  }
  return categories.size ? CATEGORIES.filter((c) => categories.has(c)) : ["Unsorted"];
}

export function buildLibrary(trips: Trip[], data: Record<string, TripSaves>): SaveItem[] {
  return trips
    .flatMap((trip) => {
      const records = data[trip.id];
      if (!records) return [];
      const byId = new Map(records.places.map((p) => [p.id, p]));
      return records.inspirations.map((save): SaveItem => {
        const places = save.placeIds.map((id) => byId.get(id)).filter((p): p is CandidatePlace => Boolean(p));
        const labels = places.filter(p => p.status !== "rejected").map(p => sourceLabels(p, save.id));
        const locations: LibraryLocation[] = labels.some(label => label.present)
          ? [...new Set(labels.map(label => label.countryCode ?? "unsorted"))].map(code => ({
            countryId: code, country: code === "unsorted" ? "Unsorted" : countryName(code), city: null,
          }))
          : [destinationLocation(trip.destination)]; // Legacy records retain their existing organization.
        const location = locations.length === 1 ? locations[0]!
          : { countryId: "multiple", country: "Multiple countries", city: null };
        const names = places.filter((p) => p.status !== "rejected").map((p) => p.name);
        const title = names.length
          ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`
          : save.text || save.note || save.url?.replace(/^https?:\/\/(www\.)?/, "") || "Saved screenshot";
        return {
          trip,
          save,
          places,
          location,
          locations,
          categories: placeCategories(places, save.id),
          title,
          sample:
            places.some((p) => [p.selected, ...p.options].some((o) => o?.details.provider === "fixture")) ||
            /sample data|synthetic/i.test(trip.title),
          needsReview:
            locations.some(location => location.countryId === "unsorted") || ["needs_input", "failed", "needs_confirmation"].includes(save.status),
        };
      });
    })
    .sort((a, b) => b.save.createdAt.localeCompare(a.save.createdAt));
}

export function matchesQuery(item: SaveItem, query: string): boolean {
  const needle = normalize(query);
  return (
    !needle ||
    [
      item.title,
      item.save.text,
      item.save.note,
      item.save.details,
      item.save.url,
      item.trip.title,
      item.trip.destination,
      item.location.country,
      ...item.locations.map(location => location.country),
      ...item.categories,
      ...item.places.map((p) => p.name),
    ].some((value) => value && normalize(value).includes(needle))
  );
}

export function countryAlbums(items: SaveItem[]) {
  const albums = new Map<string, { id: string; name: string; cities: string[]; items: SaveItem[] }>();
  for (const item of items) {
    for (const location of item.locations) {
      const { countryId, country, city } = location;
      const album = albums.get(countryId) ?? { id: countryId, name: country, cities: [], items: [] };
      if (city && !album.cities.some((c) => normalize(c) === normalize(city))) album.cities.push(city);
      // Keep a multi-country save in each relevant album, but filter categories to that country's places.
      const places = item.locations.length > 1 ? item.places.filter(place => place.status !== "rejected"
        && (sourceLabels(place, item.save.id).countryCode ?? "unsorted") === countryId) : item.places;
      album.items.push({ ...item, location, places, categories: placeCategories(places, item.save.id) });
      albums.set(countryId, album);
    }
  }
  return [...albums.values()].sort((a, b) =>
    a.id === "unsorted" ? 1 : b.id === "unsorted" ? -1 : a.name.localeCompare(b.name),
  );
}

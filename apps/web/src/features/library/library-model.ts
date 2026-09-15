import type { CandidatePlace, Inspiration, Trip } from "@reel/contracts";

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
const REGIONS =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
const countryNames = new Map(
  REGIONS.flatMap((code) => [
    [normalize(regionNames.of(code)!), code],
    [code.toLowerCase(), code],
  ]),
);
for (const [alias, code] of Object.entries({
  usa: "US",
  "united states of america": "US",
  uk: "GB",
  "south korea": "KR",
  vietnam: "VN",
  turkey: "TR",
}))
  countryNames.set(alias, code);

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

export function placeCategories(places: CandidatePlace[]): LibraryCategory[] {
  const categories = new Set<LibraryCategory>();
  for (const place of places.filter((p) => p.status !== "rejected")) {
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
      const location = destinationLocation(trip.destination);
      return records.inspirations.map((save): SaveItem => {
        const places = save.placeIds.map((id) => byId.get(id)).filter((p): p is CandidatePlace => Boolean(p));
        const names = places.filter((p) => p.status !== "rejected").map((p) => p.name);
        const title = names.length
          ? `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`
          : save.text || save.note || save.url?.replace(/^https?:\/\/(www\.)?/, "") || "Saved screenshot";
        return {
          trip,
          save,
          places,
          location,
          categories: placeCategories(places),
          title,
          sample:
            places.some((p) => [p.selected, ...p.options].some((o) => o?.details.provider === "fixture")) ||
            /sample data|synthetic/i.test(trip.title),
          needsReview:
            location.countryId === "unsorted" || ["needs_input", "failed", "needs_confirmation"].includes(save.status),
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
      ...item.categories,
      ...item.places.map((p) => p.name),
    ].some((value) => value && normalize(value).includes(needle))
  );
}

export function countryAlbums(items: SaveItem[]) {
  const albums = new Map<string, { id: string; name: string; cities: string[]; items: SaveItem[] }>();
  for (const item of items) {
    const { countryId, country, city } = item.location;
    const album = albums.get(countryId) ?? { id: countryId, name: country, cities: [], items: [] };
    if (city && !album.cities.some((c) => normalize(c) === normalize(city))) album.cities.push(city);
    album.items.push(item);
    albums.set(countryId, album);
  }
  return [...albums.values()].sort((a, b) =>
    a.id === "unsorted" ? 1 : b.id === "unsorted" ? -1 : a.name.localeCompare(b.name),
  );
}

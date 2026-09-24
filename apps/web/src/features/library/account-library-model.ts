import { countryName, type AccountPlace, type AccountReel } from "@reel/contracts";

export type AccountLibraryPlace = AccountPlace & {
  countryId: string;
  countryName: string;
  categoryLabel: string;
  source: AccountReel;
  originTripId?: string;
  confirmed?: boolean;
};

export type AccountCountryAlbum = {
  id: string;
  name: string;
  places: AccountLibraryPlace[];
  areas: string[];
};

const FOOD = /cafe|coffee|restaurant|food|bar|bakery|dessert|ramen|noodle|market/i;
const NATURE = /park|garden|nature|beach|mountain|trail|lake/i;
const SHOPPING = /shop|shopping|store|boutique|mall/i;
const STAYS = /hotel|hostel|stay|resort|lodging/i;

export function accountPlaceCategory(category: string | null): string {
  if (!category) return "Other";
  if (FOOD.test(category)) return "Food & drink";
  if (NATURE.test(category)) return "Nature";
  if (SHOPPING.test(category)) return "Shopping";
  if (STAYS.test(category)) return "Stays";
  return /museum|temple|shrine|attraction|viewpoint|landmark|entertainment/i.test(category)
    ? "Attractions"
    : "Other";
}

export function buildAccountLibrary(reels: AccountReel[], places: Array<AccountPlace & { originTripId?: string; confirmed?: boolean }>): AccountCountryAlbum[] {
  const sources = new Map(reels.map((reel) => [reel.id, reel]));
  const albums = new Map<string, AccountCountryAlbum>();
  for (const place of places) {
    const source = sources.get(place.reelId);
    if (!source) continue;
    const countryId = place.country?.code ?? "unknown";
    const name = place.country ? countryName(place.country.code) : "Unknown country";
    const item: AccountLibraryPlace = { ...place, countryId, countryName: name,
      categoryLabel: accountPlaceCategory(place.category), source };
    const album = albums.get(countryId) ?? { id: countryId, name, places: [], areas: [] };
    album.places.push(item);
    if (place.area && !album.areas.includes(place.area)) album.areas.push(place.area);
    albums.set(countryId, album);
  }
  for (const album of albums.values()) {
    album.places.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
    album.areas.sort((a, b) => a.localeCompare(b));
  }
  return [...albums.values()].sort((a, b) =>
    a.id === "unknown" ? 1 : b.id === "unknown" ? -1 : a.name.localeCompare(b.name),
  );
}

export function matchesAccountPlace(place: AccountLibraryPlace, query: string, category: string): boolean {
  if (category !== "All" && place.categoryLabel !== category) return false;
  const needle = query.trim().toLocaleLowerCase("en");
  return !needle || [place.name, place.area, place.category, place.excerpt, place.countryName,
    ...place.options.flatMap((option) => [option.name, option.address])]
    .filter(Boolean).some((value) => value!.toLocaleLowerCase("en").includes(needle));
}

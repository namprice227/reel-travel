import type { LatLng, OpeningHours } from "@reel/contracts";

/**
 * SYNTHETIC development data. Venue names and hours are fictional; coordinates are
 * real Tokyo neighbourhoods so the map looks plausible. Replace with a real provider
 * once DEC-03 (pilot city) and DEC-05 (place provider) are decided. Never demo these as real.
 */
export interface FixturePlace {
  providerPlaceId: string;
  name: string;
  /** Branches of one venue share a group name. */
  group: string;
  /** Lower-case phrases that identify the group in text. */
  aliases: string[];
  /** Lower-case words that pick this branch. */
  branchHints: string[];
  address: string;
  location: LatLng;
  category: string;
  openingHours: OpeningHours;
  typicalVisitMinutes: number | null;
  priceLevel: number | null;
}

export const FIXTURE_DESTINATION = "Tokyo";
export const FIXTURE_TIMEZONE = "Asia/Tokyo";
export const FIXTURE_ATTRIBUTION = "Synthetic fixture: fictional venue and hours, not real data";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const daily = (open: string, close: string): OpeningHours => ({
  status: "known",
  windows: ALL_DAYS.map((day) => ({ day, open, close })),
});
const closedOn = (closed: number[], open: string, close: string): OpeningHours => ({
  status: "known",
  windows: ALL_DAYS.filter((day) => !closed.includes(day)).map((day) => ({ day, open, close })),
});
const unknownHours: OpeningHours = { status: "unknown" };

const single = (place: Omit<FixturePlace, "group" | "branchHints">): FixturePlace => ({
  ...place,
  group: place.name,
  branchHints: [],
});

export const fixturePlaces: FixturePlace[] = [
  single({
    providerPlaceId: "fx-lantern-temple",
    name: "Asakusa Lantern Temple",
    aliases: ["lantern temple"],
    address: "Asakusa, Taito (synthetic)",
    location: { lat: 35.7148, lng: 139.7967 },
    category: "temple",
    openingHours: daily("06:00", "17:00"),
    typicalVisitMinutes: 60,
    priceLevel: 0,
  }),
  single({
    providerPlaceId: "fx-sky-deck",
    name: "Sumida Sky Deck",
    aliases: ["sky deck"],
    address: "Oshiage, Sumida (synthetic)",
    location: { lat: 35.7101, lng: 139.8107 },
    category: "viewpoint",
    openingHours: daily("10:00", "21:00"),
    typicalVisitMinutes: 90,
    priceLevel: 2,
  }),
  single({
    providerPlaceId: "fx-forest-shrine",
    name: "Harajuku Forest Shrine",
    aliases: ["forest shrine"],
    address: "Yoyogi, Shibuya (synthetic)",
    location: { lat: 35.6764, lng: 139.6993 },
    category: "shrine",
    openingHours: unknownHours,
    typicalVisitMinutes: 45,
    priceLevel: null,
  }),
  single({
    providerPlaceId: "fx-scramble-lookout",
    name: "Shibuya Scramble Lookout",
    aliases: ["scramble lookout"],
    address: "Dogenzaka, Shibuya (synthetic)",
    location: { lat: 35.6595, lng: 139.7005 },
    category: "viewpoint",
    openingHours: daily("10:00", "22:30"),
    typicalVisitMinutes: 45,
    priceLevel: 2,
  }),
  single({
    providerPlaceId: "fx-light-museum",
    name: "Toyosu Light Museum",
    aliases: ["light museum"],
    address: "Toyosu, Koto (synthetic)",
    location: { lat: 35.6491, lng: 139.7898 },
    category: "museum",
    openingHours: daily("09:00", "21:00"),
    typicalVisitMinutes: 120,
    priceLevel: 3,
  }),
  single({
    providerPlaceId: "fx-morning-market",
    name: "Tsukiji Morning Market",
    aliases: ["morning market"],
    address: "Tsukiji, Chuo (synthetic)",
    location: { lat: 35.6655, lng: 139.7707 },
    category: "market",
    openingHours: closedOn([3], "06:00", "14:00"),
    typicalVisitMinutes: 90,
    priceLevel: 1,
  }),
  single({
    providerPlaceId: "fx-garden-park",
    name: "Ueno Garden Park",
    aliases: ["garden park"],
    address: "Ueno, Taito (synthetic)",
    location: { lat: 35.7156, lng: 139.7745 },
    category: "park",
    openingHours: unknownHours,
    typicalVisitMinutes: 60,
    priceLevel: null,
  }),
  single({
    providerPlaceId: "fx-botanical-garden",
    name: "Shinjuku Botanical Garden",
    aliases: ["botanical garden"],
    address: "Naitomachi, Shinjuku (synthetic)",
    location: { lat: 35.6852, lng: 139.7101 },
    category: "garden",
    openingHours: closedOn([1], "09:00", "16:30"),
    typicalVisitMinutes: 90,
    priceLevel: 1,
  }),
  single({
    providerPlaceId: "fx-retro-arcade",
    name: "Akihabara Retro Arcade",
    aliases: ["retro arcade"],
    address: "Sotokanda, Chiyoda (synthetic)",
    location: { lat: 35.6984, lng: 139.7731 },
    category: "entertainment",
    openingHours: daily("11:00", "23:00"),
    typicalVisitMinutes: 60,
    priceLevel: 1,
  }),
  single({
    providerPlaceId: "fx-memory-lane",
    name: "Memory Lane Yakitori",
    aliases: ["memory lane", "yakitori alley"],
    address: "Nishi-Shinjuku, Shinjuku (synthetic)",
    location: { lat: 35.6938, lng: 139.6995 },
    category: "restaurant",
    openingHours: daily("17:00", "23:30"),
    typicalVisitMinutes: 75,
    priceLevel: 2,
  }),
  {
    providerPlaceId: "fx-kumo-ramen-shibuya",
    name: "Kumo Ramen Shibuya",
    group: "Kumo Ramen",
    aliases: ["kumo ramen"],
    branchHints: ["shibuya"],
    address: "Jinnan, Shibuya (synthetic)",
    location: { lat: 35.6614, lng: 139.701 },
    category: "restaurant",
    openingHours: daily("11:00", "23:00"),
    typicalVisitMinutes: 45,
    priceLevel: 1,
  },
  {
    providerPlaceId: "fx-kumo-ramen-shinjuku",
    name: "Kumo Ramen Shinjuku",
    group: "Kumo Ramen",
    aliases: ["kumo ramen"],
    branchHints: ["shinjuku"],
    address: "Kabukicho, Shinjuku (synthetic)",
    location: { lat: 35.6905, lng: 139.702 },
    category: "restaurant",
    openingHours: daily("11:00", "23:00"),
    typicalVisitMinutes: 45,
    priceLevel: 1,
  },
  {
    providerPlaceId: "fx-hoshi-coffee-kiyosumi",
    name: "Hoshi Coffee Kiyosumi",
    group: "Hoshi Coffee",
    aliases: ["hoshi coffee"],
    branchHints: ["kiyosumi"],
    address: "Hirano, Koto (synthetic)",
    location: { lat: 35.68, lng: 139.8003 },
    category: "cafe",
    openingHours: daily("08:00", "19:00"),
    typicalVisitMinutes: 40,
    priceLevel: 1,
  },
  {
    providerPlaceId: "fx-hoshi-coffee-aoyama",
    name: "Hoshi Coffee Aoyama",
    group: "Hoshi Coffee",
    aliases: ["hoshi coffee"],
    branchHints: ["aoyama"],
    address: "Minami-Aoyama, Minato (synthetic)",
    location: { lat: 35.6651, lng: 139.7129 },
    category: "cafe",
    openingHours: daily("08:00", "19:00"),
    typicalVisitMinutes: 40,
    priceLevel: 1,
  },
  single({
    providerPlaceId: "fx-tower-observatory",
    name: "Minato Tower Observatory",
    aliases: ["tower observatory"],
    address: "Shibakoen, Minato (synthetic)",
    location: { lat: 35.6586, lng: 139.7454 },
    category: "viewpoint",
    openingHours: daily("09:00", "23:00"),
    typicalVisitMinutes: 60,
    priceLevel: 2,
  }),
  single({
    providerPlaceId: "fx-ginza-sushi",
    name: "Ginza Sushi Counter",
    aliases: ["sushi counter"],
    address: "Ginza, Chuo (synthetic)",
    location: { lat: 35.6717, lng: 139.765 },
    category: "restaurant",
    openingHours: closedOn([0], "18:00", "22:00"),
    typicalVisitMinutes: 90,
    priceLevel: 4,
  }),
  single({
    providerPlaceId: "fx-seaside-park",
    name: "Odaiba Seaside Park",
    aliases: ["seaside park"],
    address: "Daiba, Minato (synthetic)",
    location: { lat: 35.63, lng: 139.775 },
    category: "park",
    openingHours: unknownHours,
    typicalVisitMinutes: 60,
    priceLevel: null,
  }),
];

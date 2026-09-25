import type { PlaceOption } from "@reel/contracts";
import type { DestinationArea } from "@reel/planner";
import { FIXTURE_ATTRIBUTION } from "./gazetteer";
import type { StayLookup } from "./types";

/**
 * SYNTHETIC stand-in for Google hotel search. Every hotel and town below is fictional; coordinates are chosen
 * only to sit inside, just outside, far from, or in another country than the synthetic "Tokyo" box.
 * The area boxes are rough synthetic rectangles, not provider viewports.
 */
const FIXTURE_AREAS: Record<string, DestinationArea> = {
  tokyo: { center: { lat: 35.68, lng: 139.76 }, bounds: { south: 35.5, west: 139.5, north: 35.9, east: 139.95 }, countryCode: "JP", names: ["Tokyo"] },
  osaka: { center: { lat: 34.69, lng: 135.5 }, bounds: { south: 34.55, west: 135.35, north: 34.8, east: 135.65 }, countryCode: "JP", names: ["Osaka"] },
};

export const FIXTURE_STAYS: ReadonlyArray<{ id: string; name: string; locality: string; countryCode: string; lat: number; lng: number }> = [
  { id: "fixture-stay-central", name: "Synthetic Central Hotel", locality: "Tokyo", countryCode: "JP", lat: 35.69, lng: 139.7 },
  { id: "fixture-stay-harbour", name: "Synthetic Harbour Hotel", locality: "Synthetic Harbour Town", countryCode: "JP", lat: 35.44, lng: 139.64 },
  { id: "fixture-stay-riverside", name: "Synthetic Riverside Hotel", locality: "Synthetic River City", countryCode: "JP", lat: 34.69, lng: 135.5 },
  { id: "fixture-stay-overseas", name: "Synthetic Overseas Hotel", locality: "Synthetic Port City", countryCode: "KR", lat: 35.1, lng: 129.04 },
];

export function createFakeStayLookup(): StayLookup {
  return {
    attribution: FIXTURE_ATTRIBUTION,
    async area(destination) {
      return FIXTURE_AREAS[destination.split(",")[0]!.trim().toLowerCase()] ?? null;
    },
    async suggest(input) {
      const words = input.toLowerCase().split(/\s+/).filter(Boolean);
      return FIXTURE_STAYS
        .filter((s) => words.every((w) => s.name.toLowerCase().includes(w)))
        .map((s) => ({ providerPlaceId: s.id, name: s.name, secondary: `${s.locality} (synthetic)`, distanceKm: null }));
    },
    async details(providerPlaceId) {
      const s = FIXTURE_STAYS.find((stay) => stay.id === providerPlaceId);
      return s ? { option: option(s), countryCode: s.countryCode, locality: s.locality, addressNames: [s.locality] } : null;
    },
  };
}

function option(s: (typeof FIXTURE_STAYS)[number]): PlaceOption {
  return {
    providerPlaceId: s.id,
    name: s.name,
    address: `${s.locality} (synthetic address)`,
    location: { lat: s.lat, lng: s.lng },
    details: {
      provider: "fixture", providerPlaceId: s.id, fetchedAt: new Date().toISOString(), category: "Hotel",
      openingHours: { status: "unknown" }, typicalVisitMinutes: null, priceLevel: null,
      unknownFields: ["openingHours", "typicalVisitMinutes", "priceLevel", "photos", "summary", "rating", "phone", "websiteUrl", "reviews"],
      attribution: FIXTURE_ATTRIBUTION, photos: [], summary: null, rating: null, ratingCount: null, websiteUrl: null,
      providerUrl: null, phone: null, reviews: [], types: ["Hotel"], priceRange: null, dineIn: null, takeout: null,
      delivery: null, reservable: null, servesVegetarianFood: null, servesBeer: null, servesWine: null,
      outdoorSeating: null, goodForChildren: null, goodForGroups: null, restroom: null, paymentOptions: null,
      accessibilityOptions: null,
    },
  };
}

import type { PlaceOption } from "@reel/contracts";
import { FIXTURE_ATTRIBUTION, fixturePlaces, type FixturePlace } from "./gazetteer";
import type { PlaceClue, PlaceLookup } from "./types";

/** Stand-in for the real place provider (task BE03 / DEC-05). Searches the synthetic gazetteer only. */
export function createFakePlaceLookup(): PlaceLookup {
  return {
    async search(clue) {
      return lookupFixtures(clue);
    },
  };
}

export function lookupFixtures(clue: PlaceClue, now = new Date()): PlaceOption[] {
  const query = clue.query.trim().toLowerCase();
  let matches = fixturePlaces.filter((p) => p.group.toLowerCase() === query || p.name.toLowerCase() === query);
  if (clue.hint && matches.length > 1) {
    const hint = clue.hint.toLowerCase();
    const narrowed = matches.filter((p) => p.branchHints.includes(hint));
    if (narrowed.length > 0) matches = narrowed;
  }
  return matches.map((place) => toOption(place, now));
}

function toOption(place: FixturePlace, now: Date): PlaceOption {
  const unknownFields = [
    ...(place.openingHours.status === "unknown" ? ["openingHours"] : []),
    ...(place.priceLevel === null ? ["priceLevel"] : []),
    ...(place.typicalVisitMinutes === null ? ["typicalVisitMinutes"] : []),
    "photos",
    "summary",
    "rating",
    "phone",
    "websiteUrl",
    "reviews",
  ];
  return {
    providerPlaceId: place.providerPlaceId,
    name: place.name,
    address: place.address,
    location: place.location,
    details: {
      provider: "fixture",
      providerPlaceId: place.providerPlaceId,
      fetchedAt: now.toISOString(),
      category: place.category,
      openingHours: place.openingHours,
      typicalVisitMinutes: place.typicalVisitMinutes,
      priceLevel: place.priceLevel,
      unknownFields,
      attribution: FIXTURE_ATTRIBUTION,
      // Fictional venues have no photographs, summaries or reviews.
      photos: [],
      summary: null,
      rating: null,
      ratingCount: null,
      websiteUrl: null,
      providerUrl: null,
      phone: null,
      reviews: [],
    },
  };
}

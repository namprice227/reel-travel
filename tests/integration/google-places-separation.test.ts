import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { CandidatePlace, PlaceDetails, User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";
import { GOOGLE_PLACES_FIELDS, GOOGLE_PLACE_DETAILS_FIELDS } from "@reel/ai/real-providers";

const { detailsMock } = vi.hoisted(() => ({ detailsMock: vi.fn() }));
vi.mock("@reel/ai/real-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@reel/ai/real-providers")>();
  return {
    ...actual,
    getGooglePlaceDetails: detailsMock,
  };
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-details-"));
vi.stubEnv("REEL_DATA_DIR", dir);
vi.stubEnv("DATA_BACKEND", "file");

const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { getPlaceDetails, MAX_PLACE_DETAILS_CACHE_MS } = await import("../../apps/web/src/server/services/place-details");

let user: User, place: CandidatePlace;

const syntheticRichDetails: PlaceDetails = {
  provider: "google",
  providerPlaceId: "ChIJsynthetic_google_id",
  fetchedAt: new Date().toISOString(),
  category: "cafe",
  priceLevel: 2,
  priceRange: "Moderate",
  rating: 4.8,
  ratingCount: 320,
  summary: "Minimalist Japanese specialty coffee bar",
  typicalVisitMinutes: 45,
  websiteUrl: null,
  providerUrl: null,
  phone: null,
  openingHours: { status: "known", windows: [{ day: 1, open: "10:00", close: "18:00" }] },
  reviews: [
    {
      authorName: "Kenji Sato",
      rating: 5,
      text: "Best pour-over beans in Omotesando!",
      relativeTime: "2 days ago",
      authorPhotoUrl: null,
      googleMapsUri: null,
    },
  ],
  photos: [],
  types: ["cafe", "coffee_shop"],
  paymentOptions: { acceptsCreditCards: true, acceptsCashOnly: false, acceptsDebitCards: null, acceptsNfc: null },
  accessibilityOptions: null,
  dineIn: true,
  takeout: true,
  delivery: false,
  reservable: false,
  servesVegetarianFood: false,
  servesBeer: false,
  servesWine: false,
  goodForChildren: false,
  goodForGroups: true,
  restroom: true,
  outdoorSeating: false,
  attribution: "Data provided by Google Maps",
  unknownFields: [],
};

beforeEach(async () => {
  detailsMock.mockReset().mockResolvedValue(syntheticRichDetails);
  user = (await devSignIn({ email: `details-${crypto.randomUUID()}@example.test` })).user;
  const trip = await createTrip(user, {
    title: "Synthetic details test",
    destination: "Tokyo",
    timezone: "Asia/Tokyo",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
  });

  const option = structuredClone(placeFixtures.confirmed.selected!);
  option.providerPlaceId = "ChIJsynthetic_google_id";
  option.details = {
    ...option.details,
    provider: "google",
    providerPlaceId: "ChIJsynthetic_google_id",
    fetchedAt: new Date().toISOString(),
    rating: null,
    ratingCount: null,
    reviews: [],
    unknownFields: ["rating", "priceLevel", "reviews", "openingHours"],
  };

  place = {
    ...placeFixtures.confirmed,
    id: `place_${crypto.randomUUID()}`,
    tripId: trip.id,
    options: [option],
    selected: option,
  };
  await repos().places.insert(place);
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

it("keeps Text Search field mask strictly lightweight without expensive atmosphere fields", () => {
  const searchFields = GOOGLE_PLACES_FIELDS.split(",");
  expect(searchFields).toContain("places.id");
  expect(searchFields).toContain("places.displayName");
  expect(searchFields).toContain("places.formattedAddress");
  expect(searchFields).toContain("places.location");
  expect(searchFields).not.toContain("places.rating");
  expect(searchFields).not.toContain("places.reviews");
  expect(searchFields).not.toContain("places.regularOpeningHours");
  expect(searchFields).not.toContain("places.websiteUri");
  expect(searchFields).not.toContain("places.nationalPhoneNumber");
});

it("requests Atmosphere and Contact fields in on-demand GOOGLE_PLACE_DETAILS_FIELDS", () => {
  const detailsFields = GOOGLE_PLACE_DETAILS_FIELDS.split(",");
  expect(detailsFields).toContain("id");
  expect(detailsFields).toContain("rating");
  expect(detailsFields).toContain("reviews");
  expect(detailsFields).toContain("regularOpeningHours");
  expect(detailsFields).toContain("editorialSummary");
  expect(detailsFields).toContain("paymentOptions");
});

it("fetches details on demand and caches for subsequent requests within 30 days", async () => {
  const result1 = await getPlaceDetails(user, place.tripId, place.id, place.selected!.providerPlaceId);
  expect(result1?.rating).toBe(4.8);
  expect(result1?.reviews).toHaveLength(1);
  expect(detailsMock).toHaveBeenCalledTimes(1);

  const updatedPlace = await repos().places.get(place.id);
  expect(updatedPlace?.selected?.details.rating).toBe(4.8);

  const result2 = await getPlaceDetails(user, place.tripId, place.id, place.selected!.providerPlaceId);
  expect(result2?.rating).toBe(4.8);
  expect(detailsMock).toHaveBeenCalledTimes(1);
});

it("refreshes details when cache exceeds 30-day limit per Google ToS §3.2.3", async () => {
  const thirtyOneDaysAgo = new Date(Date.now() - (MAX_PLACE_DETAILS_CACHE_MS + 24 * 60 * 60 * 1000)).toISOString();
  place.selected!.details = {
    ...syntheticRichDetails,
    fetchedAt: thirtyOneDaysAgo,
  };
  await repos().places.update(place);

  const freshResult = await getPlaceDetails(user, place.tripId, place.id, place.selected!.providerPlaceId);
  expect(freshResult?.rating).toBe(4.8);
  expect(detailsMock).toHaveBeenCalledTimes(1);
});

it("rejects other users and non-existent provider IDs before any paid provider calls", async () => {
  const otherUser = (await devSignIn({ email: `other-${crypto.randomUUID()}@example.test` })).user;
  await expect(
    getPlaceDetails(otherUser, place.tripId, place.id, place.selected!.providerPlaceId),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  await expect(
    getPlaceDetails(user, place.tripId, place.id, "non_existent_provider_id"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect(detailsMock).not.toHaveBeenCalled();
});

it("never makes external Google calls for non-google providers", async () => {
  place.selected!.details.provider = "fixture";
  await repos().places.update(place);

  const fixtureResult = await getPlaceDetails(user, place.tripId, place.id, place.selected!.providerPlaceId);
  expect(fixtureResult?.provider).toBe("fixture");
  expect(detailsMock).not.toHaveBeenCalled();
});

it.each([["minute", 60, 60_000], ["day", 300, 86_400_000]] as const)(
  "enforces %s rate limits before calling Google Details",
  async (period, limit, windowMs) => {
    for (let i = 0; i < limit; i++) {
      await repos().rateLimits.consume(`place-details-${period}:${user.id}`, {
        now: Date.now(),
        limit,
        windowMs,
      });
    }
    await expect(
      getPlaceDetails(user, place.tripId, place.id, place.selected!.providerPlaceId),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(detailsMock).not.toHaveBeenCalled();
  },
);


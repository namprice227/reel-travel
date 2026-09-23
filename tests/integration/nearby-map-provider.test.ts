import { expect, it } from "vitest";
import { Stop } from "@reel/contracts";
// The web workspace typechecks this module with its JSX/path configuration.
const modulePath = "../../apps/web/src/features/itinerary/place-info";
const { infoFor } = await import(modulePath);

it("preserves Google provider identity for nearby suggestions in the provider-isolated map", () => {
  const stop = Stop.parse({
    id: "synthetic-lunch", kind: "meal", title: "Synthetic restaurant", placeId: null,
    reservationId: null, location: { lat: 35, lng: 139 }, start: "12:00", end: "12:45",
    locked: false, travelMinutesBefore: 5, hoursCheck: "open", sourceInspirationIds: [],
    suggestedArea: "Synthetic address",
    suggestedVenue: { provider: "google", providerPlaceId: "synthetic-google-id",
      fetchedAt: "2026-09-22T00:00:00Z", openingHours: { status: "unknown" },
      category: "restaurant", priceLevel: null, attribution: "Google Maps" },
  });
  expect(infoFor(stop, new Map())).toEqual({ provider: "google", attribution: "Google Maps", category: "restaurant", address: "Synthetic address" });
  expect(stop.placeId).toBeNull();
});

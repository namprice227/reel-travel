import { dayStays, defaultTripPreferences, type Accommodation, type TripPreferences } from "@reel/contracts";
import { describe, expect, it } from "vitest";
import { planFingerprint, retimeDay, stayDistanceToPlaces, stayFit, validatePlan, type DestinationArea, type PlannablePlace, type PlannerContext } from "./index";
import { placeStop } from "./stops";

// Synthetic coordinates: a box standing in for a destination city, and points at known offsets from it.
const area: DestinationArea = { center: { lat: 35.68, lng: 139.76 }, bounds: { south: 35.5, west: 139.5, north: 35.9, east: 139.95 }, countryCode: "JP" };
const inside = { lat: 35.69, lng: 139.7 };
const nearbyTown = { lat: 35.44, lng: 139.64 }; // ~7 km south of the box
const otherCity = { lat: 34.69, lng: 135.5 }; // ~400 km away

describe("stayFit", () => {
  it("accepts a hotel inside the destination area", () => {
    expect(stayFit({ location: inside, countryCode: "JP" }, area, "JP")).toEqual({ fit: "inside", distanceKm: 0 });
  });
  it("marks a hotel just outside the area as a nearby town", () => {
    const result = stayFit({ location: nearbyTown, countryCode: "JP" }, area, "JP");
    expect(result.fit).toBe("nearby");
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeLessThan(30);
  });
  it("refuses a hotel in another city", () => {
    expect(stayFit({ location: otherCity, countryCode: "JP" }, area, "JP").fit).toBe("elsewhere");
  });
  it("refuses a hotel in another country, even right beside the destination", () => {
    expect(stayFit({ location: inside, countryCode: "KR" }, area, "JP").fit).toBe("other_country");
    expect(stayFit({ location: inside, countryCode: "KR" }, null, "JP").fit).toBe("other_country");
  });
  it("uses the destination's own country when the trip's country is unknown", () => {
    expect(stayFit({ location: inside, countryCode: "KR" }, area, null).fit).toBe("other_country");
  });
  it("is unchecked without a destination area, and never guesses", () => {
    expect(stayFit({ location: otherCity, countryCode: "JP" }, null, "JP")).toEqual({ fit: "unchecked", distanceKm: null });
    expect(stayFit({ location: otherCity, countryCode: null }, null, null)).toEqual({ fit: "unchecked", distanceKm: null });
  });
  it("falls back to a radius around the centre when the provider gives no bounds", () => {
    const centreOnly = { ...area, bounds: null };
    expect(stayFit({ location: inside, countryCode: "JP" }, centreOnly, "JP").fit).toBe("inside");
    expect(stayFit({ location: otherCity, countryCode: "JP" }, centreOnly, "JP").fit).toBe("elsewhere");
  });
  // Google's "Tokyo" viewport is the whole prefecture, islands included; it contains Yokohama (live check, 2026-09-25).
  const prefecture: DestinationArea = { ...area, bounds: { south: 24, west: 136, north: 36, east: 154 }, names: ["Tokyo"] };
  it("does not treat a neighbouring city inside an oversized viewport as the destination", () => {
    const yokohama = stayFit({ location: nearbyTown, countryCode: "JP", addressNames: ["Yokohama", "Kanagawa", "Japan"] }, prefecture, "JP");
    expect(yokohama.fit).toBe("nearby");
    expect(yokohama.distanceKm).toBeGreaterThan(20);
  });
  it("accepts a hotel whose address names the destination, even far from its centre", () => {
    const west = { lat: 35.65, lng: 139.25 }; // ~46 km west of the centre, still in the prefecture
    expect(stayFit({ location: west, countryCode: "JP", addressNames: ["Hachioji", "Tokyo-to", "Japan"] }, prefecture, "JP").fit).toBe("inside");
    expect(stayFit({ location: west, countryCode: "JP", addressNames: ["Hachioji", "Japan"] }, prefecture, "JP").fit).toBe("elsewhere");
  });
  it("matches names across case, accents and suffixes, and a country-wide destination", () => {
    const osaka = { ...area, names: ["Osaka"] };
    expect(stayFit({ location: otherCity, countryCode: "JP", addressNames: ["Ōsaka Prefecture"] }, osaka, "JP").fit).toBe("inside");
    const japan = { ...area, names: ["Japan"] };
    expect(stayFit({ location: otherCity, countryCode: "JP", addressNames: ["Osaka", "Japan"] }, japan, "JP").fit).toBe("inside");
  });
  it("handles a viewport that crosses the antimeridian", () => {
    const pacific: DestinationArea = { center: { lat: -17, lng: 180 }, bounds: { south: -18, west: 179, north: -16, east: -179 }, countryCode: "FJ" };
    expect(stayFit({ location: { lat: -17, lng: -179.95 }, countryCode: "FJ" }, pacific, "FJ").fit).toBe("inside");
    expect(stayFit({ location: { lat: -17, lng: 170 }, countryCode: "FJ" }, pacific, "FJ").fit).toBe("elsewhere");
  });
});

describe("stayDistanceToPlaces", () => {
  it("takes the median over located places and ignores unlocated ones", () => {
    const km = stayDistanceToPlaces(inside, [inside, null, otherCity, inside]);
    expect(km).toBe(0);
    expect(stayDistanceToPlaces(inside, [otherCity, otherCity])).toBeGreaterThan(300);
    expect(stayDistanceToPlaces(null, [inside])).toBeNull();
    expect(stayDistanceToPlaces(inside, [null])).toBeNull();
  });
});

const stay = (name: string, location: Accommodation["location"], checkIn: string | null, checkOut: string | null): Accommodation =>
  ({ name, location, checkIn, checkOut });

describe("dayStays", () => {
  const stays = [stay("A", inside, "2026-10-01", "2026-10-01"), stay("B", nearbyTown, "2026-10-02", "2026-10-03")];
  it("starts a hotel-change day at last night's stay and ends it at tonight's", () => {
    expect(dayStays(stays, "2026-10-01")).toMatchObject({ start: { name: "A" }, end: { name: "A" } });
    expect(dayStays(stays, "2026-10-02")).toMatchObject({ start: { name: "A" }, end: { name: "B" } });
    expect(dayStays(stays, "2026-10-03")).toMatchObject({ start: { name: "B" }, end: { name: "B" } });
  });
  it("starts the departure day at the last hotel and ends it nowhere known", () => {
    expect(dayStays(stays, "2026-10-04")).toEqual({ start: expect.objectContaining({ name: "B" }), end: null });
  });
  it("keeps one undated hotel for every day", () => {
    const one = [stay("Only", inside, null, null)];
    expect(dayStays(one, "2026-10-01")).toMatchObject({ start: { name: "Only" }, end: { name: "Only" } });
  });
});

const place = (placeId: string, location: PlannablePlace["location"]): PlannablePlace => ({
  placeId, title: placeId, location, visitMinutes: 60, sourceInspirationIds: [`insp_${placeId}`],
  openingHours: { status: "known", windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "22:00" })) },
});
function context(accommodations: Accommodation[], places: PlannablePlace[]): PlannerContext {
  const preferences: TripPreferences = { ...defaultTripPreferences, accommodations };
  return { startDate: "2026-10-01", endDate: "2026-10-02", preferences, places, reservations: [] };
}

describe("FAR_FROM_STAY", () => {
  const near = place("near", inside);
  const far = place("far", otherCity);
  it("warns when a day's stops sit in another city from the hotel", () => {
    const ctx = context([stay("Synthetic hotel", inside, null, null)], [near, far]);
    const day = retimeDay({ date: "2026-10-01", stops: [placeStop(far, "far-stop", "2026-10-01", 600)] }, ctx);
    const { conflicts } = validatePlan([day], [], ctx);
    const far_ = conflicts.filter((c) => c.code === "FAR_FROM_STAY");
    // One stop is both first and last; it is reported once.
    expect(far_).toHaveLength(1);
    expect(far_[0]).toMatchObject({ severity: "warning", stopIds: ["far-stop"], date: "2026-10-01" });
    expect(far_[0]!.message).toContain("Synthetic hotel");
  });
  it("stays quiet for stops near the hotel and for trips without a located hotel", () => {
    const located = context([stay("Synthetic hotel", inside, null, null)], [near]);
    const nearDay = retimeDay({ date: "2026-10-01", stops: [placeStop(near, "near-stop", "2026-10-01", 600)] }, located);
    expect(validatePlan([nearDay], [], located).conflicts.some((c) => c.code === "FAR_FROM_STAY")).toBe(false);
    const unlocated = context([stay("Name only", null, null, null)], [far]);
    const farDay = retimeDay({ date: "2026-10-01", stops: [placeStop(far, "far-stop", "2026-10-01", 600)] }, unlocated);
    expect(validatePlan([farDay], [], unlocated).conflicts.some((c) => c.code === "FAR_FROM_STAY")).toBe(false);
  });
});

it("keeps the fingerprint of stays saved before linking, and changes it when a stay is linked", () => {
  const base = context([stay("Synthetic hotel", null, null, null)], []);
  const before = planFingerprint(base);
  // Parsing an old stored stay must not add a `place` key.
  expect(planFingerprint({ ...base, preferences: { ...base.preferences, accommodations: [{ name: "Synthetic hotel", location: null, checkIn: null, checkOut: null }] } })).toBe(before);
  const linked = context([{ ...stay("Synthetic hotel", inside, null, null), place: {
    provider: "fixture", providerPlaceId: "fixture-hotel", query: "synthetic hotel", address: null, locality: null, fit: "inside", checkedFor: "Tokyo",
  } }], []);
  expect(planFingerprint(linked)).not.toBe(before);
});

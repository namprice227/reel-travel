import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import type { Accommodation, StayPlace } from "@reel/contracts";

// SYNTHETIC: every hotel here comes from packages/ai/src/fake-stays.ts and is fictional. No network calls.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-stay-places-"));
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("REEL_DATA_DIR", directory);
vi.stubEnv("AI_PROVIDER", "fake");
vi.stubEnv("PLACES_PROVIDER", "fake");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const trips = await import("../../apps/web/src/server/services/trips");
const stays = await import("../../apps/web/src/server/services/stays");

afterEach(() => vi.stubEnv("PLACES_PROVIDER", "fake"));
afterAll(() => {
  if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("reel-stay-places-")) throw Error("Unsafe cleanup");
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture(destination = "Tokyo") {
  const user = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  const trip = await trips.createTrip(user, { title: "Synthetic stay", destination, timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-04" });
  return { user, trip };
}

/** What the browser sends after picking a result: its own guesses for everything the server must replace. */
const linked = (providerPlaceId: string, fit: StayPlace["fit"] = "inside", query = "synthetic hotel"): Accommodation => ({
  name: "My hotel", location: { lat: 0, lng: 0 }, checkIn: null, checkOut: null,
  place: { provider: "google", providerPlaceId, query, address: "Forged address", locality: "Forged town", fit, checkedFor: "Forged" },
});

const SESSION = "synthetic-session-1";

it("suggests hotels while typing, and checks a picked one against the destination", async () => {
  const { user, trip } = await fixture();
  const { suggestions, attribution } = await stays.suggestStays(user, trip.id, "synthetic hot", SESSION);
  expect(attribution).toMatch(/Synthetic fixture/);
  expect(suggestions.map((s) => s.providerPlaceId)).toEqual(["fixture-stay-central", "fixture-stay-harbour", "fixture-stay-riverside", "fixture-stay-overseas"]);
  expect((await stays.suggestStays(user, trip.id, "harbour", SESSION)).suggestions).toHaveLength(1);
  const results = await Promise.all(suggestions.map((s) => stays.checkStayPlace(user, trip.id, s.providerPlaceId, SESSION)));
  expect(Object.fromEntries(results.map((r) => [r.option.providerPlaceId, r.fit]))).toEqual({
    "fixture-stay-central": "inside",
    "fixture-stay-harbour": "nearby",
    "fixture-stay-riverside": "elsewhere",
    "fixture-stay-overseas": "other_country",
  });
  expect(results.find((r) => r.fit === "inside")!.distanceKm).toBe(0);
  expect(results.every((r) => r.option.details.provider === "fixture")).toBe(true);
});

it("links a hotel in the destination with provider facts, ignoring what the browser sent", async () => {
  const { user, trip } = await fixture();
  const saved = await trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-central")] } });
  const [stay] = saved.preferences.accommodations;
  expect(stay).toMatchObject({
    name: "My hotel",
    location: { lat: 35.69, lng: 139.7 },
    place: { provider: "fixture", providerPlaceId: "fixture-stay-central", address: "Tokyo (synthetic address)", locality: "Tokyo", fit: "inside", checkedFor: "Tokyo" },
  });
});

it("refuses a hotel in another city or another country and leaves the trip unchanged", async () => {
  const { user, trip } = await fixture();
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-riverside")] } }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("not Tokyo") });
  // Claiming "nearby" does not unlock a hotel in another city.
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-riverside", "nearby")] } }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-overseas", "nearby")] } }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("another country") });
  expect((await trips.getTrip(user, trip.id)).preferences.accommodations).toEqual([]);
});

it("needs the traveler to accept a nearby town", async () => {
  const { user, trip } = await fixture();
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-harbour")] } }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("km from Tokyo") });
  const saved = await trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-harbour", "nearby")] } });
  expect(saved.preferences.accommodations[0]!.place).toMatchObject({ fit: "nearby", locality: "Synthetic Harbour Town" });
});

it("rejects a place the provider no longer has", async () => {
  const { user, trip } = await fixture();
  await expect(stays.checkStayPlace(user, trip.id, "fixture-stay-gone")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-gone")] } }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("Pick it again") });
});

it("keeps an unchanged link without searching again, and never trusts a forged location for it", async () => {
  const { user, trip } = await fixture();
  const first = await trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-central")] } });
  // With no provider at all, a new link would fail; an unchanged one must not need a search.
  vi.stubEnv("PLACES_PROVIDER", "none");
  const resent = { ...first.preferences.accommodations[0]!, name: "Renamed", checkIn: "2026-10-01", checkOut: "2026-10-03", location: { lat: 1, lng: 1 } };
  const saved = await trips.updateTrip(user, trip.id, { preferences: { accommodations: [resent] } });
  expect(saved.preferences.accommodations[0]).toMatchObject({ name: "Renamed", location: { lat: 35.69, lng: 139.7 }, checkIn: "2026-10-01" });
});

it("re-checks linked stays when the destination changes, and blocks a change that strands them", async () => {
  const { user, trip } = await fixture();
  await trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-central")] } });
  await expect(trips.updateTrip(user, trip.id, { destination: "Osaka" }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("not Osaka") });
  expect((await trips.getTrip(user, trip.id)).destination).toBe("Tokyo");
  // A destination the provider cannot place can only be checked by country.
  const moved = await trips.updateTrip(user, trip.id, { destination: "Synthetic Unknown Town" });
  expect(moved.preferences.accommodations[0]!.place).toMatchObject({ fit: "unchecked", checkedFor: "Synthetic Unknown Town" });
});

it("without a hotel provider, refuses new links but still saves named stays", async () => {
  const { user, trip } = await fixture();
  vi.stubEnv("PLACES_PROVIDER", "none");
  await expect(stays.suggestStays(user, trip.id, "synthetic hotel", SESSION)).rejects.toMatchObject({ code: "INVALID_STATE" });
  await expect(stays.checkStayPlace(user, trip.id, "fixture-stay-central")).rejects.toMatchObject({ code: "INVALID_STATE" });
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [linked("fixture-stay-central")] } }))
    .rejects.toMatchObject({ code: "INVALID_STATE" });
  const saved = await trips.updateTrip(user, trip.id, { preferences: { accommodations: [{ name: "Name only", location: null, checkIn: null, checkOut: null }] } });
  expect(saved.preferences.accommodations[0]).not.toHaveProperty("place");
});

it("reads the trip country from an explicit suffix or the supported-country timezone", () => {
  expect(stays.tripCountryCode({ destination: "Hakone, Japan", timezone: "Asia/Tokyo" })).toBe("JP");
  expect(stays.tripCountryCode({ destination: "Seoul", timezone: "Asia/Seoul" })).toBe("KR");
  expect(stays.tripCountryCode({ destination: "Somewhere", timezone: "America/Lima" })).toBeNull();
});

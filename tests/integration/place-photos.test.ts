import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { CandidatePlace, User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";
const { photo } = vi.hoisted(() => ({ photo: vi.fn() }));
vi.mock("@reel/ai/real-providers", () => ({ getGooglePlacePhoto: photo }));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-photo-"));
vi.stubEnv("REEL_DATA_DIR", dir); vi.stubEnv("DATA_BACKEND", "file");
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { getPlacePhoto } = await import("../../apps/web/src/server/services/place-photos");
let user: User, place: CandidatePlace;
beforeEach(async () => {
  photo.mockReset().mockResolvedValue({ imageUrl: "https://lh3.googleusercontent.com/synthetic", googleMapsUrl: "https://maps.google.com/synthetic", authors: [] });
  user = (await devSignIn({ email: `photos-${crypto.randomUUID()}@example.test` })).user;
  const trip = await createTrip(user, { title: "Synthetic photo test", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  const option = structuredClone(placeFixtures.confirmed.selected!);
  option.details.provider = "google";
  place = { ...placeFixtures.confirmed, id: `place_${crypto.randomUUID()}`, tripId: trip.id, options: [option], selected: option };
  await repos().places.insert(place);
});
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });
it("serves a stored Google match without changing the candidate or persisting photo URLs", async () => {
  expect(await getPlacePhoto(user, place.tripId, place.id, place.selected!.providerPlaceId)).toHaveProperty("imageUrl");
  expect(await repos().places.get(place.id)).toEqual(place);
  expect(photo).toHaveBeenCalledTimes(1);
});
it("rejects other owners and arbitrary provider IDs before any paid call", async () => {
  const other = (await devSignIn({ email: `other-${crypto.randomUUID()}@example.test` })).user;
  await expect(getPlacePhoto(other, place.tripId, place.id, place.selected!.providerPlaceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(getPlacePhoto(user, place.tripId, place.id, "unknown-place")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(photo).not.toHaveBeenCalled();
});
it("never searches Google for a fixture or OpenStreetMap record", async () => {
  place.selected!.details.provider = "openstreetmap";
  await repos().places.update(place);
  expect(await getPlacePhoto(user, place.tripId, place.id, place.selected!.providerPlaceId)).toBeNull();
  expect(photo).not.toHaveBeenCalled();
});
it("sanitizes provider failures and preserves place data", async () => {
  photo.mockRejectedValue(Error("PRIVATE_PROVIDER_PAYLOAD"));
  await expect(getPlacePhoto(user, place.tripId, place.id, place.selected!.providerPlaceId)).rejects.toThrow("Photo unavailable.");
  expect(await repos().places.get(place.id)).toEqual(place);
});
it.each([["minute", 60, 60_000], ["day", 300, 86_400_000]] as const)("enforces %s limits before calling Google", async (period, limit, windowMs) => {
  for (let i = 0; i < limit; i++) await repos().rateLimits.consume(`place-photo-${period}:${user.id}`, { now: Date.now(), limit, windowMs });
  await expect(getPlacePhoto(user, place.tripId, place.id, place.selected!.providerPlaceId)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(photo).not.toHaveBeenCalled();
});

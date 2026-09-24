import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { AccountPlace, AccountReel, CandidatePlace, User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";
const { photo } = vi.hoisted(() => ({ photo: vi.fn() }));
vi.mock("@reel/ai/real-providers", () => ({ getGooglePlacePhoto: photo }));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-photo-"));
vi.stubEnv("REEL_DATA_DIR", dir); vi.stubEnv("DATA_BACKEND", "file");
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { accountPlacesFromStops, createAccountReel, sourceCountry } = await import("../../apps/web/src/server/services/account-reels");
const { getAccountPlacePhoto, getPlacePhoto } = await import("../../apps/web/src/server/services/place-photos");
let user: User, place: CandidatePlace, accountReel: AccountReel, accountPlace: AccountPlace;
beforeEach(async () => {
  photo.mockReset().mockResolvedValue({ imageUrl: "https://lh3.googleusercontent.com/synthetic", googleMapsUrl: "https://maps.google.com/synthetic", authors: [] });
  user = (await devSignIn({ email: `photos-${crypto.randomUUID()}@example.test` })).user;
  const trip = await createTrip(user, { title: "Synthetic photo test", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  const option = structuredClone(placeFixtures.confirmed.selected!);
  option.details.provider = "google";
  place = { ...placeFixtures.confirmed, id: `place_${crypto.randomUUID()}`, tripId: trip.id, options: [option], selected: option };
  await repos().places.insert(place);
  const submitted = await createAccountReel(user, `https://www.youtube.com/shorts/${crypto.randomUUID().replaceAll("-", "").slice(0, 11)}`);
  accountReel = submitted.reel;
  const claimed = await repos().accountReels.claim(submitted.job.id, {
    now: new Date().toISOString(), staleBefore: new Date(0).toISOString(),
  });
  [accountPlace] = accountPlacesFromStops(accountReel, [{
    name: "Synthetic Google place", area_hint: "Tokyo", category: "attraction", excerpt: "Synthetic evidence",
    country: sourceCountry("Japan"), mappingStatus: "pending", options: [structuredClone(option)],
  }]);
  await repos().accountReels.settle({ ...claimed!, status: "succeeded", updatedAt: new Date().toISOString() }, {
    status: "ready", failureCode: null, failureMessage: null, places: [accountPlace!],
  });
});
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });
it("serves a stored Google match without changing the candidate or persisting photo URLs", async () => {
  expect(await getPlacePhoto(user, place.tripId, place.id, place.selected!.providerPlaceId)).toHaveProperty("imageUrl");
  expect(await repos().places.get(place.id)).toEqual(place);
  expect(photo).toHaveBeenCalledTimes(1);
});
it("serves an owner-scoped account-place photo without persisting the temporary URL", async () => {
  const providerPlaceId = accountPlace.options[0]!.providerPlaceId;
  expect(await getAccountPlacePhoto(user, accountReel.id, accountPlace.id, providerPlaceId)).toHaveProperty("imageUrl");
  expect((await repos().accountReels.listPlacesByOwner(user.id)).find((item) => item.id === accountPlace.id)).toEqual(accountPlace);
  expect(photo).toHaveBeenCalledTimes(1);
});
it("retires the old unscoped photo proxy without provider calls", async () => {
  const { GET } = await import("../../apps/web/src/app/api/place-photo/route");
  const response = await GET();
  expect(response.status).toBe(410);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(photo).not.toHaveBeenCalled();
});
it("rejects other owners and arbitrary provider IDs before any paid call", async () => {
  const other = (await devSignIn({ email: `other-${crypto.randomUUID()}@example.test` })).user;
  await expect(getPlacePhoto(other, place.tripId, place.id, place.selected!.providerPlaceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(getPlacePhoto(user, place.tripId, place.id, "unknown-place")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(getAccountPlacePhoto(other, accountReel.id, accountPlace.id, accountPlace.options[0]!.providerPlaceId))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(getAccountPlacePhoto(user, accountReel.id, accountPlace.id, "unknown-place"))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
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

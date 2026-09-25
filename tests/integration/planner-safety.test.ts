import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Trip, User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-safety-"));
process.env.REEL_DATA_DIR = dataDir;
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const trips = await import("../../apps/web/src/server/services/trips");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const shares = await import("../../apps/web/src/server/services/shares");
const { SHARE_CREATE_LIMIT, SHARE_VIEW_LIMIT } = await import("../../apps/web/src/server/services/rate-limits");

let alice: User;
let bob: User;
let serial = 0;
beforeAll(async () => {
  alice = (await devSignIn({ email: "safety-alice@example.test" })).user;
  bob = (await devSignIn({ email: "safety-bob@example.test" })).user;
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(() => {
  if (path.dirname(path.resolve(dataDir)) !== path.resolve(os.tmpdir()) || !path.basename(dataDir).startsWith("reel-safety-")) {
    throw new Error("Refusing to remove a directory outside the generated test workspace.");
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function newTrip(user = alice): Promise<Trip> {
  return trips.createTrip(user, { title: "Synthetic safety trip", destination: "Tokyo", timezone: "Asia/Tokyo",
    startDate: "2026-10-01", endDate: "2026-10-03" });
}
async function addPlace(trip: Trip, confirmed = true) {
  const place = structuredClone(placeFixtures.confirmed);
  place.id = `place_safety_${++serial}`;
  place.tripId = trip.id;
  if (!confirmed) { place.status = "pending"; place.selected = null; }
  await repos().places.insert(place);
  return place;
}

describe("trip validation and itinerary persistence", () => {
  it("unselects removed places, excludes them from regeneration, and reselects on Undo", async () => {
    const trip = await newTrip();
    const removed = await addPlace(trip);
    const other = await addPlace(trip);
    const option = { ...other.selected!, providerPlaceId: "synthetic-other-place" };
    await repos().places.update({ ...other, selected: option, options: [option] });
    const original = await itinerary.generateItinerary(alice, trip.id, { expectedVersion: null });
    const day = original.days.find(day => day.stops.some(stop => stop.placeId === removed.id))!;
    const stop = day.stops.find(stop => stop.placeId === removed.id)!;
    await itinerary.editItinerary(alice, trip.id, { expectedVersion: 1, dryRun: true, edit: { type: "remove_stop", stopId: stop.id } });
    expect((await repos().trips.get(trip.id))?.selectedPlaceIds).toEqual(trip.selectedPlaceIds);
    const result = await itinerary.editItinerary(alice, trip.id, { expectedVersion: 1, dryRun: false, edit: { type: "remove_stop", stopId: stop.id } });
    expect((await repos().trips.get(trip.id))?.selectedPlaceIds).not.toContain(removed.id);
    expect(await repos().places.get(removed.id)).not.toBeNull();
    expect(result.itinerary.unscheduledPlaceIds).not.toContain(removed.id);
    expect((await itinerary.getItinerary(alice, trip.id)).stale).toBe(false);
    const regenerated = await itinerary.generateItinerary(alice, trip.id, { expectedVersion: 2 });
    expect(regenerated.days.flatMap(day => day.stops).some(stop => stop.placeId === removed.id)).toBe(false);
    const undo = await itinerary.editItinerary(alice, trip.id, { expectedVersion: 3, dryRun: false, edit: { type: "add_place", placeId: removed.id, date: day.date, index: 0 } });
    expect((await repos().trips.get(trip.id))?.selectedPlaceIds).toContain(removed.id);
    expect(undo.itinerary.days.flatMap(day => day.stops).some(stop => stop.placeId === removed.id)).toBe(true);
  });

  it("rejects missing, unconfirmed and foreign must-visits without saving preferences", async () => {
    const trip = await newTrip();
    const pending = await addPlace(trip, false);
    const foreign = await addPlace(await newTrip(bob));
    for (const placeId of ["missing", pending.id, foreign.id]) {
      await expect(trips.updateTrip(alice, trip.id, { preferences: { mustVisitPlaceIds: [placeId] } }))
        .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect((await trips.getTrip(alice, trip.id)).preferences.mustVisitPlaceIds).toEqual([]);
    const confirmed = await addPlace(trip);
    const saved = await trips.updateTrip(alice, trip.id, { preferences: { mustVisitPlaceIds: [confirmed.id, confirmed.id] } });
    expect(saved.preferences.mustVisitPlaceIds).toEqual([confirmed.id]);
  });

  it("makes timezone changes stale and keeps dry-run edits out of persistence", async () => {
    const trip = await newTrip();
    await addPlace(trip);
    const v1 = await itinerary.generateItinerary(alice, trip.id, { expectedVersion: null });
    await trips.updateTrip(alice, trip.id, { timezone: "Asia/Singapore" });
    expect((await itinerary.getItinerary(alice, trip.id)).stale).toBe(true);
    const preview = await itinerary.editItinerary(alice, trip.id, { expectedVersion: 1, dryRun: true,
      edit: { type: "remove_stop", stopId: v1.days.flatMap((d) => d.stops).find((s) => s.kind === "place")!.id } });
    expect(preview.saved).toBe(false);
    expect((await itinerary.getItinerary(alice, trip.id)).itinerary).toEqual(v1);
    expect(await repos().itineraries.getVersion(trip.id, 2)).toBeNull();
    const v2 = await itinerary.generateItinerary(alice, trip.id, { expectedVersion: 1 });
    expect(v2.version).toBe(2);
    expect((await itinerary.getItinerary(alice, trip.id)).stale).toBe(false);
    expect(await repos().itineraries.getVersion(trip.id, 1)).toEqual(v1);
  });

  it("allows only one of two competing saves and preserves the trip's other fields", async () => {
    const trip = await newTrip();
    await addPlace(trip);
    const results = await Promise.allSettled([
      itinerary.generateItinerary(alice, trip.id, { expectedVersion: null }),
      itinerary.generateItinerary(alice, trip.id, { expectedVersion: null }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "STALE_VERSION", details: { currentVersion: 1 } });
    expect((await trips.getTrip(alice, trip.id)).currentItineraryVersion).toBe(1);
    const v1 = (await itinerary.getItinerary(alice, trip.id)).itinerary!;
    await trips.updateTrip(alice, trip.id, { title: "Updated title" });
    await expect(repos().itineraries.saveVersion({ ...v1, id: "bad", version: 3 }, 1))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
    expect(await repos().itineraries.getVersion(trip.id, 3)).toBeNull();
    await itinerary.generateItinerary(alice, trip.id, { expectedVersion: 1 });
    expect((await trips.getTrip(alice, trip.id)).title).toBe("Updated title");
    // A preferences write that started before generation must not roll the pointer back.
    const edited = await repos().trips.update({ ...trip, title: "Concurrent details update" });
    expect(edited.currentItineraryVersion).toBe(2);
    expect((await itinerary.getItinerary(alice, trip.id)).itinerary!.version).toBe(2);
  });
});

describe("sharing safeguards", () => {
  it("a concurrent viewer cannot undo revocation", async () => {
    const trip = await newTrip();
    const created = await shares.createShare(bob, (await newTrip(bob)).id, "https://example.test");
    const r = repos();
    const touch = r.shares.markViewed.bind(r.shares);
    vi.spyOn(r.shares, "markViewed").mockImplementationOnce(async (id, viewedAt) => {
      await shares.revokeShare(bob, created.share.tripId, id);
      return touch(id, viewedAt);
    });
    await expect(shares.getSharedView(created.token)).rejects.toMatchObject({ code: "SHARE_REVOKED" });
    expect((await r.shares.get(created.share.id))!.revokedAt).not.toBeNull();
    await expect(shares.getSharedView(created.token)).rejects.toMatchObject({ code: "SHARE_REVOKED" });
    await expect(shares.revokeShare(alice, trip.id, created.share.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("strips unexpected private fields for direct server callers too", async () => {
    const trip = await newTrip(bob);
    await addPlace(trip);
    const saved = await itinerary.generateItinerary(bob, trip.id, { expectedVersion: null });
    const r = repos();
    vi.spyOn(r.itineraries, "getVersion").mockResolvedValue({ ...saved, days: saved.days.map((day) => ({ ...day,
      stops: day.stops.map((stop) => ({ ...stop, privateNote: "PRIVATE_SENTINEL", uploadId: "PRIVATE_SENTINEL" })),
    })) });
    const created = await shares.createShare(bob, trip.id, "https://example.test");
    const json = JSON.stringify(await shares.getSharedView(created.token));
    expect(json).not.toContain("PRIVATE_SENTINEL");
    expect(json).not.toContain("sourceInspirationIds");
    expect(JSON.stringify(await shares.listShares(bob, trip.id))).not.toContain(created.token);
  });

  it("limits creation across an owner's trips and resets at the window boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SHARE_CREATE_LIMIT.windowMs * 2);
    const one = await newTrip();
    const two = await newTrip();
    for (let i = 0; i < SHARE_CREATE_LIMIT.limit; i++) await shares.createShare(alice, i % 2 ? one.id : two.id, "https://example.test");
    await expect(shares.createShare(alice, one.id, "https://example.test"))
      .rejects.toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSeconds: 600 } });
    expect((await shares.listShares(alice, one.id)).length + (await shares.listShares(alice, two.id)).length).toBe(10);
    vi.setSystemTime(Date.now() + SHARE_CREATE_LIMIT.windowMs);
    await expect(shares.createShare(alice, one.id, "https://example.test")).resolves.toHaveProperty("token");
  });

  it("limits public reads per link, recovers, and still reports revocation when exhausted", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SHARE_CREATE_LIMIT.windowMs * 4);
    const trip = await newTrip(bob);
    const first = await shares.createShare(bob, trip.id, "https://example.test");
    const second = await shares.createShare(bob, trip.id, "https://example.test");
    // Fill the quota through the repository to avoid 119 redundant full projections.
    for (let i = 0; i < SHARE_VIEW_LIMIT.limit - 1; i++) {
      await repos().rateLimits.consume(`share-view:${first.share.id}`, { ...SHARE_VIEW_LIMIT, now: Date.now() });
    }
    await shares.getSharedView(first.token);
    await expect(shares.getSharedView(first.token)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(shares.getSharedView(second.token)).resolves.toHaveProperty("trip");
    vi.setSystemTime(Date.now() + SHARE_VIEW_LIMIT.windowMs);
    await expect(shares.getSharedView(first.token)).resolves.toHaveProperty("trip");
    await shares.revokeShare(bob, trip.id, first.share.id);
    await expect(shares.getSharedView(first.token)).rejects.toMatchObject({ code: "SHARE_REVOKED" });
  });
});

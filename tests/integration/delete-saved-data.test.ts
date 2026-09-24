import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { inspirationFixtures, placeFixtures } from "@reel/contracts/fixtures";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-delete-data-"));
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("REEL_DATA_DIR", directory);
const { assetStorage, repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const trips = await import("../../apps/web/src/server/services/trips");
const places = await import("../../apps/web/src/server/services/places");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const shares = await import("../../apps/web/src/server/services/shares");

afterAll(() => {
  if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("reel-delete-data-")) throw Error("Unsafe cleanup");
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture() {
  const owner = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  const other = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  const trip = await trips.createTrip(owner, { title: "Synthetic source trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  const target = await trips.createTrip(owner, { title: "Synthetic copy trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  const sourceId = `insp_${crypto.randomUUID()}`;
  const placeId = `place_${crypto.randomUUID()}`;
  const source = { ...structuredClone(inspirationFixtures.ready), id: sourceId, tripId: trip.id, placeIds: [placeId] };
  const place = { ...structuredClone(placeFixtures.confirmed), id: placeId, tripId: trip.id,
    evidence: placeFixtures.confirmed.evidence.map((item) => ({ ...item, inspirationId: sourceId })) };
  await repos().inspirations.insert(source);
  await repos().places.insert(place);
  return { owner, other, trip, target, source, place };
}

it("deletes only an owned place, detaches references and keeps its save and other-trip copy", async () => {
  const f = await fixture();
  const [copy] = await places.copyPlacesToTrip(f.owner, f.target.id, { placeIds: [f.place.id] });
  await places.selectPlaces(f.owner, f.trip.id, { placeIds: [f.place.id] });
  await trips.updateTrip(f.owner, f.trip.id, { preferences: { mustVisitPlaceIds: [f.place.id] } });
  const booking = await trips.createReservation(f.owner, f.trip.id, { title: "Synthetic dinner", placeId: f.place.id, start: "2026-10-01T19:00", end: "2026-10-01T20:00", locked: true });
  await itinerary.generateItinerary(f.owner, f.trip.id, { expectedVersion: null });

  await expect(places.deletePlace(f.other, f.trip.id, f.place.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(places.deletePlace(f.owner, f.target.id, f.place.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await places.deletePlace(f.owner, f.trip.id, f.place.id);
  expect(await repos().places.get(f.place.id)).toBeNull();
  expect(await repos().places.get(copy!.id)).not.toBeNull();
  expect((await trips.getTrip(f.owner, f.trip.id)).selectedPlaceIds).toEqual([]);
  expect((await trips.getTrip(f.owner, f.trip.id)).preferences.mustVisitPlaceIds).toEqual([]);
  expect((await repos().reservations.get(booking.id))?.placeId).toBeNull();
  expect((await repos().inspirations.get(f.source.id))?.placeIds).toEqual([]);
  expect((await itinerary.getItinerary(f.owner, f.trip.id)).stale).toBe(true);
  expect((await places.listSavedPlaces(f.owner)).some((item) => item.id === copy!.id)).toBe(true);
  await expect(places.deletePlace(f.owner, f.trip.id, f.place.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("deletes a trip and its private upload and share while preserving copied places in another trip", async () => {
  const f = await fixture();
  const [copy] = await places.copyPlacesToTrip(f.owner, f.target.id, { placeIds: [f.place.id] });
  await trips.createReservation(f.owner, f.trip.id, { title: "Synthetic dinner", start: "2026-10-01T19:00", end: "2026-10-01T20:00", locked: true });
  await itinerary.generateItinerary(f.owner, f.trip.id, { expectedVersion: null });
  const link = await shares.createShare(f.owner, f.trip.id, "https://synthetic.example");
  const assetId = `asset_${crypto.randomUUID().replaceAll("-", "")}`;
  await repos().assets.insert({ id: assetId, ownerId: f.owner.id, tripId: f.trip.id, contentType: "image/png", size: 3, createdAt: new Date().toISOString() });
  await assetStorage().put(assetId, new Uint8Array([1, 2, 3]), "image/png");

  await expect(trips.deleteTrip(f.other, f.trip.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await trips.deleteTrip(f.owner, f.trip.id);
  expect(await repos().trips.get(f.trip.id)).toBeNull();
  expect(await repos().places.listByTrip(f.trip.id)).toEqual([]);
  expect(await repos().inspirations.listByTrip(f.trip.id)).toEqual([]);
  expect(await repos().reservations.listByTrip(f.trip.id)).toEqual([]);
  expect(await repos().shares.listByTrip(f.trip.id)).toEqual([]);
  expect(await repos().assets.listByTrip(f.trip.id)).toEqual([]);
  expect(await assetStorage().get(assetId)).toBeNull();
  await expect(shares.getSharedView(link.token)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await repos().places.get(copy!.id)).not.toBeNull();
  expect((await places.listSavedPlaces(f.owner)).some((item) => item.id === copy!.id)).toBe(true);
  await expect(trips.deleteTrip(f.owner, f.trip.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("updates a saved source's review state as unresolved places are deleted", async () => {
  const f = await fixture();
  const secondId = `place_${crypto.randomUUID()}`;
  const first = { ...structuredClone(placeFixtures.ambiguousBranch), id: f.place.id, tripId: f.trip.id,
    evidence: placeFixtures.ambiguousBranch.evidence.map((item) => ({ ...item, inspirationId: f.source.id })) };
  const second = { ...first, id: secondId };
  await repos().places.update(first);
  await repos().places.insert(second);
  await repos().inspirations.update({ ...f.source, status: "needs_confirmation", placeIds: [first.id, second.id] });
  await places.deletePlace(f.owner, f.trip.id, first.id);
  expect(await repos().inspirations.get(f.source.id)).toMatchObject({ status: "needs_confirmation", placeIds: [second.id] });
  await places.deletePlace(f.owner, f.trip.id, second.id);
  expect(await repos().inspirations.get(f.source.id)).toMatchObject({ status: "ready", placeIds: [] });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CandidatePlace, Inspiration, Trip, User } from "@reel/contracts";
import { inspirationFixtures, placeFixtures } from "@reel/contracts/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-saved-places-"));
process.env.REEL_DATA_DIR = dataDir;

const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const trips = await import("../../apps/web/src/server/services/trips");

let alice: User;
let bob: User;
let tokyo: Trip;
let kyoto: Trip;
let target: Trip;
let bobTrip: Trip;
let tokyoPlace: CandidatePlace;
let kyotoPlace: CandidatePlace;
let tokyoSave: Inspiration;

async function tripFor(user: User, title: string, destination: string) {
  return trips.createTrip(user, {
    title,
    destination,
    timezone: "Asia/Tokyo",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
  });
}

async function insertConfirmed(trip: Trip, suffix: string, sourceText: string): Promise<{
  place: CandidatePlace;
  inspiration: Inspiration;
}> {
  const inspirationId = `insp_saved_${suffix}`;
  const placeId = `place_saved_${suffix}`;
  const inspiration: Inspiration = {
    ...inspirationFixtures.ready,
    id: inspirationId,
    tripId: trip.id,
    text: sourceText,
    placeIds: [placeId],
  };
  const base = placeFixtures.confirmed;
  const selected = {
    ...base.selected!,
    providerPlaceId: `provider_${suffix}`,
    name: `Saved place ${suffix}`,
    details: { ...base.selected!.details, providerPlaceId: `provider_${suffix}` },
  };
  const place: CandidatePlace = {
    ...base,
    id: placeId,
    tripId: trip.id,
    name: selected.name,
    evidence: [{ ...base.evidence[0]!, inspirationId, clue: selected.name, excerpt: sourceText }],
    options: [selected],
    selected,
  };
  await repos().inspirations.insert(inspiration);
  await repos().places.insert(place);
  return { place, inspiration };
}

beforeAll(async () => {
  alice = (await devSignIn({ email: "saved-alice@example.test" })).user;
  bob = (await devSignIn({ email: "saved-bob@example.test" })).user;
  tokyo = await tripFor(alice, "Tokyo memories", "Tokyo, Japan");
  kyoto = await tripFor(alice, "Kyoto spring", "Kyoto, Japan");
  target = await tripFor(alice, "Japan next time", "Osaka, Japan");
  bobTrip = await tripFor(bob, "Bob's Tokyo", "Tokyo, Japan");
  ({ place: tokyoPlace, inspiration: tokyoSave } = await insertConfirmed(tokyo, "tokyo", "Original Tokyo words"));
  ({ place: kyotoPlace } = await insertConfirmed(kyoto, "kyoto", "Original Kyoto words"));
  await insertConfirmed(bobTrip, "bob", "Bob's private words");
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe("saved places Phase 1", () => {
  it("lists confirmed places across the owner's trips without leaking another account", async () => {
    const alicePlaces = await places.listSavedPlaces(alice);
    expect(alicePlaces.map((place) => place.id)).toEqual(expect.arrayContaining([tokyoPlace.id, kyotoPlace.id]));
    expect(new Set(alicePlaces.map((place) => place.tripId))).toEqual(new Set([tokyo.id, kyoto.id]));

    const bobPlaces = await places.listSavedPlaces(bob);
    expect(bobPlaces).toHaveLength(1);
    expect(bobPlaces[0]!.tripId).toBe(bobTrip.id);
  });

  it("opens copied evidence through its original owner and rejects another account", async () => {
    await places.copyPlacesToTrip(alice, target.id, { placeIds: [tokyoPlace.id] });
    const [copy] = await places.listPlaces(alice, target.id);
    const evidenceId = copy!.evidence[0]!.inspirationId;

    expect(evidenceId).toBe(tokyoSave.id);
    await expect(inspirations.getOwnedInspiration(alice, evidenceId)).resolves.toMatchObject({
      inspiration: { text: "Original Tokyo words" },
    });
    await expect(inspirations.getOwnedInspiration(bob, evidenceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("copies several confirmed selections and remains idempotent", async () => {
    const first = await places.copyPlacesToTrip(alice, target.id, { placeIds: [tokyoPlace.id, kyotoPlace.id] });
    expect(first).toHaveLength(2);

    await places.copyPlacesToTrip(alice, target.id, { placeIds: [tokyoPlace.id, tokyoPlace.id] });
    const targetPlaces = await places.listPlaces(alice, target.id);
    expect(targetPlaces).toHaveLength(2);
    expect(targetPlaces.find((place) => place.name === tokyoPlace.name)?.selected?.providerPlaceId)
      .toBe(tokyoPlace.selected!.providerPlaceId);
  });

  it("does not copy another account's or an unconfirmed place", async () => {
    const [bobPlace] = await places.listSavedPlaces(bob);
    await expect(places.copyPlacesToTrip(alice, target.id, { placeIds: [bobPlace!.id] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    const rejected = { ...placeFixtures.notFound, id: "place_rejected_saved", tripId: tokyo.id, status: "rejected" as const };
    await repos().places.insert(rejected);
    await expect(places.copyPlacesToTrip(alice, target.id, { placeIds: [rejected.id] }))
      .rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

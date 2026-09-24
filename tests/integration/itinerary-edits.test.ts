import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CandidatePlace, User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";

// Day editing beyond reordering: bringing in trip places that planning didn't include yet.
// Synthetic fixture places only; no provider calls.

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-edits-"));
process.env.REEL_DATA_DIR = dataDir;
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip, getTrip, updateTrip } = await import("../../apps/web/src/server/services/trips");
const { addItineraryPlace, editItinerary, generateItinerary, getItinerary } = await import("../../apps/web/src/server/services/itinerary");

let alice: User;
let bob: User;
beforeAll(async () => {
  alice = (await devSignIn({ email: "edits-alice@example.test" })).user;
  bob = (await devSignIn({ email: "edits-bob@example.test" })).user;
});
afterAll(() => {
  if (path.dirname(path.resolve(dataDir)) !== path.resolve(os.tmpdir()) || !path.basename(dataDir).startsWith("reel-edits-")) throw new Error("Unexpected test directory");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let next = 0;
async function add(tripId: string, fixture: CandidatePlace): Promise<CandidatePlace> {
  const copy = structuredClone(fixture);
  copy.id = `place_edit_${++next}`;
  copy.tripId = tripId;
  await repos().places.insert(copy);
  return copy;
}

async function plannedTrip(user: User) {
  const trip = await createTrip(user, { title: "Synthetic edit trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-02" });
  const skyDeck = await add(trip.id, placeFixtures.confirmed);
  // Pending places are not planned until selected (the trip has no explicit selection yet).
  const shrine = await add(trip.id, placeFixtures.pendingUnknownHours);
  const itinerary = await generateItinerary(user, trip.id, { expectedVersion: null });
  return { trip, skyDeck, shrine, itinerary };
}

describe("adding trip places while editing a day", () => {
  it("selects an unplanned trip place in the same save and keeps a current itinerary current", async () => {
    const { trip, skyDeck, shrine, itinerary } = await plannedTrip(alice);
    expect(itinerary.days.flatMap((d) => d.stops).some((s) => s.placeId === shrine.id)).toBe(false);
    expect((await getItinerary(alice, trip.id)).stale).toBe(false);

    const preview = await editItinerary(alice, trip.id, { expectedVersion: itinerary.version, edit: { type: "add_place", placeId: shrine.id, date: "2026-10-02", index: 0 }, dryRun: true });
    expect(preview.saved).toBe(false);
    expect((await getTrip(alice, trip.id)).selectedPlaceIds).toBeUndefined();

    const { itinerary: edited, saved } = await editItinerary(alice, trip.id, { expectedVersion: itinerary.version, edit: { type: "add_place", placeId: shrine.id, date: "2026-10-02", index: 0 }, dryRun: false });
    expect(saved).toBe(true);
    expect(edited.days[1]!.stops[0]!.placeId).toBe(shrine.id);
    expect(edited.resolvedPlaces?.map((p) => p.placeId)).toContain(shrine.id);
    expect((await getTrip(alice, trip.id)).selectedPlaceIds).toEqual([skyDeck.id, shrine.id]);
    expect((await getItinerary(alice, trip.id)).stale).toBe(false);
  });

  it("keeps a stale itinerary stale when the edit selects a place", async () => {
    const { trip, shrine, itinerary } = await plannedTrip(alice);
    const changed = await updateTrip(alice, trip.id, { expectedUpdatedAt: (await getTrip(alice, trip.id)).updatedAt, preferences: { ...trip.preferences, pace: "packed" } });
    expect(changed.preferences.pace).toBe("packed");
    expect((await getItinerary(alice, trip.id)).stale).toBe(true);

    await editItinerary(alice, trip.id, { expectedVersion: itinerary.version, edit: { type: "add_place", placeId: shrine.id, date: "2026-10-01", index: 99 }, dryRun: false });
    expect((await getItinerary(alice, trip.id)).stale).toBe(true);
  });

  it("swaps a stop for an unplanned trip place", async () => {
    const { trip, skyDeck, shrine, itinerary } = await plannedTrip(alice);
    const stop = itinerary.days.flatMap((d) => d.stops).find((s) => s.placeId === skyDeck.id)!;
    const { itinerary: edited } = await editItinerary(alice, trip.id, { expectedVersion: itinerary.version, edit: { type: "replace_stop", stopId: stop.id, placeId: shrine.id }, dryRun: false });
    expect(edited.days.flatMap((d) => d.stops).some((s) => s.placeId === shrine.id)).toBe(true);
    expect(edited.unscheduledPlaceIds).toContain(skyDeck.id);
    expect((await getItinerary(alice, trip.id)).stale).toBe(false);
  });

  it("refuses rejected, unlocatable and other travelers' places without changing the selection", async () => {
    const { trip, itinerary } = await plannedTrip(alice);
    const rejected = await add(trip.id, { ...placeFixtures.pendingUnknownHours, status: "rejected" });
    const missing = await add(trip.id, placeFixtures.notFound);
    const foreignTrip = await createTrip(bob, { title: "Foreign synthetic trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-02" });
    const foreign = await add(foreignTrip.id, placeFixtures.pendingUnknownHours);
    for (const placeId of [rejected.id, missing.id, foreign.id]) {
      await expect(editItinerary(alice, trip.id, { expectedVersion: itinerary.version, edit: { type: "add_place", placeId, date: "2026-10-01", index: 0 }, dryRun: false }))
        .rejects.toMatchObject({ code: "INVALID_STATE" });
    }
    expect((await getTrip(alice, trip.id)).selectedPlaceIds).toBeUndefined();
  });
});

describe("adding places from saves and choosing a branch in one step", () => {
  it("copies a saved place from another trip onto a day with its evidence, keeping the plan current", async () => {
    const { trip, itinerary } = await plannedTrip(alice);
    const other = await createTrip(alice, { title: "Earlier synthetic trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-09-01", endDate: "2026-09-02" });
    const saved = await add(other.id, placeFixtures.pendingUnknownHours);
    const { itinerary: edited, place } = await addItineraryPlace(alice, trip.id, { expectedVersion: itinerary.version, source: { kind: "saved", placeId: saved.id }, at: { type: "day", date: "2026-10-01" } });
    expect(place.tripId).toBe(trip.id);
    expect(place.copiedFromPlaceId).toBe(saved.id);
    expect(place.evidence).toEqual(saved.evidence);
    expect(edited.days[0]!.stops.at(-1)?.placeId).toBe(place.id);
    expect((await getItinerary(alice, trip.id)).stale).toBe(false);
  });

  it("confirms the chosen branch of an ambiguous place and swaps it into an existing stop", async () => {
    const { trip, skyDeck, itinerary } = await plannedTrip(alice);
    const kumo = await add(trip.id, placeFixtures.ambiguousBranch);
    const branch = kumo.options.at(-1)!.providerPlaceId;
    const stop = itinerary.days.flatMap((d) => d.stops).find((s) => s.placeId === skyDeck.id)!;
    const { itinerary: edited, place } = await addItineraryPlace(alice, trip.id, { expectedVersion: itinerary.version, source: { kind: "trip", placeId: kumo.id }, providerPlaceId: branch, at: { type: "replace", stopId: stop.id } });
    expect(place.status).toBe("confirmed");
    expect(place.selected?.providerPlaceId).toBe(branch);
    expect(edited.days.flatMap((d) => d.stops).find((s) => s.placeId === kumo.id)?.location).toEqual(place.selected?.location);
    expect((await getItinerary(alice, trip.id)).stale).toBe(false);
  });

  it("refuses another traveler's saved place and stale versions", async () => {
    const { trip, itinerary } = await plannedTrip(alice);
    const foreignTrip = await createTrip(bob, { title: "Foreign synthetic trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-02" });
    const foreign = await add(foreignTrip.id, placeFixtures.pendingUnknownHours);
    await expect(addItineraryPlace(alice, trip.id, { expectedVersion: itinerary.version, source: { kind: "saved", placeId: foreign.id }, at: { type: "day", date: "2026-10-01" } }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addItineraryPlace(alice, trip.id, { expectedVersion: itinerary.version + 1, source: { kind: "trip", placeId: foreign.id }, at: { type: "day", date: "2026-10-01" } }))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
  });
});

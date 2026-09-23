import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CandidatePlace, User } from "@reel/contracts";
import { placeFixtures, tripFixture } from "@reel/contracts/fixtures";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-selection-"));
process.env.REEL_DATA_DIR = dataDir;
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip, getTrip } = await import("../../apps/web/src/server/services/trips");
const { selectPlaces } = await import("../../apps/web/src/server/services/places");
const { generateItinerary, getItinerary } = await import("../../apps/web/src/server/services/itinerary");
const { createShare, getSharedView } = await import("../../apps/web/src/server/services/shares");
const { routeMatches } = await import("../../apps/web/src/server/services/route-matches");

let alice: User;
let bob: User;
beforeAll(async () => {
  alice = (await devSignIn({ email: "select-alice@example.test" })).user;
  bob = (await devSignIn({ email: "select-bob@example.test" })).user;
});
afterAll(() => {
  if (path.dirname(path.resolve(dataDir)) !== path.resolve(os.tmpdir()) || !path.basename(dataDir).startsWith("reel-selection-")) throw new Error("Unexpected test directory");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let next = 0;
async function add(tripId: string, fixture: CandidatePlace): Promise<CandidatePlace> {
  const copy = structuredClone(fixture);
  copy.id = `place_selection_${++next}`;
  copy.tripId = tripId;
  await repos().places.insert(copy);
  return copy;
}

describe("tick-to-plan selection", () => {
  it("uses a source-supported area before route proximity when choosing a branch", () => {
    const anchor = structuredClone(placeFixtures.pendingUnknownHours);
    anchor.options[0]!.location = { lat: 35.6614, lng: 139.701 };
    const branch = structuredClone(placeFixtures.ambiguousBranch);
    branch.evidence[0]!.hint = "Shinjuku";
    const trip = { ...tripFixture, selectedPlaceIds: [anchor.id, branch.id] };
    expect(routeMatches(trip, [anchor, branch]).matches.get(branch.id)?.providerPlaceId).toBe("fx-kumo-ramen-shinjuku");
  });

  it("routes unconfirmed selected places, retains uncertainty, deduplicates, and shares only scheduled locations", async () => {
    const trip = await createTrip(alice, { title: "Synthetic selected trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
    const anchorFixture = structuredClone(placeFixtures.pendingUnknownHours);
    anchorFixture.options[0]!.location = { lat: 35.6614, lng: 139.701 };
    const anchor = await add(trip.id, anchorFixture);
    const duplicate = await add(trip.id, anchorFixture);
    const branch = await add(trip.id, placeFixtures.ambiguousBranch);
    const missing = await add(trip.id, placeFixtures.notFound);
    const foreign = await add((await createTrip(bob, { title: "Foreign synthetic trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" })).id, placeFixtures.pendingUnknownHours);

    await expect(selectPlaces(alice, trip.id, { placeIds: [foreign.id] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const selected = await selectPlaces(alice, trip.id, { placeIds: [anchor.id, duplicate.id, branch.id, missing.id, anchor.id] });
    expect(selected.selectedPlaceIds).toEqual([anchor.id, duplicate.id, branch.id, missing.id]);
    expect((await getTrip(alice, trip.id)).selectedPlaceIds).toEqual(selected.selectedPlaceIds);

    const plan = await generateItinerary(alice, trip.id, { expectedVersion: null });
    expect(plan.resolvedPlaces).toContainEqual({ placeId: branch.id, providerPlaceId: "fx-kumo-ramen-shibuya" });
    expect(plan.unresolvedPlaceIds).toEqual([missing.id]);
    expect(plan.duplicatePlaceIds).toEqual([duplicate.id]);
    expect(plan.days.flatMap((day) => day.stops).filter((stop) => stop.placeId === anchor.id)).toHaveLength(1);
    expect(plan.days.flatMap((day) => day.stops).some((stop) => stop.placeId === duplicate.id || stop.placeId === missing.id)).toBe(false);
    expect((await repos().places.get(branch.id))?.status).toBe("ambiguous");
    expect((await repos().places.get(branch.id))?.selected).toBeNull();

    const { token } = await createShare(alice, trip.id, "http://localhost:3000");
    const shared = await getSharedView(token);
    expect(shared.places.some((place) => place.id === branch.id && place.name === "Kumo Ramen Shibuya")).toBe(true);
    expect(shared.places.some((place) => place.id === missing.id || place.id === duplicate.id)).toBe(false);

    await selectPlaces(alice, trip.id, { placeIds: [branch.id], expectedUpdatedAt: (await getTrip(alice, trip.id)).updatedAt });
    expect((await getItinerary(alice, trip.id)).stale).toBe(true);
  });
});

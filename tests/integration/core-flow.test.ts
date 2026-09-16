import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { User } from "@reel/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Service-level acceptance checks from tests/README.md, run without HTTP or Next.js.
// Each run uses a throwaway data directory.

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-it-"));
process.env.REEL_DATA_DIR = dataDir;
process.env.FAKE_AI_DELAY_MS = "0";

const { runJob } = await import("../../apps/web/src/server/jobs/queue");
const { processImport } = await import("../../apps/web/src/server/jobs/import-inspiration");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const shares = await import("../../apps/web/src/server/services/shares");
const trips = await import("../../apps/web/src/server/services/trips");

let alice: User;
let bob: User;
let tripId: string;

beforeAll(async () => {
  alice = (await devSignIn({ email: "alice@example.test" })).user;
  bob = (await devSignIn({ email: "bob@example.test" })).user;
  tripId = (
    await trips.createTrip(alice, {
      title: "Test trip",
      destination: "Tokyo",
      timezone: "Asia/Tokyo",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
    })
  ).id;
});

afterAll(() => {
  vi.useRealTimers();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function save(text: string) {
  const { inspiration, job } = await inspirations.createInspiration(alice, tripId, { sourceType: "text", text });
  await runJob(job.id);
  return inspiration.id;
}

describe("identity", () => {
  it("keeps screenshot bytes behind the owner's session", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // synthetic PNG header, not a real traveler image
    const result = await inspirations.createScreenshotInspiration(alice, tripId, {
      file: new File([bytes], "synthetic.png", { type: "image/png" }),
    });
    const assetId = result.inspiration.assetId!;
    expect((await inspirations.getOwnedAsset(alice, assetId)).bytes).toEqual(bytes);
    await expect(inspirations.getOwnedAsset(bob, assetId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Keep this fixture out of the import-state flow below.
    await inspirations.skipInspiration(alice, tripId, result.inspiration.id);
  });
  it("hides one account's trip from another", async () => {
    await expect(trips.getTrip(bob, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(inspirations.listInspirations(bob, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await trips.listTrips(bob)).toEqual([]);
  });
});

describe("import", () => {
  it("keeps a save through failed attempts and recovers without duplicates", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { inspiration, job } = await inspirations.createInspiration(alice, tripId, {
      sourceType: "text",
      text: "Sky deck at sunset [[fail]]",
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await runJob(job.id);
      vi.setSystemTime(Date.now() + 5 * 60_000);
    }
    vi.useRealTimers();

    const failed = await inspirations.getInspiration(alice, tripId, inspiration.id);
    expect(failed.inspiration).toMatchObject({ status: "failed", text: "Sky deck at sunset [[fail]]" });

    const retried = await inspirations.addInspirationDetails(alice, tripId, inspiration.id, { text: "sky deck" });
    await runJob(retried.job.id);
    await processImport(inspiration.id); // a duplicate run must not add anything

    const recovered = await inspirations.getInspiration(alice, tripId, inspiration.id);
    expect(recovered.inspiration.status).toBe("needs_confirmation");
    expect(recovered.places).toHaveLength(1);
    expect(recovered.places[0]!.evidence).toHaveLength(1);
  });

  it("keeps an unreadable link and asks for details", async () => {
    const { inspiration, job } = await inspirations.createInspiration(alice, tripId, {
      sourceType: "link",
      url: "https://www.tiktok.com/@someone/video/1",
    });
    await runJob(job.id);
    const result = await inspirations.getInspiration(alice, tripId, inspiration.id);
    expect(result.inspiration).toMatchObject({ status: "needs_input", failureCode: "SOURCE_INACCESSIBLE" });
    expect(result.inspiration.url).toBe("https://www.tiktok.com/@someone/video/1");
  });
});

describe("place confirmation", () => {
  it("leaves branches unresolved until the traveler picks one, then merges duplicates", async () => {
    await save("Kumo Ramen was amazing");
    const other = await save("Kumo Ramen in Shinjuku, open late");

    const all = await places.listPlaces(alice, tripId);
    const ambiguous = all.find((p) => p.status === "ambiguous")!;
    const single = all.find((p) => p.name === "Kumo Ramen Shinjuku")!;
    expect(ambiguous.options).toHaveLength(2);
    expect(await places.listPlaces(alice, tripId, "confirmed")).toHaveLength(0);

    const { place, mergedPlaceIds } = await places.confirmPlace(alice, tripId, ambiguous.id, {
      providerPlaceId: "fx-kumo-ramen-shinjuku",
    });
    expect(mergedPlaceIds).toEqual([single.id]);
    expect(place.evidence.map((e) => e.inspirationId)).toContain(other);
  });
});

describe("itinerary", () => {
  it("keeps a locked dinner fixed, rejects stale and breaking edits, and shares a projection", async () => {
    for (const p of await places.listPlaces(alice, tripId, "pending")) {
      await places.confirmPlace(alice, tripId, p.id, { providerPlaceId: p.options[0]!.providerPlaceId }).catch(() => undefined);
    }
    await trips.createReservation(alice, tripId, {
      title: "Dinner",
      start: "2026-10-01T19:30",
      end: "2026-10-01T21:00",
      locked: true,
    });
    const v1 = await itinerary.generateItinerary(alice, tripId, { expectedVersion: null });
    const dinner = v1.days[0]!.stops.find((s) => s.kind === "reservation")!;
    expect(dinner).toMatchObject({ start: "19:30", end: "21:00", locked: true });

    await expect(
      itinerary.editItinerary(alice, tripId, {
        expectedVersion: v1.version,
        edit: { type: "move_stop", stopId: dinner.id, toDate: "2026-10-02", toIndex: 0 },
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "EDIT_REJECTED" });

    await expect(
      itinerary.editItinerary(alice, tripId, {
        expectedVersion: v1.version + 5,
        edit: { type: "remove_stop", stopId: dinner.id },
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });

    const { share, token } = await shares.createShare(alice, tripId, "http://localhost:3000");
    const view = await shares.getSharedView(token);
    expect(view.itinerary?.version).toBe(v1.version);
    expect(JSON.stringify(view)).not.toContain("sourceInspirationIds");

    await shares.revokeShare(alice, tripId, share.id);
    await expect(shares.getSharedView(token)).rejects.toMatchObject({ code: "SHARE_REVOKED" });
    await expect(shares.revokeShare(bob, tripId, share.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AccountReel } from "@reel/contracts";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "routelet-account-reels-"));
process.env.REEL_DATA_DIR = dataDir;
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createAccountReel, addAccountReelDetails, deleteAccountReel, finishAccountReelReview, listAccountReels, accountPlacesFromStops, mapAccountReelPlaces, sourceCountry } = await import("../../apps/web/src/server/services/account-reels");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { copyPlacesToTrip } = await import("../../apps/web/src/server/services/places");
const { runAccountReelJob } = await import("../../apps/web/src/server/jobs/account-reel");

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe("account-owned reel shelf", () => {
  it("saves without a trip, isolates accounts, and preserves inaccessible social sources", async () => {
    const alice = (await devSignIn({ email: "shelf-alice@example.test" })).user;
    const bob = (await devSignIn({ email: "shelf-bob@example.test" })).user;
    const { reel, job } = await createAccountReel(alice, "https://www.instagram.com/reel/example/");
    expect(await repos().trips.listByOwner(alice.id)).toEqual([]);
    expect((await listAccountReels(alice)).reels.map((item) => item.id)).toEqual([reel.id]);
    expect((await listAccountReels(bob)).reels).toEqual([]);
    expect(await runAccountReelJob(job.id)).toBe("succeeded");
    const updated = await repos().accountReels.get(reel.id);
    expect(updated?.status).toBe("needs_input");
    expect(updated?.failureCode).toBe("SOURCE_INACCESSIBLE");
    expect(updated?.url).toBe(reel.url);
    await expect(addAccountReelDetails(bob, reel.id, "Kumo Ramen")).rejects.toThrow();
    const recovered = await addAccountReelDetails(alice, reel.id, "Kumo Ramen in the reel");
    expect(recovered.reel.details).toBe("Kumo Ramen in the reel");
    expect(await runAccountReelJob(recovered.job.id)).toBe("succeeded");
    const completed = await repos().accountReels.get(reel.id);
    expect(completed?.url).toBe(reel.url);
    expect(completed?.status).toBe("ready");
    expect((await listAccountReels(alice)).places.length).toBeGreaterThan(0);
  });

  it("stores only source-backed account place ideas and deletes them with their reel", async () => {
    const alice = (await devSignIn({ email: "shelf-owner@example.test" })).user;
    const bob = (await devSignIn({ email: "shelf-stranger@example.test" })).user;
    const { reel, job } = await createAccountReel(alice, "https://www.youtube.com/shorts/ABCDEFGHIJK");
    expect(reel.url).toBe("https://www.youtube.com/shorts/ABCDEFGHIJK");
    const claimed = await repos().accountReels.claim(job.id, { now: new Date().toISOString(), staleBefore: new Date(0).toISOString() });
    expect(claimed?.status).toBe("running");
    const extracted = accountPlacesFromStops(reel, [
      { name: "Kumo Ramen", area_hint: "shibuya", category: "restaurant", excerpt: "Kumo Ramen in Shibuya, Japan", country: sourceCountry("Japan") },
      { name: "Kumo Ramen", area_hint: "shibuya", category: "restaurant", excerpt: "same mention", country: sourceCountry("Japan") },
    ]);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]?.country).toEqual({ code: "JP", excerpt: "Japan" });
    expect(extracted[0]?.mappingStatus).toBe("unverified");
    expect(await repos().accountReels.settle({ ...claimed!, status: "succeeded", updatedAt: new Date().toISOString() },
      { status: "ready", failureCode: null, failureMessage: null, places: extracted })).toBe(true);
    expect(await repos().trips.listByOwner(alice.id)).toEqual([]);
    expect((await repos().accountReels.listPlacesByOwner(bob.id))).toEqual([]);
    expect((await repos().accountReels.listPlacesByOwner(alice.id))).toHaveLength(1);
    const mapped = await mapAccountReelPlaces(alice, reel.id);
    expect(mapped[0]?.mappingStatus).toBe("pending");
    expect(mapped[0]?.options[0]).toMatchObject({
      providerPlaceId: "fx-kumo-ramen-shibuya",
      name: "Kumo Ramen Shibuya",
    });
    expect((await repos().accountReels.listPlacesByOwner(alice.id))[0]?.mappingStatus).toBe("pending");
    await expect(mapAccountReelPlaces(bob, reel.id)).rejects.toThrow();
    await expect(deleteAccountReel(bob, reel.id)).rejects.toThrow();
    await deleteAccountReel(alice, reel.id);
    expect((await listAccountReels(alice)).reels).toEqual([]);
    expect((await repos().accountReels.listPlacesByOwner(alice.id))).toEqual([]);
  });

  it("keeps Home's popup pending until closed, removing only the listed ideas and keeping trip copies", async () => {
    const alice = (await devSignIn({ email: "discard-owner@example.test" })).user;
    const bob = (await devSignIn({ email: "discard-stranger@example.test" })).user;
    const { reel, job } = await createAccountReel(alice, "https://www.youtube.com/shorts/DISCARDTEST");
    expect(reel.review).toBe("pending");
    // Nothing can be removed while the reel is still being read, but × (no removals) already closes the popup.
    await expect(finishAccountReelReview(alice, reel.id, ["anything"])).rejects.toMatchObject({ code: "INVALID_STATE" });
    const claimed = await repos().accountReels.claim(job.id, { now: new Date().toISOString(), staleBefore: new Date(0).toISOString() });
    // Synthetic names; not real venues.
    const extracted = accountPlacesFromStops(reel, [
      { name: "Synthetic Kissa", area_hint: null, category: "cafe", excerpt: "Synthetic Kissa", country: sourceCountry("Japan") },
      { name: "Synthetic Tower", area_hint: null, category: "attraction", excerpt: "Synthetic Tower", country: sourceCountry("Japan") },
    ]);
    await repos().accountReels.settle({ ...claimed!, status: "succeeded", updatedAt: new Date().toISOString() },
      { status: "ready", failureCode: null, failureMessage: null, places: extracted });
    // Settling does not close the popup; a reload still finds the reel pending.
    expect((await listAccountReels(alice)).reels.find((item) => item.id === reel.id)?.review).toBe("pending");
    const [kept, dropped] = extracted;
    const trip = await createTrip(alice, { title: "Synthetic trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2027-01-10", endDate: "2027-01-11" });
    const [copy] = await copyPlacesToTrip(alice, trip.id, { accountPlaceIds: [dropped!.id] });

    await expect(finishAccountReelReview(bob, reel.id, [dropped!.id])).rejects.toMatchObject({ code: "NOT_FOUND" });
    const result = await finishAccountReelReview(alice, reel.id, [dropped!.id, "place_from_elsewhere"]);
    expect(result.reel.review).toBe("done");
    expect(result.places.map((place) => place.id)).toEqual([kept!.id]);
    expect(result.reel.placeIds).toEqual([kept!.id]);
    expect((await repos().accountReels.listPlacesByOwner(alice.id)).map((place) => place.id)).toEqual([kept!.id]);
    expect((await repos().places.get(copy!.id))?.name).toBe("Synthetic Tower");

    const again = await finishAccountReelReview(alice, reel.id, [dropped!.id]);
    expect(again.places.map((place) => place.id)).toEqual([kept!.id]);
    expect(again.reel.updatedAt).toBe(result.reel.updatedAt);
  });

  it("closes the popup with × while reading, and reopens it when details are added", async () => {
    const alice = (await devSignIn({ email: "review-close@example.test" })).user;
    const { reel, job } = await createAccountReel(alice, "https://www.instagram.com/reel/review-close/");
    expect((await finishAccountReelReview(alice, reel.id, [])).reel.review).toBe("done");
    expect(await runAccountReelJob(job.id)).toBe("succeeded");
    expect((await repos().accountReels.get(reel.id))?.status).toBe("needs_input");
    const recovered = await addAccountReelDetails(alice, reel.id, "Kumo Ramen in the reel");
    expect(recovered.reel.review).toBe("pending");
    expect(recovered.reel.status).toBe("queued");
  });

  it("reads reels saved before the popup existed as already reviewed", async () => {
    const alice = (await devSignIn({ email: "review-legacy@example.test" })).user;
    const { reel } = await createAccountReel(alice, "https://www.youtube.com/shorts/LEGACYREVIEW");
    const { review: _review, ...legacy } = reel;
    expect(AccountReel.parse(legacy).review).toBe("done");
  });
});

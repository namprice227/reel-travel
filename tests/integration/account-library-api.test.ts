import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import type { User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";
import { buildAccountLibrary } from "../../apps/web/src/features/library/account-library-model";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routelet-library-api-"));
vi.stubEnv("REEL_DATA_DIR", dir);
vi.stubEnv("DATA_BACKEND", "file");
let user: User;
vi.mock("../../apps/web/src/server/auth/session", () => ({ requireUser: async () => user }));
const { dispatch } = await import("../../apps/web/src/server/http/router");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { createAccountReel, accountPlacesFromStops, sourceCountry } = await import("../../apps/web/src/server/services/account-reels");
const { newInspiration } = await import("../../apps/web/src/server/services/inspirations");
const { repos } = await import("../../apps/web/src/server/db");
const { createApiClient } = await import("../../apps/web/src/lib/api-client");
const client = createApiClient({ baseUrl: "http://localhost:3000", fetch: async (url, init) => dispatch(new Request(String(url), init)) });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

it("audits library API country grouping, account isolation, and trip-place omission", async () => {
  user = (await devSignIn({ email: "library-audit@example.test" })).user;
  const owner = user;
  const { reel, job } = await createAccountReel(user, "https://www.youtube.com/shorts/ABCDEFGHIJK");
  const claimed = await repos().accountReels.claim(job.id, { now: new Date().toISOString(), staleBefore: new Date(0).toISOString() });
  expect(claimed).not.toBeNull();
  const places = accountPlacesFromStops(reel, [
    { name: "Synthetic Japan cafe", area_hint: "Tokyo", category: "cafe", excerpt: "Japan", country: sourceCountry("Japan") },
    { name: "Synthetic Thailand temple", area_hint: "Bangkok", category: "temple", excerpt: "Thailand", country: sourceCountry("Thailand") },
    { name: "Synthetic unknown garden", area_hint: null, category: "garden", excerpt: "Garden", country: null },
  ]);
  expect(await repos().accountReels.settle({ ...claimed!, status: "succeeded", updatedAt: new Date().toISOString() }, { status: "ready", failureCode: null, failureMessage: null, places })).toBe(true);
  const trip = await createTrip(user, { title: "Synthetic audit trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  const tripPlace = { ...placeFixtures.confirmed, id: "place_trip_audit", tripId: trip.id };
  await repos().places.insert(tripPlace);
  const response = await client("accountReels.list", {});
  expect(response.places).toHaveLength(3);
  expect(buildAccountLibrary(response.reels, response.places).map(a => [a.id, a.places.length])).toEqual([["JP", 1], ["TH", 1], ["unknown", 1]]);
  // Current behavior, not the desired all-saved-places requirement: the API omits trip places.
  expect(response.places.some(p => p.id === tripPlace.id)).toBe(false);
  expect(await repos().places.listByTrip(trip.id)).toHaveLength(1);
  const draftReel = await createAccountReel(user, "https://www.youtube.com/shorts/LMNOPQRSTUV");
  const draftJob = await repos().accountReels.claim(draftReel.job.id, { now: new Date().toISOString(), staleBefore: new Date(0).toISOString() });
  const draft = { ...trip, id: "trip_library_draft", status: "draft" as const, startDate: null, endDate: null, draft: { sourceReelId: draftReel.reel.id, tripDays: 3 } };
  await repos().accountReels.attachDraftTrip(draftJob!, draft);
  const source = newInspiration(draft.id, "link", { url: draftReel.reel.url });
  await repos().inspirations.insert(source);
  await repos().places.insert({ ...tripPlace, id: "place_reel_draft", tripId: draft.id,
    evidence: [{ ...tripPlace.evidence[0]!, inspirationId: source.id }] });
  await repos().places.insert({ ...tripPlace, id: "place_unrelated", tripId: draft.id });
  const library = await client("accountReels.library", {});
  expect(library.places).toHaveLength(4);
  expect(library.places.find(p => p.id === "place_reel_draft")).toMatchObject({ originTripId: draft.id, reelId: draftReel.reel.id, country: { code: "JP" }, confirmed: true });
  expect(library.places.some(p => p.id === "place_unrelated" || p.id === tripPlace.id)).toBe(false);
  expect(buildAccountLibrary(library.reels, library.places).find(a => a.id === "JP")?.places).toHaveLength(2);
  user = (await devSignIn({ email: "library-other@example.test" })).user;
  expect(await client("accountReels.list", {})).toEqual({ reels: [], places: [] });
  expect(await client("accountReels.library", {})).toEqual({ reels: [], places: [] });
  user = owner;
  expect((await client("accountReels.list", {})).places).toHaveLength(3);
});

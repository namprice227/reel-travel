import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { placeFixtures } from "@reel/contracts/fixtures";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-flow-safety-"));
vi.stubEnv("DATA_BACKEND", "file"); vi.stubEnv("REEL_DATA_DIR", directory);
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const trips = await import("../../apps/web/src/server/services/trips");
const imports = await import("../../apps/web/src/server/services/inspirations");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const shares = await import("../../apps/web/src/server/services/shares");
const { processImport } = await import("../../apps/web/src/server/jobs/import-inspiration");
const { runJob } = await import("../../apps/web/src/server/jobs/queue");
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith("reel-flow-safety-")) throw Error("Unsafe cleanup");
  fs.rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs();
});
async function fixture() {
  const user = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  const trip = await trips.createTrip(user, { title: "Synthetic safety", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  return { user, trip };
}
const stamp = () => new Date().toISOString();

it("skip releases five active slots, preserves source and does not refund the daily budget", async () => {
  const f = await fixture();
  for (let n = 0; n < 5; n++) {
    const saved = await imports.createInspiration(f.user, f.trip.id, { sourceType: "text", text: "Synthetic source" });
    await imports.skipInspiration(f.user, f.trip.id, saved.inspiration.id);
    await imports.skipInspiration(f.user, f.trip.id, saved.inspiration.id);
    expect(await repos().jobs.get(saved.job.id)).toMatchObject({ status: "cancelled", attempt: 0 });
    expect(await runJob(saved.job.id)).toBe("not_run");
    expect(await repos().inspirations.get(saved.inspiration.id)).toMatchObject({ status: "skipped", text: "Synthetic source" });
  }
  const quota = await repos().rateLimits.consume(`import-day:${f.user.id}`, { now: Date.now(), windowMs: 86400000, limit: 5 });
  expect(quota.allowed).toBe(false);
  await expect(imports.createInspiration(f.user, f.trip.id, { sourceType: "text", text: "Sixth save" })).resolves.toHaveProperty("job");
});

it("skip winning after claim blocks provider startup and every later status write", async () => {
  const f = await fixture();
  const saved = await imports.createInspiration(f.user, f.trip.id, { sourceType: "text", text: "Synthetic source" });
  const job = (await repos().jobs.claim(saved.job.id, { now: stamp(), staleBefore: "2020-01-01T00:00:00.000Z" }))!;
  await imports.skipInspiration(f.user, f.trip.id, saved.inspiration.id);
  const lease = { jobId: job.id, attempt: job.attempt };
  await processImport(saved.inspiration.id, lease);
  for (const status of ["processing", "queued", "failed", "ready"] as const) {
    expect(await repos().imports.transition(saved.inspiration.id, { status }, stamp(), lease)).toBeNull();
  }
  expect(await repos().jobs.settle({ ...job, status: "queued" }, { status: "queued" })).toBe(false);
  expect(await repos().jobs.get(job.id)).toMatchObject({ status: "cancelled" });
  expect(await repos().inspirations.get(saved.inspiration.id)).toMatchObject({ status: "skipped", attempts: 0 });
});

it("processing winning before skip rejects the skip, then retry settlement is atomic", async () => {
  const f = await fixture();
  const saved = await imports.createInspiration(f.user, f.trip.id, { sourceType: "text", text: "Synthetic source" });
  const job = (await repos().jobs.claim(saved.job.id, { now: stamp(), staleBefore: "2020-01-01T00:00:00.000Z" }))!;
  await repos().imports.transition(saved.inspiration.id, { status: "processing" }, stamp(), { jobId: job.id, attempt: 1 });
  await expect(imports.skipInspiration(f.user, f.trip.id, saved.inspiration.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  expect(await repos().jobs.settle({ ...job, status: "queued" }, { status: "queued" })).toBe(true);
  await imports.skipInspiration(f.user, f.trip.id, saved.inspiration.id);
  expect(await repos().jobs.settle({ ...job, status: "failed" }, { status: "failed" })).toBe(false);
  expect(await repos().inspirations.get(saved.inspiration.id)).toMatchObject({ status: "skipped" });
});

it("a superseded attempt cannot overwrite the newer attempt or its outcome", async () => {
  const f = await fixture();
  const saved = await imports.createInspiration(f.user, f.trip.id, { sourceType: "text", text: "Synthetic source" });
  const old = (await repos().jobs.claim(saved.job.id, { now: stamp(), staleBefore: "2020-01-01T00:00:00.000Z" }))!;
  const later = new Date(Date.now() + 3600000).toISOString();
  const current = (await repos().jobs.claim(saved.job.id, { now: later, staleBefore: later }))!;
  expect(current.attempt).toBe(2);
  expect(await repos().imports.transition(saved.inspiration.id, { status: "ready" }, stamp(), { jobId: old.id, attempt: old.attempt })).toBeNull();
  expect(await repos().jobs.settle({ ...old, status: "failed" }, { status: "failed" })).toBe(false);
  expect(await repos().jobs.get(old.id)).toMatchObject({ status: "running", attempt: 2 });
});

it.each(["dates", "destination", "timezone", "preferences", "booking", "place", "legacy rules"])("withholds public plans after %s change, then restores them after regeneration", async kind => {
  const f = await fixture();
  const place = { ...structuredClone(placeFixtures.confirmed), id: `place_${crypto.randomUUID()}`, tripId: f.trip.id };
  await repos().places.insert(place);
  const first = await itinerary.generateItinerary(f.user, f.trip.id, { expectedVersion: null });
  const link = await shares.createShare(f.user, f.trip.id, "https://synthetic.example");
  expect(await shares.getSharedView(link.token)).toMatchObject({ stale: false, itinerary: { version: first.version } });
  if (kind === "dates") await trips.updateTrip(f.user, f.trip.id, { startDate: "2026-11-01", endDate: "2026-11-03" });
  if (kind === "destination") await trips.updateTrip(f.user, f.trip.id, { destination: "Osaka" });
  if (kind === "timezone") await trips.updateTrip(f.user, f.trip.id, { timezone: "Asia/Singapore" });
  if (kind === "preferences") await trips.updateTrip(f.user, f.trip.id, { preferences: { pace: "relaxed" } });
  if (kind === "booking") await trips.createReservation(f.user, f.trip.id, { title: "Synthetic booking", start: "2026-10-01T19:00", end: "2026-10-01T20:00", locked: true });
  if (kind === "place") await repos().places.update({ ...place, selected: { ...place.selected!, name: "Changed synthetic title" } });
  const oldRules = kind === "legacy rules" ? vi.spyOn(repos().itineraries, "getVersion").mockResolvedValue({ ...first, inputFingerprint: "legacy" }) : null;
  expect(await shares.getSharedView(link.token)).toMatchObject({ stale: true, itinerary: null, places: [] });
  oldRules?.mockRestore();
  const next = await itinerary.generateItinerary(f.user, f.trip.id, { expectedVersion: first.version });
  expect(await shares.getSharedView(link.token)).toMatchObject({ stale: false, itinerary: { version: next.version } });
  await shares.revokeShare(f.user, f.trip.id, link.share.id);
  await expect(shares.getSharedView(link.token)).rejects.toMatchObject({ code: "SHARE_REVOKED" });
});

it("distinguishes an ungenerated public trip from an outdated one", async () => {
  const f = await fixture(); const link = await shares.createShare(f.user, f.trip.id, "https://synthetic.example");
  expect(await shares.getSharedView(link.token)).toMatchObject({ stale: false, itinerary: null, places: [] });
});

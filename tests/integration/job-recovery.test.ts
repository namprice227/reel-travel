import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { placeFixtures } from "@reel/contracts/fixtures";
import type { PlaceLookup } from "@reel/ai";

const providers = vi.hoisted(() => ({ extract: vi.fn(), search: vi.fn<PlaceLookup["search"]>() }));
vi.mock("../../apps/web/src/server/providers", () => ({ getProviders: () => ({
  extractor: { extract: providers.extract }, lookup: { search: providers.search },
}) }));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-job-recovery-"));
vi.stubEnv("REEL_DATA_DIR", directory);
vi.stubEnv("DATA_BACKEND", "file");
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { createInspiration } = await import("../../apps/web/src/server/services/inspirations");
const { runJob } = await import("../../apps/web/src/server/jobs/queue");
const { abandonedBefore, IMPORT_ABANDONED_AFTER_MS } = await import("../../apps/web/src/server/jobs/policy");
const user = (await devSignIn({ email: "synthetic-worker@example.test" })).user;

beforeEach(() => {
  vi.useRealTimers(); providers.extract.mockReset(); providers.search.mockReset();
  providers.extract.mockResolvedValue({ status: "ok", clues: [
    { query: "Synthetic A", excerpt: "Synthetic A", hint: null }, { query: "Synthetic B", excerpt: "Synthetic B", hint: null },
  ] });
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
async function saved() {
  const trip = await createTrip(user, { title: "Synthetic recovery", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  return createInspiration(user, trip.id, { sourceType: "text", text: "Synthetic A and Synthetic B" });
}

it("stops after three crashed claims and atomically exposes recovery without calling a provider", async () => {
  const { job, inspiration } = await saved();
  let now = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    expect(await repos().jobs.claim(job.id, { now: new Date(now).toISOString(), staleBefore: abandonedBefore(now) }))
      .toMatchObject({ status: "running", attempt });
    now += IMPORT_ABANDONED_AFTER_MS + 1;
  }
  vi.useFakeTimers(); vi.setSystemTime(now);
  expect(await runJob(job.id)).toBe("failed");
  expect(await runJob(job.id)).toBe("not_run");
  expect(await repos().jobs.get(job.id)).toMatchObject({ status: "failed", attempt: 3 });
  expect(await repos().inspirations.get(inspiration.id)).toMatchObject({ text: inspiration.text, status: "failed", attempts: 3 });
  expect(providers.extract).not.toHaveBeenCalled();
});

it("does not reclaim a still-live attempt, or overwrite a skipped save when exhausted", async () => {
  const { job, inspiration } = await saved();
  const now = new Date().toISOString();
  await repos().jobs.update({ ...job, status: "running", attempt: 3, updatedAt: now });
  expect(await runJob(job.id)).toBe("not_run");
  await repos().inspirations.update({ ...inspiration, status: "skipped" });
  await repos().jobs.update({ ...job, status: "running", attempt: 3, updatedAt: "2020-01-01T00:00:00.000Z" });
  expect(await runJob(job.id)).toBe("failed");
  expect((await repos().inspirations.get(inspiration.id))?.status).toBe("skipped");
});

it("retries a partial import without duplicating candidates or losing source evidence", async () => {
  const { job, inspiration } = await saved();
  const option = placeFixtures.confirmed.selected!;
  providers.search.mockResolvedValueOnce([option]).mockRejectedValueOnce(new Error("Synthetic provider interruption"));
  expect(await runJob(job.id)).toBe("retrying");
  const [partial] = await repos().places.listByTrip(job.tripId);
  expect(partial?.evidence[0]?.inspirationId).toBe(inspiration.id);
  expect((await repos().inspirations.get(inspiration.id))?.text).toBe(inspiration.text);
  const retry = (await repos().jobs.get(job.id))!;
  await repos().jobs.update({ ...retry, runAfter: new Date().toISOString() });
  providers.search.mockResolvedValue([option]);
  expect(await runJob(job.id)).toBe("succeeded");
  const places = await repos().places.listByTrip(job.tripId);
  expect(places).toHaveLength(1);
  expect(places[0]?.id).toBe(partial?.id);
  expect(places[0]?.evidence).toHaveLength(2);
  expect((await repos().inspirations.get(inspiration.id))?.placeIds).toEqual([partial!.id]);
});

it("keeps a final failure recoverable if updating its save fails before the job finishes", async () => {
  const { job, inspiration } = await saved();
  await repos().jobs.update({ ...job, attempt: 2 });
  providers.extract.mockRejectedValue(new Error("Synthetic provider failure"));
  const repository = repos();
  const update = repository.inspirations.update;
  const failure = vi.spyOn(repository.inspirations, "update").mockImplementation(async value => {
    if (value.status === "failed") throw new Error("Synthetic interrupted save update");
    return update(value);
  });
  await expect(runJob(job.id)).rejects.toThrow("Synthetic interrupted save update");
  failure.mockRestore();
  expect(await repos().jobs.get(job.id)).toMatchObject({ status: "running", attempt: 3 });
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + IMPORT_ABANDONED_AFTER_MS + 1);
  expect(await runJob(job.id)).toBe("failed");
  expect((await repos().inspirations.get(inspiration.id))?.status).toBe("failed");
  expect(providers.extract).toHaveBeenCalledOnce();
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import type { JobOutcome } from "../../apps/web/src/server/jobs/queue";

// Synthetic job outcomes; no providers or network.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "routelet-inline-jobs-"));
vi.stubEnv("REEL_DATA_DIR", dataDir);
vi.stubEnv("DATA_BACKEND", "file");
const { runJobInline, CLOCK_SKEW_ALLOWANCE_MS } = await import("../../apps/web/src/server/jobs/inline");
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dataDir, { recursive: true, force: true }); });

function harness(outcomes: JobOutcome[], dues: Array<string | null>) {
  const now = Date.parse("2026-09-24T10:00:00.000Z");
  const sleeps: number[] = [];
  const run = vi.fn(async () => outcomes.shift() ?? "succeeded");
  const dueAt = vi.fn(async () => dues.shift() ?? null);
  return { sleeps, run, dueAt, deps: { run, dueAt, now: () => now, sleep: async (ms: number) => { sleeps.push(ms); } } };
}

it("claims again once due when this clock is behind the database's", async () => {
  // The database stamped runAfter 300 ms ahead of this process's clock, so the first claim was declined.
  const h = harness(["not_run", "succeeded"], ["2026-09-24T10:00:00.300Z"]);
  expect(await runJobInline("job_skew", h.deps)).toBe("succeeded");
  expect(h.sleeps).toEqual([300 + CLOCK_SKEW_ALLOWANCE_MS]);
  expect(h.run).toHaveBeenCalledTimes(2);
});

it("runs scheduled retries in-process until the job settles", async () => {
  const h = harness(["retrying", "retrying", "failed"], ["2026-09-24T10:00:10.000Z", "2026-09-24T10:01:00.000Z"]);
  expect(await runJobInline("job_busy", h.deps)).toBe("failed");
  expect(h.sleeps).toEqual([10_000 + CLOCK_SKEW_ALLOWANCE_MS, 60_000 + CLOCK_SKEW_ALLOWANCE_MS]);
});

it("stops when another runner has claimed the job", async () => {
  const h = harness(["not_run"], [null]);
  expect(await runJobInline("job_elsewhere", h.deps)).toBe("not_run");
  expect(h.run).toHaveBeenCalledTimes(1);
  expect(h.sleeps).toEqual([]);
});

it("reads a queued account-reel job's due time from the store", async () => {
  const { devSignIn } = await import("../../apps/web/src/server/services/auth");
  const { createAccountReel } = await import("../../apps/web/src/server/services/account-reels");
  const user = (await devSignIn({ email: "synthetic-inline@example.test" })).user;
  const { job } = await createAccountReel(user, "https://www.instagram.com/reel/synthetic/");
  const sleeps: number[] = [];
  // Real store lookup of runAfter; the injected run declines once, as a claim ahead of this clock would.
  const outcomes: JobOutcome[] = ["not_run", "succeeded"];
  const result = await runJobInline(job.id, {
    run: async () => outcomes.shift()!, now: () => Date.parse(job.runAfter) - 500,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  expect(result).toBe("succeeded");
  expect(sleeps).toEqual([500 + CLOCK_SKEW_ALLOWANCE_MS]);
});

import { expect, it, vi } from "vitest";
import { runIsolated, pollWorker } from "../../apps/worker/src/supervisor";
import { IMPORT_ATTEMPT_TIMEOUT_MS, IMPORT_ABANDONED_AFTER_MS } from "../../apps/web/src/server/jobs/policy";

it("kills and reaps a stalled attempt before resolving, then can run another process", async () => {
  const signal = new AbortController().signal;
  expect(await runIsolated(["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 100, signal })).toBe("timed_out");
  expect(await runIsolated(["-e", "process.exit(0)"], { timeoutMs: 5000, signal })).toBe("completed");
  expect(IMPORT_ATTEMPT_TIMEOUT_MS).toBeLessThan(IMPORT_ABANDONED_AFTER_MS);
}, 10_000);

it("terminates active child work on shutdown and never launches an already stopped attempt", async () => {
  const controller = new AbortController();
  const result = runIsolated(["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 5000, signal: controller.signal });
  controller.abort();
  expect(await result).toBe("stopped");
  expect(await runIsolated(["-e", "process.exit(10)"], { timeoutMs: 5000, signal: controller.signal })).toBe("stopped");
});

it("reports child failure without treating it as a completed attempt", async () => {
  expect(await runIsolated(["-e", "process.exit(1)"], { timeoutMs: 5000, signal: new AbortController().signal })).toBe("failed");
});

it("does not overlap polls while an attempt is running longer than the interval", async () => {
  const controller = new AbortController();
  let release!: () => void;
  const work = new Promise<void>(resolve => { release = resolve; });
  const runNext = vi.fn(async () => { await work; controller.abort(); return true; });
  const loop = pollWorker(runNext, controller.signal, 1);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(runNext).toHaveBeenCalledTimes(1);
  release();
  await loop;
});

it("stops promptly during an idle poll wait", async () => {
  const controller = new AbortController();
  const called = vi.fn(async () => false);
  const loop = pollWorker(called, controller.signal, 60_000);
  await Promise.resolve();
  controller.abort();
  await loop;
  expect(called).toHaveBeenCalledTimes(1);
});

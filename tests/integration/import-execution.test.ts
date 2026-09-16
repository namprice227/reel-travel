import { afterEach, expect, it, vi } from "vitest";
const service = vi.hoisted(() => vi.fn(async () => ({ job: { id: "job_synthetic" }, inspiration: {} })));
const jobs = vi.hoisted(() => ({ runJob: vi.fn(), runDueJobs: vi.fn() }));
vi.mock("../../apps/web/src/server/jobs/queue", () => jobs);
vi.mock("../../apps/web/src/server/services/inspirations", () => ({
  createInspiration: service, createScreenshotInspiration: service, retryInspiration: service, addInspirationDetails: service,
  getInspiration: vi.fn(), getOwnedAsset: vi.fn(), listInspirations: vi.fn(), skipInspiration: vi.fn(),
}));
const { inspirationHandlers } = await import("../../apps/web/src/server/handlers/inspirations");
const { jobHandlers } = await import("../../apps/web/src/server/handlers/jobs");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each(["inspirations.create", "inspirations.createFromScreenshot", "inspirations.retry", "inspirations.addDetails"] as const)(
  "%s enqueues in Supabase mode without starting provider work after the response", async (id) => {
    vi.stubEnv("DATA_BACKEND", "supabase");
    const runAfterResponse = vi.fn();
    await inspirationHandlers[id]({ user: {}, params: { tripId: "trip_synthetic", inspirationId: "insp_synthetic" }, body: {}, runAfterResponse } as never);
    expect(service).toHaveBeenCalledOnce();
    expect(runAfterResponse).not.toHaveBeenCalled();
    expect(jobs.runJob).not.toHaveBeenCalled();
  },
);

it.each([
  ["production", "supabase", "fake", "fake"],
  ["development", "supabase", "fake", "fake"],
  ["development", "file", "openai", "google"],
])("blocks the old HTTP executor for %s/%s/%s/%s", async (mode, backend, ai, places) => {
  vi.stubEnv("NODE_ENV", mode); vi.stubEnv("DATA_BACKEND", backend);
  vi.stubEnv("AI_PROVIDER", ai); vi.stubEnv("PLACES_PROVIDER", places);
  await expect(jobHandlers["jobs.runDue"]()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(jobs.runDueJobs).not.toHaveBeenCalled();
});

it("retains inline imports and retry execution for the local fake demo", async () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("DATA_BACKEND", "file");
  vi.stubEnv("AI_PROVIDER", "fake"); vi.stubEnv("PLACES_PROVIDER", "fake");
  const runAfterResponse = vi.fn();
  await inspirationHandlers["inspirations.create"]({ user: {}, params: { tripId: "trip_synthetic" }, body: {}, runAfterResponse } as never);
  expect(runAfterResponse).toHaveBeenCalledOnce();
  await runAfterResponse.mock.calls[0]![0]();
  expect(jobs.runJob).toHaveBeenCalledWith("job_synthetic");
  await jobHandlers["jobs.runDue"]();
  expect(jobs.runDueJobs).toHaveBeenCalledWith(10);
});

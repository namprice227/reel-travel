import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";

// Synthetic provider replies only; no network calls.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "routelet-account-reel-retry-"));
vi.stubEnv("REEL_DATA_DIR", dataDir);
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("AI_PROVIDER", "openai");
vi.stubEnv("PLACES_PROVIDER", "google");
for (const name of ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_PLACES_API_KEY"]) vi.stubEnv(name, "synthetic-test-key");

const gemini = vi.fn<typeof fetch>(async (url) => {
  if (String(url).startsWith("https://generativelanguage.googleapis.com/")) return new Response("synthetic busy", { status: 503 });
  throw new Error(`Unexpected external request in offline test: ${String(url)}`);
});
vi.stubGlobal("fetch", gemini);

const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createAccountReel } = await import("../../apps/web/src/server/services/account-reels");
const { runAccountReelJob } = await import("../../apps/web/src/server/jobs/account-reel");

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

it("retries a shelf reel when Gemini is busy instead of calling the Short unreadable", async () => {
  const user = (await devSignIn({ email: "synthetic-shelf-retry@example.test" })).user;
  const { reel, job } = await createAccountReel(user, "https://www.youtube.com/shorts/jTOfOew316s");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const outcome = runAccountReelJob(job.id);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toBe("retrying");
  } finally { vi.useRealTimers(); }
  expect(gemini).toHaveBeenCalledTimes(3);
  expect(await repos().accountReels.get(reel.id)).toMatchObject({ status: "queued", failureCode: null });
});

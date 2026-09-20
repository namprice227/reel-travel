import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { devSignIn } from "../../apps/web/src/server/services/auth";
import { createTrip } from "../../apps/web/src/server/services/trips";
import { createInspiration, getInspiration } from "../../apps/web/src/server/services/inspirations";
import { runJob } from "../../apps/web/src/server/jobs/queue";
import type { User } from "@reel/contracts";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-video-policy-"));
let user: User;
let tripId: string;
beforeAll(async () => {
  for (const [key, value] of Object.entries({ DATA_BACKEND: "file", REEL_DATA_DIR: dataDir, ENABLE_DEV_SIGN_IN: "true",
    AI_PROVIDER: "openai", PLACES_PROVIDER: "google", GOOGLE_AI_API_KEY: "synthetic",
    OPENAI_API_KEY: "synthetic", GOOGLE_PLACES_API_KEY: "synthetic" })) vi.stubEnv(key, value);
  user = (await devSignIn({ email: "synthetic-video@example.test" })).user;
  tripId = (await createTrip(user, { title: "Synthetic video policy", destination: "Tokyo", timezone: "Asia/Tokyo",
    startDate: "2026-10-01", endDate: "2026-10-03" })).id;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dataDir, { recursive: true, force: true }); });

it.each([
  [121, "en", "up to 2 minutes"],
  [60, "vi", "only support English"],
])("stores %s/%s rejection without extraction, lookup or automatic retry", async (duration, language, message) => {
  const fetcher = vi.fn<typeof fetch>(async input => {
    if (String(input) === "https://ytplaylistlength.one/api/calculate") return Response.json({ success: true,
      results: [{ id: "jTOfOew316s", videoCount: 1, fetchedVideoCount: 1, consideredCount: 1, unavailableCount: 0,
        isTruncated: false, rangeStart: 1, rangeEnd: 1, totalSeconds: duration,
        videos: [{ id: "jTOfOew316s", durationSeconds: duration, considered: true }] }] });
    if (String(input).startsWith("https://generativelanguage.googleapis.com/")) return Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
        status: "unsupported_language", transcript: "", language,
      }) }] } }],
    });
    throw new Error("Unexpected extraction or lookup call");
  });
  vi.stubGlobal("fetch", fetcher);
  const sourceUrl = "https://www.youtube.com/watch?v=jTOfOew316s";
  const saved = await createInspiration(user, tripId, { sourceType: "link", url: sourceUrl });
  await runJob(saved.job.id);
  const result = await getInspiration(user, tripId, saved.inspiration.id);
  expect(result.inspiration).toMatchObject({ status: "needs_input", failureCode: "UNSUPPORTED_SOURCE", url: sourceUrl,
    failureMessage: expect.stringContaining(message), placeIds: [] });
  expect(result.job).toMatchObject({ status: "succeeded", attempt: 1 });
  expect(result.places).toEqual([]);
  await runJob(saved.job.id);
  expect(fetcher).toHaveBeenCalledTimes(duration > 120 ? 1 : 2);
});

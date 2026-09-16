import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const root = fileURLToPath(new URL("../../", import.meta.url));
const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/transcribe-youtube.ts", ...args], {
  cwd: root, encoding: "utf8", timeout: 15000, env: { ...process.env, GOOGLE_AI_API_KEY: "", GEMINI_TRANSCRIPTION_MODEL: "", GEMINI_TRANSCRIPTION_TIMEOUT_MS: "" },
});
it("YouTube CLI reports usage without a URL", () => {
  const result = run([]); expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "INVALID_URL" } });
});
it("YouTube CLI reports missing key without live calls", () => {
  const result = run(["https://www.youtube.com/watch?v=jTOfOew316s"]); expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "API_KEY_MISSING" } });
});
it("YouTube CLI reports unsupported links as recovery with exit 1", () => {
  const result = run(["https://www.instagram.com/reel/example"]); expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "needs_input", failureCode: "SOURCE_INACCESSIBLE" });
});

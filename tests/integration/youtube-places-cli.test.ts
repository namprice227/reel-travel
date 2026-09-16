import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const root = fileURLToPath(new URL("../../", import.meta.url));
const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/extract-youtube-places.ts", ...args], {
  cwd: root, encoding: "utf8", timeout: 15000,
  env: { ...process.env, GOOGLE_AI_API_KEY: "", OPENAI_API_KEY: "", GOOGLE_PLACES_API_KEY: "" },
});
it("requires URL and destination without network", () => {
  const result = run([]); expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "INVALID_INPUT" } });
});
it("preflights missing keys without billable requests", () => {
  const result = run(["https://www.youtube.com/watch?v=jTOfOew316s", "Tokyo"]); expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "API_KEY_MISSING" } });
});

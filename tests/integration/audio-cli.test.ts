import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/extract-audio.ts", ...args], {
  cwd: root, encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" }, timeout: 15000,
});
describe("manual audio command (no credentials, no network)", () => {
  it("prints a usage error and exits nonzero without a filepath", () => {
    const result = run([]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "INVALID_FILE" } });
  });
  it("prints a missing-key error and exits nonzero", () => {
    const result = run(["nonexistent.wav"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code: "API_KEY_MISSING" } });
  });
});

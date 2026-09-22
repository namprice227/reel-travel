import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import fixtures from "../../evals/datasets/youtube-reels.json";
const root = fileURLToPath(new URL("../../", import.meta.url));
const url = "https://www.youtube.com/watch?v=jTOfOew316s";
const run = (args: string[], preload?: string) => spawnSync(process.execPath,
  ["--import", "tsx", ...(preload ? ["--import", preload] : []), "scripts/analyze-youtube.ts", ...args], {
    cwd: root, encoding: "utf8", timeout: 15000,
    env: { ...process.env, GOOGLE_AI_API_KEY: preload ? "test" : "", OPENAI_API_KEY: preload ? "test" : "",
      GEMINI_TRANSCRIPTION_MODEL: "", GEMINI_TRANSCRIPTION_TIMEOUT_MS: "", OPENAI_EXTRACTION_MODEL: "", OPENAI_TIMEOUT_MS: "" },
  });
it.each([{ args: [] }, { args: [url, "--bad"] }, { args: [url, "--output"] }])("rejects invalid CLI arguments %#", ({ args }) => {
  const result = run(args);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr).error.code).toBe("INVALID_INPUT");
});
it("checks both credentials before provider work", () => {
  const result = run([url]);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr).error.code).toBe("API_KEY_MISSING");
});
it("returns unsupported source recovery without credentials", () => {
  const result = run(["https://www.instagram.com/reel/synthetic"]);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "needs_input", failureCode: "SOURCE_INACCESSIBLE" });
});
it("prints validated JSON, saves UTF-8 only on request, and refuses overwrite (mocked network)", () => {
  const dir = mkdtempSync(join(tmpdir(), "reel-cli-"));
  try {
    const fixture = fixtures.cases[1];
    const responses = [
      { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(fixture.evidence) }] } }] },
      { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ result: fixture.expected }) }] }] },
    ];
    const preload = join(dir, "offline.mjs");
    writeFileSync(preload, `const responses = ${JSON.stringify(responses)};
globalThis.fetch = async () => { if (!responses.length) throw new Error("Unexpected network"); return Response.json(responses.shift()); };`);
    const output = join(dir, "reel.json");
    const result = run([url, "--output", output], pathToFileURL(preload).href);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.type).toBe("place");
    expect(result.stderr).toContain("Gemini: reading");
    expect(result.stderr).toContain("OpenAI: classifying");
    expect(result.stderr).toContain("Validated result");
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(JSON.parse(result.stdout));
    const previous = readFileSync(output, "utf8");
    const repeat = run([url, "--output", output]);
    expect(repeat.status).toBe(1);
    expect(JSON.parse(repeat.stderr).error.code).toBe("OUTPUT_EXISTS");
    expect(readFileSync(output, "utf8")).toBe(previous);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


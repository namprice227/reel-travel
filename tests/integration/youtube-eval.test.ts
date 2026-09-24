import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { EvidenceArtifactSchema, confirmReview, datasetFor, labelInteractively, newLabels, requireReview } from "../../evals/llm/youtube-review";
import { main } from "../../scripts/eval-youtube";
import { main as benchmark } from "../../scripts/benchmark-llm";
import { attempt, cacheFor } from "../../evals/llm/benchmark";
import { settingsFor } from "../../evals/llm/providers";

const url = "https://www.youtube.com/watch?v=abcdefghijk";
const artifact = () => EvidenceArtifactSchema.parse({
  version: 1, sourceUrl: url, model: "mock-gemini", promptVersion: "youtube-evidence-v1",
  capturedAt: "2026-09-22T00:00:00.000Z", latencyMs: 10,
  evidence: { status: "ok", audio: { transcript: "We visited Hoshi Coffee.", language: "English" },
    visual_observations: [{ timestamp_seconds: 2, visible_text: ["Hoshi Coffee"],
      description: "A coffee sign.", uncertainties: ["Branch unknown"] }], uncertainties: [] },
});
const draft = () => ({ ...newLabels(), ground_truth: [{ name: "Hoshi Coffee", location_context: null, aliases: [], location_aliases: [] }] });
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  const root = path.resolve("evals/private");
  for (const dir of directories.splice(0)) {
    if (!dir.startsWith(root + path.sep)) throw Error("Unexpected test cleanup path.");
    await rm(dir, { recursive: true, force: true });
  }
});
async function session() {
  await mkdir("evals/private", { recursive: true });
  const dir = await mkdtemp(path.resolve("evals/private/youtube-test-"));
  directories.push(dir);
  const readEvidence = vi.fn(async () => ({ model: "mock-gemini", data: artifact().evidence }));
  const compare = vi.fn(async () => {});
  const show = vi.fn();
  const deps = { readEvidence, benchmark: compare, env: {}, show };
  const args = ["--url", url, "--dir", dir];
  return { dir, readEvidence, compare, show, deps, args };
}
describe("evaluation-only human review", () => {
  it("saves approved lookups separately after confirmation without enriching benchmark labels", async () => {
    const s = await session();
    await main([...s.args, "--live"], s.deps);
    await writeFile(path.join(s.dir, "labels.json"), JSON.stringify(draft()));
    const lookup = { search: vi.fn(async () => [{ name: "Hoshi Coffee", address: "Example address", providerPlaceId: "test-id" }] as never) };
    const answers = ["A", "1", "Reviewer", "REVIEWED"];
    await main([...s.args, "--review"], { ...s.deps, lookup, ask: async () => answers.shift()! });
    const saved = await json(path.join(s.dir, "labels.json"));
    const external = await json(path.join(s.dir, "lookup-review.json"));
    expect(external.approvals[0].match.placeId).toBe("test-id");
    expect(external.reviewHash).toBe(saved.reviewHash);
    expect(saved.ground_truth[0].location_context).toBeNull();
    expect(saved.ground_truth[0].google_place_id).toBeUndefined();
    expect(lookup.search).toHaveBeenCalledTimes(1);
    const rejected = ["A", "1", "Reviewer", "wrong"];
    await expect(main([...s.args, "--review"], { ...s.deps, lookup, ask: async () => rejected.shift()! })).rejects.toThrow("not confirmed");
    expect(await json(path.join(s.dir, "lookup-review.json"))).toEqual(external);
  });
  it("distinguishes unlabelled null from a deliberately reviewed empty list", () => {
    expect(() => datasetFor(artifact(), newLabels())).toThrow("incomplete");
    expect(() => requireReview(artifact(), draft())).toThrow("missing or stale");
    const empty = { ...newLabels(), ground_truth: [] };
    expect(() => confirmReview(artifact(), empty, "reviewer", "REVIEWED")).toThrow("not confirmed");
    expect(requireReview(artifact(), confirmReview(artifact(), empty, "reviewer", "CONFIRM EMPTY")).cases[0].ground_truth).toEqual([]);
  });
  it("invalidates human confirmation after either evidence or labels change", () => {
    const a = artifact(), reviewed = confirmReview(a, draft(), "reviewer", "REVIEWED");
    expect(requireReview(a, reviewed).cases[0].ground_truth).toHaveLength(1);
    const changed = structuredClone(a);
    changed.evidence.audio.transcript += " changed";
    expect(() => requireReview(changed, reviewed)).toThrow("stale");
    expect(() => requireReview(a, { ...reviewed, ground_truth: [] })).toThrow("stale");
    expect(() => requireReview(a, { ...reviewed, human_reviewed: false })).toThrow("missing");
  });
  it("reuses shared evidence text and never includes reviewer metadata in model inputs", () => {
    const dataset = datasetFor(artifact(), draft());
    expect(dataset.cases[0].visual_observations).toEqual(["Hoshi Coffee\nA coffee sign."]);
    expect(dataset.cases[0].transcript).toBe("We visited Hoshi Coffee.");
    expect(JSON.stringify(dataset)).not.toContain("human_reviewed");
    expect(JSON.stringify(dataset)).not.toContain("reviewer");
  });
  it("collects independent human labels with explicit confirmation", async () => {
    const answers = ["E 1", "", "", "Hoshi", "F", "Reviewer A", "REVIEWED"];
    const reviewed = await labelInteractively(artifact(), newLabels(), async () => answers.shift()!, () => {});
    expect(reviewed).toMatchObject({ human_reviewed: true, reviewer: "Reviewer A",
      ground_truth: [{ name: "Hoshi Coffee", location_context: null, aliases: ["Hoshi"] }] });
    expect(() => requireReview(artifact(), reviewed)).not.toThrow();
  });
  it("rejects duplicate truth labels and invalid evidence before confirmation", () => {
    const d = draft();
    d.ground_truth.push(d.ground_truth[0]);
    expect(() => confirmReview(artifact(), d, "reviewer", "REVIEWED")).toThrow();
    expect(EvidenceArtifactSchema.safeParse({ ...artifact(), evidence: { ...artifact().evidence, status: "unavailable" } }).success).toBe(false);
  });
});

describe("YouTube evaluation stages", () => {
  it("prepares once, stops before comparisons, and preserves cached evidence", async () => {
    const s = await session();
    await main([...s.args, "--live"], s.deps);
    expect(s.readEvidence).toHaveBeenCalledTimes(1);
    expect(s.compare).not.toHaveBeenCalled();
    expect(await json(path.join(s.dir, "labels.json"))).toEqual(newLabels());
    await main([...s.args, "--live"], s.deps);
    expect(s.readEvidence).toHaveBeenCalledTimes(1);
    expect(s.compare).not.toHaveBeenCalled();
  });
  it("blocks both live and offline comparisons until humans confirm labels", async () => {
    const s = await session();
    await main([...s.args, "--live"], s.deps);
    await expect(main([...s.args, "--run", "--live"], s.deps)).rejects.toThrow("review");
    await expect(main([...s.args, "--offline"], s.deps)).rejects.toThrow("review");
    expect(s.compare).not.toHaveBeenCalled();
  });
  it("supports JSON editing, confirms review offline, and calls the benchmark only on run", async () => {
    const s = await session();
    await main([...s.args, "--live"], s.deps);
    await writeFile(path.join(s.dir, "labels.json"), JSON.stringify(draft()));
    const answers = ["A", "Reviewer", "REVIEWED"];
    await main([...s.args, "--review"], { ...s.deps, ask: async () => answers.shift()! });
    expect(s.readEvidence).toHaveBeenCalledTimes(1);
    expect(s.compare).not.toHaveBeenCalled();
    await main([...s.args, "--provider", "all", "--run", "--live"], s.deps);
    expect(s.compare).toHaveBeenCalledTimes(1);
    expect(s.compare.mock.calls[0]).toBeDefined();
    const labels = await json(path.join(s.dir, "labels.json"));
    const provenance = await json(path.join(s.dir, "runs", labels.reviewHash, "review.json"));
    expect(provenance).toMatchObject({ reviewer: "Reviewer", human_reviewed: true, evidenceCostUsd: null });
    await writeFile(path.join(s.dir, "labels.json"), JSON.stringify({ ...labels, ground_truth: [] }));
    await expect(main([...s.args, "--run", "--live"], s.deps)).rejects.toThrow("stale");
    expect(s.compare).toHaveBeenCalledTimes(1);
  });
  it("does not persist rejected reviews or call comparators", async () => {
    const s = await session();
    await main([...s.args, "--live"], s.deps);
    const answers = ["E 1", "", "", "", "F", "Reviewer", "no"];
    await expect(main([...s.args, "--review"], { ...s.deps, ask: async () => answers.shift()! })).rejects.toThrow("not confirmed");
    expect((await json(path.join(s.dir, "labels.json"))).human_reviewed).toBe(false);
    expect(s.compare).not.toHaveBeenCalled();
  });
  it("rejects concurrent label edits rather than overwriting them", async () => {
    const s = await session();
    await main([...s.args, "--live"], s.deps);
    await writeFile(path.join(s.dir, "labels.json"), JSON.stringify(draft()));
    let n = 0;
    await expect(main([...s.args, "--review"], { ...s.deps, ask: async () => {
      if (++n === 1) return "A";
      if (n === 2) return "Reviewer";
      await writeFile(path.join(s.dir, "labels.json"), JSON.stringify(newLabels()));
      return "REVIEWED";
    } })).rejects.toThrow("changed during review");
    expect(await json(path.join(s.dir, "labels.json"))).toEqual(newLabels());
  });
  it("never creates labels for unavailable/malformed video evidence", async () => {
    const s = await session();
    await expect(main([...s.args, "--live"], { ...s.deps,
      readEvidence: async () => ({ model: "mock", data: { ...artifact().evidence, status: "unavailable" } }) })).rejects.toThrow();
    await expect(readFile(path.join(s.dir, "labels.json"))).rejects.toThrow();
    expect(s.compare).not.toHaveBeenCalled();
  });
  it("rejects conflicting stages, URL/session mismatches, and output outside private evals", async () => {
    const s = await session();
    await expect(main([...s.args, "--review", "--live"], s.deps)).rejects.toThrow("Choose one stage");
    await expect(main([...s.args, "--resume", "--live"], s.deps)).rejects.toThrow("Choose one stage");
    await expect(main(["--url", url, "--dir", "apps/web", "--live"], s.deps)).rejects.toThrow("subdirectory");
    await main([...s.args, "--live"], s.deps);
    await expect(main(["--url", "https://youtu.be/zyxwvutsrqp", "--dir", s.dir, "--live"], s.deps)).rejects.toThrow("mismatch");
    expect(s.readEvidence).toHaveBeenCalledTimes(1);
  });
  it("replays an actual benchmark cache offline and preserves review provenance", async () => {
    const s = await session();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await main([...s.args, "--live"], s.deps);
    const a = EvidenceArtifactSchema.parse(await json(path.join(s.dir, "evidence.json")));
    const labels = confirmReview(a, draft(), "Reviewer", "REVIEWED");
    await writeFile(path.join(s.dir, "labels.json"), JSON.stringify(labels));
    await main([...s.args, "--provider", "openai", "--run", "--live"], s.deps);
    const dataset = requireReview(a, labels);
    const row = await attempt(dataset.cases[0], { id: "openai", model: "mock", settings: settingsFor("openai", "mock"),
      async generate() { return { model: "mock", text: '{"place_clues":[]}', complete: true,
        usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0 } }; } });
    const runDir = path.join(s.dir, "runs", labels.reviewHash!);
    await writeFile(path.join(runDir, "cache.json"), JSON.stringify(cacheFor(dataset, [row])));
    await expect(main([...s.args, "--run", "--live"], s.deps)).rejects.toThrow("cache already exists");
    await main([...s.args, "--provider", "openai", "--offline"], { ...s.deps, benchmark });
    const report = await json(path.join(runDir, "llm-place-extraction-results.json"));
    expect(report.mode).toBe("offline-replay");
    expect(report.summary[0].recall).toBeNull();
    expect(report.summary[0].audit.finalized).toBe(false);
    expect(s.readEvidence).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cacheFor, RowSchema } from "../../evals/llm/benchmark";
import { adjudicateRun, adjudicateInteractively } from "../../evals/llm/interactive-adjudication";
import { adjudicationDraft, scoringReview } from "../../evals/llm/adjudication";
import { evaluate, type Row } from "../../evals/llm/benchmark";
import { DatasetSchema, inputHash } from "../../evals/llm/schema";
import { emptyUsage, settingsFor } from "../../evals/llm/providers";
const dataset = DatasetSchema.parse({ description: "synthetic", split: "development", cases: [{ id: "test", synthetic: true,
  transcript: "Cedar Statue", ground_truth: [{ name: "Cedar", location_context: null }] }] });
const row: Row = RowSchema.parse({ caseId: "test", inputHash: inputHash(dataset.cases[0]), provider: "deepseek", requestedModel: "mock", returnedModel: "mock",
  settings: settingsFor("deepseek", "mock"), latencyMs: 1, usage: emptyUsage(), complete: true, error: null,
  text: JSON.stringify({ place_clues: [{ name: "Cedar Statue", location_context: null, evidence: "Cedar Statue", confidence: 1 }] }) });
async function run(answers: string[]) {
  const original = adjudicationDraft(dataset, [row]), output: string[] = [];
  const doc = await adjudicateInteractively(original, dataset, [row], async q => {
    if (!answers.length) throw Error("Unexpected prompt: " + q);
    return answers.shift()!;
  }, s => output.push(s));
  expect(original.confirmation).toBe("");
  return { doc, output };
}
describe("interactive adjudication", () => {
  it.each(["C", "I", "X"])("completes %s with zero unresolved matches and explicit attestation", async choice => {
    const { doc, output } = await run(["", "SCOPE", choice, ...(choice === "C" ? ["0"] : []), "Checked source", "Reviewer", "ADJUDICATED"]);
    expect(doc).toMatchObject({ reviewer: "Reviewer", confirmation: "ADJUDICATED" });
    expect(doc.cases[0].scopeConfirmed).toBe(true);
    const scored = evaluate(dataset.cases[0], row, { currency: "USD", models: {} }, scoringReview(doc, row)).score;
    expect(scored.manualReview).toHaveLength(0);
    expect(scored.audit.finalized).toBe(true);
    expect(output.join("\n")).toContain("Cedar Statue");
    expect(JSON.parse(row.text).place_clues[0].name).toBe("Cedar Statue");
  });
  it("does not accept invalid indices or blank reviewer", async () => {
    const { doc } = await run(["bad", "", "SCOPE", "C", "99", "C", "0", "checked", "", "Reviewer", "ADJUDICATED"]);
    expect(doc.rows[0].entries[0].truthIndex).toBe(0);
  });
  it("cancels and rejects missing final confirmation", async () => {
    await expect(run(["Q"])).rejects.toThrow("cancelled");
    await expect(run(["", "SCOPE", "I", "checked", "Reviewer", "yes"])).rejects.toThrow("not confirmed");
  });
  it("saves only the adjudication and prints replay after completion; cancellation preserves it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "reel-adjudication-"));
    try {
      const files = { "dataset.json": JSON.stringify(dataset), "cache.json": JSON.stringify(cacheFor(dataset, [row])),
        "evaluation-review.json": JSON.stringify(adjudicationDraft(dataset, [row])) };
      for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);
      const answers = ["", "SCOPE", "C", "0", "checked", "Reviewer", "ADJUDICATED"], output: string[] = [];
      await adjudicateRun(dir, { ask: async () => answers.shift()!, show: s => output.push(s), replayCommand: "exact replay command" });
      const saved = await readFile(path.join(dir, "evaluation-review.json"), "utf8");
      expect(JSON.parse(saved).confirmation).toBe("ADJUDICATED");
      expect(output.at(-1)).toBe("exact replay command");
      expect(await readFile(path.join(dir, "cache.json"), "utf8")).toBe(files["cache.json"]);
      await expect(adjudicateRun(dir, { ask: async () => "Q", show: () => {}, replayCommand: "replay" })).rejects.toThrow("cancelled");
      expect(await readFile(path.join(dir, "evaluation-review.json"), "utf8")).toBe(saved);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("applies source exclusions equally without asking a now out-of-scope prediction", async () => {
    const { doc } = await run(["0", "incidental", "SCOPE", "Reviewer", "ADJUDICATED"]);
    expect(doc.cases[0].exclusions).toHaveLength(1);
  });
});

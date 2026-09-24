import { describe, expect, it } from "vitest";
import { adjudicationDraft, scoringReview } from "../../evals/llm/adjudication";
import { evaluate, summarize, type Row } from "../../evals/llm/benchmark";
import { metricDiagnostics } from "../../evals/llm/diagnostics";
import { DatasetSchema, inputHash } from "../../evals/llm/schema";
import { emptyUsage, settingsFor } from "../../evals/llm/providers";
const dataset = DatasetSchema.parse({ description: "synthetic diagnostics", split: "development", cases: [{
  id: "test", synthetic: true, transcript: "Cedar Museum", ground_truth: [{ name: "Cedar Museum", location_context: null }] }] });
const row: Row = { caseId: "test", inputHash: inputHash(dataset.cases[0]), provider: "openai", requestedModel: "mock", returnedModel: "mock",
  settings: settingsFor("openai", "mock"), latencyMs: 1, usage: emptyUsage(), complete: true, error: null,
  text: JSON.stringify({ place_clues: [{ name: "Cedar Museum", location_context: null, evidence: "Cedar Museum", confidence: 1 }] }) };
function run(confirmed: boolean, r = row, d = dataset) {
  const review = adjudicationDraft(d, [r]);
  if (confirmed) { review.reviewer = "Reviewer"; review.confirmation = "ADJUDICATED"; review.cases[0].scopeConfirmed = true; }
  const result = evaluate(d.cases[0], r, { currency: "USD", models: {} }, scoringReview(review, r));
  return metricDiagnostics([result], summarize([result]), review)[0];
}
describe("metric diagnostics", () => {
  it("distinguishes unfinished scope from zero denominators despite zero unresolved matches", () => {
    const d = run(false);
    expect(d.counts).toMatchObject({ truePositives: 1, unresolvedEntityCases: 0, finalizedGroundTruthEntityCount: null });
    expect(d.metrics.precision).toMatchObject({ value: null, denominator: 1, status: "incomplete" });
    expect(d.metrics.precision.reasons).toContain("evaluation-review.json: reviewer is empty");
  });
  it("reports defined metrics once scope is complete", () => {
    const d = run(true);
    for (const key of ["precision", "recall", "f1"] as const) expect(d.metrics[key]).toMatchObject({ status: "defined", value: 1, reasons: [] });
    expect(d.counts).toMatchObject({ finalizedGroundTruthEntityCount: 1, falseNegatives: 0 });
    expect(d.metrics.hallucinationRate).toMatchObject({ value: 0, denominator: 1 });
  });
  it("reports genuinely zero denominators without mislabelling defined zero recall/F1", () => {
    const d = run(true, { ...row, text: '{"place_clues":[]}' });
    expect(d.metrics.precision).toMatchObject({ denominator: 0, status: "zero_denominator" });
    expect(d.metrics.hallucinationRate.status).toBe("zero_denominator");
    expect(d.metrics.recall).toMatchObject({ value: 0, denominator: 1, status: "defined" });
    expect(d.metrics.f1.value).toBe(0);
  });
  it("names the unresolved prediction instead of treating it as a false positive", () => {
    const d = run(true, { ...row, text: row.text.replace('"name":"Cedar Museum"', '"name":"Cedar"') });
    expect(d.counts).toMatchObject({ unresolvedEntityCases: 1, falsePositives: 0, falseNegatives: null });
    expect(d.unresolved[0].prediction.name).toBe("Cedar");
    expect(d.metrics.precision.status).toBe("incomplete");
  });
});

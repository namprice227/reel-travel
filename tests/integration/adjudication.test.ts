import { describe, expect, it } from "vitest";
import { adjudicationDraft, scoringReview, validateAdjudication } from "../../evals/llm/adjudication";
import { evaluate, summarize, type Row } from "../../evals/llm/benchmark";
import { predictionKey, score } from "../../evals/llm/metrics";
import { DatasetSchema, inputHash, type Prediction } from "../../evals/llm/schema";
import { emptyUsage, settingsFor } from "../../evals/llm/providers";
const dataset = () => DatasetSchema.parse({ description: "Synthetic methodology checks", split: "development", cases: [{
  id: "intent", synthetic: true, transcript: "Visit Cedar Museum. A map in the background says Westhaven. Cedar is in Eastport.",
  ground_truth: [{ name: "Cedar Museum", location_context: null }, { name: "Westhaven", location_context: null }] }] });
const p = (name = "Cedar", location_context: string | null = null): Prediction =>
  ({ name, location_context, evidence: "Visit Cedar Museum.", confidence: 1 });
function row(predictions = [p()], provider: Row["provider"] = "openai"): Row {
  return { caseId: "intent", inputHash: inputHash(dataset().cases[0]), provider, requestedModel: "mock", returnedModel: "mock",
    settings: settingsFor(provider, "mock"), latencyMs: 1, usage: emptyUsage(), text: JSON.stringify({ place_clues: predictions }), complete: true, error: null };
}
const confirmed = (rows: Row[]) => {
  const doc = adjudicationDraft(dataset(), rows);
  doc.reviewer = "Test reviewer"; doc.confirmation = "ADJUDICATED"; doc.cases[0].scopeConfirmed = true;
  return doc;
};
describe("auditable evaluation methodology", () => {
  it("withholds final metrics and false negatives while name adjudication is unresolved", () => {
    const result = score(dataset().cases[0], [p()]);
    expect(result).toMatchObject({ tp: 0, precision: null, recall: null, f1: null,
      audit: { falsePositives: 0, falseNegatives: null, unresolved: 1, finalized: false } });
  });
  it("separates unique entity credit from missing or invented location detail", () => {
    const c = dataset().cases[0]; c.ground_truth = [{ ...c.ground_truth[0], location_context: "Eastport" }];
    expect(score(c, [p("Cedar Museum")])).toMatchObject({ tp: 1, precision: 1, audit: { branchResolution: { eligible: 1, correct: 0 } } });
    expect(score(c, [p("Cedar Museum", "Invented City")])).toMatchObject({ tp: 1, precision: 1,
      unsupported: 1, hallucinationRate: 1, audit: { falsePositives: 0, locationClaims: { unsupported: 1 } } });
  });
  it("excludes incidental truth consistently across providers and requires scope confirmation", () => {
    const rows = [row([p("Cedar Museum"), p("Westhaven")]), row([p("Cedar Museum"), p("Westhaven")], "anthropic")];
    const draft = adjudicationDraft(dataset(), rows);
    expect(evaluate(dataset().cases[0], rows[0], { currency: "USD", models: {} }, scoringReview(draft, rows[0])).score.precision).toBeNull();
    const doc = confirmed(rows); doc.cases[0].exclusions = [{ truthIndex: 1, reason: "Incidental map label, not presented as a destination" }];
    const valid = validateAdjudication(doc, dataset(), rows);
    for (const r of rows) {
      const result = evaluate(dataset().cases[0], r, { currency: "USD", models: {} }, scoringReview(valid, r));
      expect(result.score).toMatchObject({ tp: 1, expected: 1, predicted: 1, precision: 1,
        audit: { groundTruthCount: 2, excludedGroundTruth: 1, excludedPredictions: 1 } });
    }
  });
  it.each(["correct", "incorrect", "excluded"] as const)("applies explicit %s decisions without altering model output", outcome => {
    const r = row(), original = r.text, doc = confirmed([r]);
    const entry = doc.rows[0].entries[0]; entry.outcome = outcome; entry.truthIndex = outcome === "correct" ? 0 : null; entry.reason = "Independent source review";
    const valid = validateAdjudication(doc, dataset(), [r]);
    const result = evaluate(dataset().cases[0], r, { currency: "USD", models: {} }, scoringReview(valid, r));
    expect(r.text).toBe(original); expect(result.score.manualReview).toHaveLength(0);
    expect(result.score.audit.finalized).toBe(true);
    expect(result.score.audit.falseNegatives).toBe(outcome === "correct" ? 1 : 2);
    expect(result.score.tp).toBe(outcome === "correct" ? 1 : 0);
    expect(result.score.audit.falsePositives).toBe(outcome === "incorrect" ? 1 : 0);
    expect(result.score.audit.excludedPredictions).toBe(outcome === "excluded" ? 1 : 0);
  });
  it("invalidates decisions after evidence, label, response or immutable review edits", () => {
    const r = row(), doc = confirmed([r]);
    const changed = dataset(); changed.cases[0].transcript += " changed";
    expect(() => validateAdjudication(doc, changed, [r])).toThrow("stale");
    const labels = dataset(); labels.cases[0].ground_truth[0].name = "Different";
    expect(() => validateAdjudication(doc, labels, [r])).toThrow("stale");
    expect(() => validateAdjudication(doc, dataset(), [{ ...r, text: "different" }])).toThrow("stale");
    doc.rows[0].entries[0].prediction.name = "Tampered";
    expect(() => validateAdjudication(doc, dataset(), [r])).toThrow("stale");
  });
  it("rejects missing review reasons, invalid truth indices and incorrect confirmation", () => {
    const r = row(), doc = confirmed([r]);
    doc.rows[0].entries[0].outcome = "incorrect";
    expect(() => validateAdjudication(doc, dataset(), [r])).toThrow("reason");
    doc.rows[0].entries[0].reason = "reviewed"; doc.rows[0].entries[0].outcome = "correct"; doc.rows[0].entries[0].truthIndex = 90;
    expect(() => validateAdjudication(doc, dataset(), [r])).toThrow("truthIndex");
    doc.confirmation = "yes";
    expect(() => validateAdjudication(doc, dataset(), [r])).toThrow("confirmation");
  });
  it("does not allow lookup knowledge or adjudication to rescue fabricated evidence", () => {
    const prediction = p("Cedar Museum", "Lookup City");
    expect(() => score(dataset().cases[0], [prediction], { decisions: { [predictionKey(prediction)]: { location: "supported", reason: "Maps lookup" } } })).toThrow("source");
    const bad = { ...prediction, evidence: "fabricated" };
    expect(score(dataset().cases[0], [bad], { decisions: { [predictionKey(bad)]: { outcome: "correct", truthIndex: 0, reason: "reviewed" } } }))
      .toMatchObject({ tp: 0, unsupported: 1 });
  });
  it("keeps aggregate scores pending and provides a bounded claim denominator for aliases", () => {
    const r = row();
    const result = evaluate(dataset().cases[0], r, { currency: "USD", models: {} });
    expect(summarize([result])[0]).toMatchObject({ precision: null, recall: null, f1: null, audit: { unresolved: 1 } });
    const c = dataset().cases[0]; c.ground_truth[0].aliases = ["Cedar"];
    const s = score(c, [p("Cedar", "Wrong"), p("Cedar Museum", "Wrong")]);
    expect(s).toMatchObject({ tp: 1, predicted: 1, unsupported: 2, hallucinationRate: 1, audit: { hallucinationDenominator: 2 } });
  });
});

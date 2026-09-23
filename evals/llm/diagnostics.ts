import type { Evaluated, summarize } from "./benchmark";
import type { adjudicationDraft } from "./adjudication";

/** Explain withholding independently from zero denominators; never substitute provisional scores. */
export function metricDiagnostics(rows: Evaluated[], summary: ReturnType<typeof summarize>, review: ReturnType<typeof adjudicationDraft>) {
  const approval = { reviewerPresent: Boolean(review.reviewer.trim()),
    confirmationValid: review.confirmation === "ADJUDICATED" };
  return summary.map(s => {
    const group = rows.filter(r => r.provider + "/" + r.requestedModel === s.model);
    const caseIds = new Set(group.map(r => r.caseId));
    const scopePending = review.cases.filter(c => caseIds.has(c.caseId) && !c.scopeConfirmed).map(c => c.caseId);
    const blockers: string[] = [];
    if (!approval.reviewerPresent) blockers.push("evaluation-review.json: reviewer is empty");
    if (!approval.confirmationValid) blockers.push("evaluation-review.json: confirmation must be ADJUDICATED");
    if (scopePending.length) blockers.push("Source scope not confirmed: " + scopePending.join(", "));
    if (s.audit.unresolved) blockers.push(s.audit.unresolved + " unresolved entity match(es)");
    const finalized = s.audit.finalized;
    const fn = finalized ? s.expected - s.tp : null;
    const describe = (value: number | null, numerator: number, denominator: number | null,
      formula: string, incomplete: string[]) => ({ value, numerator, denominator, formula,
        status: value !== null ? "defined" : incomplete.length ? "incomplete" : "zero_denominator",
        reasons: value !== null ? [] : incomplete.length ? incomplete : ["Required denominator is zero"] });
    const entityBlockers = finalized ? [] : blockers.length ? blockers : ["Entity scoring is incomplete"];
    const hallucinationBlockers = [...entityBlockers,
      ...(s.audit.locationUnresolved ? [s.audit.locationUnresolved + " unresolved location claim(s)"] : [])];
    return { model: s.model, approval, scopePending,
      counts: { finalizedGroundTruthEntityCount: approval.reviewerPresent && approval.confirmationValid && !scopePending.length ? s.expected : null,
        candidateGroundTruthEntityCount: s.expected, rawPredictionCount: s.audit.rawPredictionCount,
        eligibleEntityPredictionCount: s.predicted, truePositives: s.tp, falsePositives: s.audit.falsePositives,
        falseNegatives: fn, currentlyUnmatchedGroundTruthCount: s.expected - s.tp,
        hallucinatedPredictions: s.unsupported, eligibleHallucinationPredictions: s.audit.hallucinationDenominator,
        excludedPredictions: s.audit.excludedPredictions, excludedGroundTruth: s.audit.excludedGroundTruth,
        unresolvedEntityCases: s.audit.unresolved, unresolvedLocationCases: s.audit.locationUnresolved },
      metrics: {
        precision: describe(s.precision, s.tp, s.tp + s.audit.falsePositives, "TP / (TP + FP)", entityBlockers),
        recall: describe(s.recall, s.tp, fn === null ? null : s.tp + fn, "TP / (TP + FN)", entityBlockers),
        f1: describe(s.f1, 2 * s.tp, fn === null ? null : 2 * s.tp + s.audit.falsePositives + fn,
          "2 * precision * recall / (precision + recall), equivalently 2TP / (2TP + FP + FN); zero when TP=0 and the count denominator is positive", entityBlockers),
        hallucinationRate: describe(s.hallucinationRate, s.unsupported, s.audit.hallucinationDenominator,
          "unsupported predictions / eligible prediction claims", hallucinationBlockers),
      },
      unresolved: group.flatMap(r => [
        ...r.score.manualReview.map(m => ({ caseId: r.caseId, kind: "entity", ...m })),
        ...r.score.locationClaims.filter(l => l.status === "unresolved" && !r.score.incorrect.includes(l.prediction))
          .map(l => ({ caseId: r.caseId, kind: "location", prediction: l.prediction, reason: "Source location relationship requires adjudication" })),
      ]),
    };
  });
}
export function diagnosticsMarkdown(diagnostics: ReturnType<typeof metricDiagnostics>) {
  const lines = ["# Metric diagnostics", "", "Counts are provisional until scope and required adjudication are complete. Null final FN is not zero FN.", "",
    "Source labels marked REVIEWED are separate from evaluation-review.json adjudication. No decisions are auto-approved.", ""];
  for (const d of diagnostics) {
    lines.push("## " + d.model, "", "```json", JSON.stringify(d.counts, null, 2), "```", "");
    for (const [name, m] of Object.entries(d.metrics)) lines.push("- " + name + ": " + m.status + "; " + m.formula +
      "; numerator=" + m.numerator + "; denominator=" + (m.denominator ?? "pending adjudication") +
      (m.reasons.length ? "; " + m.reasons.join("; ") : "") + ".");
    lines.push("", "Unresolved cases:", "```json", JSON.stringify(d.unresolved, null, 2), "```", "");
  }
  lines.push("Complete the listed decisions and case scope in evaluation-review.json, set reviewer and ADJUDICATED, then replay offline. Do not change model outputs.", "");
  return lines.join("\n");
}

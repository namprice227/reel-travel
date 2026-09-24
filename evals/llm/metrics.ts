import { matchEntityName, normalizedEntityName } from "./entity-matching";
import { hash, normalize, type Case, type Prediction } from "./schema";
export const SCORING_VERSION = "entity-scope-adjudication-v1";
export type Decision = { outcome?: "correct" | "incorrect" | "excluded"; truthIndex?: number; reason: string;
  location?: "supported" | "unsupported" | "excluded" };
export type ScoringReview = { decisions?: Record<string, Decision>; excludedTruthIndices?: number[]; scopeConfirmed?: boolean };
export const predictionKey = (p: Prediction) => hash(p);
export function rates(tp: number, predicted: number, expected: number, unsupported: number) {
  return { precision: predicted ? tp / predicted : null, recall: expected ? tp / expected : null,
    f1: predicted + expected ? 2 * tp / (predicted + expected) : null,
    hallucinationRate: predicted ? unsupported / predicted : null };
}
export function score(c: Case, predictions: Prediction[], review: ScoringReview = {}) {
  const excludedTruth = new Set(review.excludedTruthIndices ?? []);
  const groups = new Map<string, Prediction[]>();
  for (const p of predictions) {
    const key = normalizedEntityName(p.name) + "|" + normalize(p.location_context);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const seen = new Set<number>(), duplicates: Prediction[] = [], hallucinated: Prediction[] = [];
  const manualReview: { prediction: Prediction; reason: string }[] = [];
  const matched: { prediction: Prediction; truthIndex: number }[] = [];
  const excluded: { prediction: Prediction; reason: string }[] = [];
  const incorrect: Prediction[] = [];
  const locationClaims: { prediction: Prediction; status: "supported" | "unsupported" | "unresolved" | "excluded" }[] = [];
  for (const group of groups.values()) {
    const p = group[0];
    const decisions = group.map(item => review.decisions?.[predictionKey(item)]).filter((d): d is Decision => Boolean(d));
    if (new Set(decisions.map(d => hash(d))).size > 1) throw Error("Conflicting adjudication for duplicate predictions");
    const decision = decisions[0];
    const evidenceSupported = group.some(item => item.evidence.trim().length > 0 &&
      [c.transcript, ...c.visual_observations].some(text => text.includes(item.evidence)));
    const candidates = c.ground_truth.map((g, i) => {
      const matches = [g.name, ...g.aliases].map(name => matchEntityName(name, p.name));
      return { g, i, kind: matches.includes("exact") ? "exact" : matches.includes("review") ? "review" : "none" };
    });
    const names = candidates.filter(item => item.kind === (candidates.some(n => n.kind === "exact") ? "exact" : "review"));
    // Source-scope exclusions are shared by every model. Never silently remove fuzzy candidates.
    if (evidenceSupported && names.length && names.every(n => n.kind === "exact" && excludedTruth.has(n.i))) {
      excluded.push({ prediction: p, reason: "Entity excluded from source scope for all models" }); continue;
    }
    if (evidenceSupported && decision?.outcome === "excluded") {
      excluded.push({ prediction: p, reason: decision.reason }); continue;
    }
    let target: number | undefined;
    if (!evidenceSupported || decision?.outcome === "incorrect") incorrect.push(p);
    else if (decision?.outcome === "correct") {
      if (decision.truthIndex === undefined || !c.ground_truth[decision.truthIndex] || excludedTruth.has(decision.truthIndex))
        throw Error("Invalid adjudicated truth index");
      target = decision.truthIndex;
    } else {
      const active = names.filter(n => !excludedTruth.has(n.i));
      // Location can distinguish identically named branches, but never gates a unique entity match.
      const possible = active.length > 1 && p.location_context !== null ? active.filter(({ g }) =>
        [g.location_context, ...g.location_aliases].some(area => area !== null && normalize(area) === normalize(p.location_context))) : active;
      if (possible.length === 1 && possible[0].kind === "exact") target = possible[0].i;
      else if (active.length) manualReview.push({ prediction: p, reason: "Entity identity or branch is ambiguous; adjudication required" });
      else incorrect.push(p);
    }
    if (target !== undefined) {
      if (seen.has(target)) duplicates.push(p);
      else { seen.add(target); matched.push({ prediction: p, truthIndex: target }); }
    }
    if (p.location_context !== null) {
      const truth = target === undefined ? undefined : c.ground_truth[target];
      const exact = truth && [truth.location_context, ...truth.location_aliases].some(area =>
        area !== null && normalize(area) === normalize(p.location_context));
      const sourceMentions = group.some(item => (" " + normalize(item.evidence) + " ").includes(" " + normalize(p.location_context) + " "));
      if (decision?.location === "supported" && !exact && ![c.transcript, ...c.visual_observations].some(text =>
        (" " + normalize(text) + " ").includes(" " + normalize(p.location_context) + " ")))
        throw Error("Approved location must be present in source evidence or source ground truth");
      const status = !evidenceSupported ? "unsupported" : decision?.location ?? (exact ? "supported" :
        truth?.location_context != null || !sourceMentions ? "unsupported" : "unresolved");
      locationClaims.push({ prediction: p, status });
    }
    if (incorrect.includes(p) || locationClaims.some(l => l.prediction === p && l.status === "unsupported")) hallucinated.push(p);
  }
  const expected = c.ground_truth.length - excludedTruth.size;
  const predicted = groups.size - duplicates.length - excluded.length, tp = matched.length;
  const unresolved = manualReview.length;
  const finalized = review.scopeConfirmed !== false && unresolved === 0;
  const locationUnresolved = locationClaims.filter(l => l.status === "unresolved" && !incorrect.includes(l.prediction)).length;
  const hallucinationDenominator = groups.size - excluded.length;
  const measured = rates(tp, predicted, expected, hallucinated.length);
  measured.hallucinationRate = hallucinationDenominator ? hallucinated.length / hallucinationDenominator : null;
  return { tp, predicted, expected, unsupported: hallucinated.length,
    duplicateCount: predictions.length - groups.size + duplicates.length,
    ...measured, precision: finalized ? measured.precision : null, recall: finalized ? measured.recall : null,
    f1: finalized ? measured.f1 : null,
    hallucinationRate: finalized && !locationUnresolved ? measured.hallucinationRate : null,
    matched, missed: c.ground_truth.filter((_, i) => !excludedTruth.has(i) && !seen.has(i)), hallucinated, manualReview,
    audit: { scoringVersion: SCORING_VERSION, finalized, groundTruthCount: c.ground_truth.length,
      eligibleGroundTruthCount: expected, rawPredictionCount: predictions.length, predictionCount: predicted,
      truePositives: tp, falsePositives: incorrect.length, falseNegatives: finalized ? expected - tp : null,
      unresolved, excludedPredictions: excluded.length, excludedGroundTruth: excludedTruth.size,
      scopeConfirmed: review.scopeConfirmed !== false, locationUnresolved, hallucinationDenominator,
      locationClaims: { total: locationClaims.length, supported: locationClaims.filter(l => l.status === "supported").length,
        unsupported: locationClaims.filter(l => l.status === "unsupported").length,
        unresolved: locationClaims.filter(l => l.status === "unresolved").length,
        excluded: locationClaims.filter(l => l.status === "excluded").length },
      branchResolution: { eligible: c.ground_truth.filter((g, i) => !excludedTruth.has(i) && g.location_context !== null).length,
        correct: matched.filter(m => c.ground_truth[m.truthIndex].location_context !== null &&
          locationClaims.some(l => l.prediction === m.prediction && l.status === "supported")).length } },
    incorrect, excluded, locationClaims };
}

import { z } from "zod";
import { matchEntityName } from "./entity-matching";
import { hash, OutputSchema, type Dataset } from "./schema";
import type { Row } from "./benchmark";
import { predictionKey, SCORING_VERSION, score, type ScoringReview } from "./metrics";
const Entry = z.strictObject({ predictionKey: z.string(), prediction: OutputSchema.shape.place_clues.element,
  suggestedTruthIndices: z.array(z.number().int().nonnegative()), issue: z.string(),
  outcome: z.enum(["auto", "correct", "incorrect", "excluded"]), truthIndex: z.number().int().nonnegative().nullable(),
  location: z.enum(["auto", "supported", "unsupported", "excluded"]), reason: z.string() });
export const AdjudicationSchema = z.strictObject({ version: z.literal(1), scoringVersion: z.literal(SCORING_VERSION),
  inputHash: z.string(), instructions: z.string(), reviewer: z.string(), confirmation: z.string(),
  cases: z.array(z.strictObject({ caseId: z.string(), scopeConfirmed: z.boolean(),
    entities: z.array(z.strictObject({ truthIndex: z.number().int().nonnegative(), name: z.string() })),
    exclusions: z.array(z.strictObject({ truthIndex: z.number().int().nonnegative(), reason: z.string().trim().min(1) })) })),
  rows: z.array(z.strictObject({ rowKey: z.string(), caseId: z.string(), provider: z.string(), entries: z.array(Entry) })) });
export const rowKey = (row: Row) => hash(row);
export function adjudicationDraft(dataset: Dataset, rows: Row[]) {
  return AdjudicationSchema.parse({ version: 1, scoringVersion: SCORING_VERSION,
    inputHash: hash({ dataset, rows: [...rows].sort((a, b) => rowKey(a).localeCompare(rowKey(b))), scoringVersion: SCORING_VERSION }),
    instructions: "Ground truth includes intentionally presented/recommended travel entities, not incidental map/background labels. Watch the source independently. Confirm each case scope; exclude incidental truth indices with reasons for every model. For uncertain predictions choose correct + truthIndex, incorrect, or excluded with a reason. Excluding a prediction does not remove a missed truth: genuine truth ambiguity must be excluded at case scope for all models. Location decisions concern source evidence only, never lookup results. Set reviewer and confirmation to ADJUDICATED to apply edits. Auto leaves uncertain cases unresolved; final entity metrics remain unknown until scope and entity decisions are complete.",
    reviewer: "", confirmation: "", cases: dataset.cases.map(c => ({ caseId: c.id, scopeConfirmed: false,
      entities: c.ground_truth.map((g, truthIndex) => ({ truthIndex, name: g.name })), exclusions: [] })),
    rows: [...rows].sort((a, b) => rowKey(a).localeCompare(rowKey(b))).map(row => {
      const c = dataset.cases.find(c => c.id === row.caseId)!;
      const parsed = OutputSchema.safeParse((() => { try { return JSON.parse(row.text); } catch { return null; } })());
      const predictions = parsed.success && row.complete && !row.error ? parsed.data.place_clues : [];
      const baseline = score(c, predictions);
      const keys = new Set<string>();
      return { rowKey: rowKey(row), caseId: c.id, provider: row.provider, entries: predictions.filter(p => {
        const key = predictionKey(p); if (keys.has(key)) return false; keys.add(key); return true;
      }).map(p => ({ predictionKey: predictionKey(p), prediction: p,
        suggestedTruthIndices: c.ground_truth.flatMap((g, i) => [g.name, ...g.aliases].some(name => matchEntityName(name, p.name) !== "none") ? [i] : []),
        issue: baseline.manualReview.find(m => predictionKey(m.prediction) === predictionKey(p))?.reason ??
          baseline.locationClaims.find(l => predictionKey(l.prediction) === predictionKey(p))?.status ?? "Automatic entity decision; inspect if necessary",
        outcome: "auto", truthIndex: null, location: "auto", reason: "" })) };
    }) });
}
export function validateAdjudication(raw: unknown, dataset: Dataset, rows: Row[]) {
  const doc = AdjudicationSchema.parse(raw), draft = adjudicationDraft(dataset, rows);
  // Only decision fields may change. Binding covers raw model responses, evidence, labels and scoring rules.
  const identity = (d: typeof doc) => ({ inputHash: d.inputHash,
    cases: d.cases.map(c => ({ caseId: c.caseId, entities: c.entities })),
    rows: d.rows.map(r => ({ ...r, entries: r.entries.map(e => ({ predictionKey: e.predictionKey, prediction: e.prediction,
      suggestedTruthIndices: e.suggestedTruthIndices, issue: e.issue })) })) });
  if (hash(identity(doc)) !== hash(identity(draft))) throw Error("Adjudication is stale or its immutable evidence was edited");
  if (doc.confirmation && (doc.confirmation !== "ADJUDICATED" || !doc.reviewer.trim())) throw Error("Adjudication requires reviewer and ADJUDICATED confirmation");
  for (const c of doc.cases) {
    if (new Set(c.exclusions.map(e => e.truthIndex)).size !== c.exclusions.length ||
      c.exclusions.some(e => !c.entities.some(g => g.truthIndex === e.truthIndex))) throw Error("Invalid scope exclusion");
  }
  for (const row of doc.rows) for (const e of row.entries) {
    if ((e.outcome !== "auto" || e.location !== "auto") && !e.reason.trim()) throw Error("Adjudication decision requires reason");
    if (e.outcome === "correct" && (e.truthIndex === null || !dataset.cases.find(c => c.id === row.caseId)!.ground_truth[e.truthIndex]))
      throw Error("Correct adjudication requires a valid truthIndex");
  }
  return doc;
}
export function scoringReview(doc: z.infer<typeof AdjudicationSchema>, row: Row): ScoringReview {
  const active = doc.confirmation === "ADJUDICATED" && Boolean(doc.reviewer.trim());
  const c = doc.cases.find(c => c.caseId === row.caseId)!;
  return { scopeConfirmed: active && c.scopeConfirmed, excludedTruthIndices: active ? c.exclusions.map(e => e.truthIndex) : [],
    decisions: Object.fromEntries((active ? doc.rows.find(r => r.rowKey === rowKey(row))!.entries : [])
      .filter(e => e.outcome !== "auto" || e.location !== "auto").map(e => [e.predictionKey, {
        outcome: e.outcome === "auto" ? undefined : e.outcome,
        truthIndex: e.truthIndex ?? undefined, location: e.location === "auto" ? undefined : e.location, reason: e.reason }])) };
}

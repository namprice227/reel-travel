import { z } from "zod";
import type { PlaceLookup } from "../../packages/ai/src/types";
import { hash, inputHash, evidenceInput, OutputSchema, PROMPT, WIRE_SCHEMA, PROMPT_VERSION, Provider, type Case, type Dataset } from "./schema";
import { emptyUsage, SettingsSchema, UsageSchema, type Adapter } from "./providers";
import { rates, score, type ScoringReview } from "./metrics";

export const RowSchema = z.strictObject({
  caseId: z.string(), inputHash: z.string(), provider: Provider, requestedModel: z.string(),
  returnedModel: z.string().nullable(), settings: SettingsSchema,
  latencyMs: z.number().nonnegative(), usage: UsageSchema, text: z.string(),
  complete: z.boolean(), error: z.enum(["PROVIDER_ERROR"]).nullable(),
});
export type Row = z.infer<typeof RowSchema>;
export const CacheSchema = z.strictObject({
  version: z.literal(1), promptVersion: z.literal(PROMPT_VERSION), datasetHash: z.string(),
  createdAt: z.string(), rows: z.array(RowSchema),
});
export type Cache = z.infer<typeof CacheSchema>;
export async function attempt(c: Case, adapter: Adapter): Promise<Row> {
  const start = performance.now();
  const base = { caseId: c.id, inputHash: inputHash(c), provider: adapter.id, requestedModel: adapter.model,
    settings: adapter.settings };
  try {
    const response = await adapter.generate(c);
    return RowSchema.parse({ ...base, returnedModel: response.model, text: response.text,
      complete: response.complete, usage: response.usage, latencyMs: performance.now() - start, error: null });
  } catch {
    // Never persist thrown provider bodies, headers, or messages that could contain credentials.
    return { ...base, returnedModel: null, text: "", complete: false, usage: emptyUsage(),
      latencyMs: performance.now() - start, error: "PROVIDER_ERROR" };
  }
}
/** Preserve unrelated paid results when resuming only a provider/case subset. */
export function mergeRows(previous: Row[], updates: Row[]): Row[] {
  const rows = new Map(previous.map(row => [row.provider + "|" + row.caseId, row]));
  for (const row of updates) rows.set(row.provider + "|" + row.caseId, row);
  return [...rows.values()];
}
export function cacheFor(dataset: Dataset, rows: Row[]): Cache {
  return { version: 1, promptVersion: PROMPT_VERSION, datasetHash: hash(dataset),
    createdAt: new Date().toISOString(), rows };
}
export function replay(raw: unknown, dataset: Dataset): Cache {
  const cache = CacheSchema.parse(raw);
  if (cache.datasetHash !== hash(dataset)) throw Error("Dataset changed; use the original dataset for replay.");
  const seen = new Set<string>();
  for (const row of cache.rows) {
    const c = dataset.cases.find(c => c.id === row.caseId);
    if (!c || row.inputHash !== inputHash(c)) throw Error("Cached input or prompt mismatch.");
    const key = row.caseId + "|" + row.provider;
    if (seen.has(key)) throw Error("Duplicate cached provider/case pair.");
    seen.add(key);
  }
  return cache;
}
/** Historical offline replay requires matching saved provenance, never a bypass of input checks. */
export function replayHistorical(raw: unknown, dataset: Dataset, report?: unknown) {
  try { return { cache: replay(raw, dataset), prompt: PROMPT, wireSchema: WIRE_SCHEMA }; }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "Cached input or prompt mismatch.") throw error;
  }
  const saved = z.object({ datasetHash: z.string(), prompt: z.string().min(1), promptVersion: z.literal(PROMPT_VERSION),
    wireSchema: z.unknown(), rows: z.array(z.object(RowSchema.shape)) }).safeParse(report);
  if (!saved.success) throw Error("Cached input or prompt mismatch. Historical replay needs its original results report.");
  const cache = CacheSchema.parse(raw), provenance = saved.data;
  if (cache.datasetHash !== hash(dataset) || provenance.datasetHash !== hash(dataset) || hash(provenance.wireSchema) !== hash(WIRE_SCHEMA))
    throw Error("Cached historical dataset or schema mismatch.");
  const seen = new Set<string>();
  for (const row of cache.rows) {
    const c = dataset.cases.find(c => c.id === row.caseId), key = row.provider + "|" + row.caseId;
    const originals = provenance.rows.filter(r => r.provider === row.provider && r.caseId === row.caseId);
    if (!c || seen.has(key) || originals.length !== 1 || hash(originals[0]) !== hash(row) ||
      row.inputHash !== hash({ version: provenance.promptVersion, prompt: provenance.prompt, schema: provenance.wireSchema, input: evidenceInput(c) }))
      throw Error("Cached historical response or prompt mismatch.");
    seen.add(key);
  }
  return { cache, prompt: provenance.prompt, wireSchema: provenance.wireSchema };
}
export const PricingSchema = z.strictObject({
  currency: z.literal("USD"),
  models: z.record(z.string(), z.strictObject({
    inputPerMillion: z.number().nonnegative(), outputPerMillion: z.number().nonnegative(),
    cachedInputPerMillion: z.number().nonnegative().optional(),
    cacheWritePerMillion: z.number().nonnegative().optional(),
    source: z.url(), checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })),
});
export type Pricing = z.infer<typeof PricingSchema>;
export function estimate(row: Row, pricing: Pricing): number | null {
  const rate = pricing.models[row.provider + "/" + row.requestedModel];
  const u = row.usage;
  if (!rate || u.inputTokens === null || u.outputTokens === null || u.cachedInputTokens === null || u.cacheWriteTokens === null)
    return null;
  const plain = u.inputTokens - u.cachedInputTokens - u.cacheWriteTokens;
  if (plain < 0 || (u.cachedInputTokens > 0 && rate.cachedInputPerMillion === undefined) ||
    (u.cacheWriteTokens > 0 && rate.cacheWritePerMillion === undefined)) return null;
  return (plain * rate.inputPerMillion + u.outputTokens * rate.outputPerMillion +
    u.cachedInputTokens * (rate.cachedInputPerMillion ?? 0) + u.cacheWriteTokens * (rate.cacheWritePerMillion ?? 0)) / 1e6;
}
export function evaluate(c: Case, row: Row, pricing: Pricing, review: ScoringReview = {}) {
  let raw: unknown = null;
  try { raw = JSON.parse(row.text); } catch { /* Included as invalid JSON below. */ }
  const parsed = OutputSchema.safeParse(raw);
  const schemaValid = row.error === null && row.complete && parsed.success;
  return { ...row, schemaValid, validationErrors: row.error ? ["PROVIDER_ERROR"] : !row.complete ? ["INCOMPLETE_OR_REFUSED"]
    : !parsed.success ? parsed.error.issues.map(i => ({ path: i.path.map(String).join("."), code: i.code })) : [],
    prediction: schemaValid && parsed.success ? parsed.data : null,
    costUsd: estimate(row, pricing),
    score: score(c, schemaValid && parsed.success ? parsed.data.place_clues : [], review) };
}
export type Evaluated = ReturnType<typeof evaluate>;
export function summarize(rows: Evaluated[]) {
  const keys = [...new Set(rows.map(r => r.provider + "/" + r.requestedModel))];
  return keys.map(model => {
    const group = rows.filter(r => r.provider + "/" + r.requestedModel === model);
    const total = (key: "tp" | "predicted" | "expected" | "unsupported") => group.reduce((sum, r) => sum + r.score[key], 0);
    const latencies = group.map(r => r.latencyMs).sort((a, b) => a - b);
    const middle = Math.floor(latencies.length / 2);
    const knownCostUsd = group.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    const tokenTotal = (key: "inputTokens" | "outputTokens") => group.every(r => r.usage[key] !== null)
      ? group.reduce((sum, r) => sum + r.usage[key]!, 0) : null;
    const finalized = group.every(r => r.score.audit.finalized);
    const measured = rates(total("tp"), total("predicted"), total("expected"), total("unsupported"));
    const hallucinationDenominator = group.reduce((sum, r) => sum + r.score.audit.hallucinationDenominator, 0);
    measured.hallucinationRate = hallucinationDenominator ? total("unsupported") / hallucinationDenominator : null;
    const locationUnresolved = group.reduce((sum, r) => sum + r.score.audit.locationUnresolved, 0);
    return { audit: { finalized, groundTruthCount: group.reduce((sum, r) => sum + r.score.audit.groundTruthCount, 0),
      predictionCount: total("predicted"), rawPredictionCount: group.reduce((sum, r) => sum + r.score.audit.rawPredictionCount, 0),
      truePositives: total("tp"), falsePositives: group.reduce((sum, r) => sum + r.score.audit.falsePositives, 0),
      falseNegatives: finalized ? total("expected") - total("tp") : null,
      unresolved: group.reduce((sum, r) => sum + r.score.audit.unresolved, 0),
      excludedPredictions: group.reduce((sum, r) => sum + r.score.audit.excludedPredictions, 0),
      excludedGroundTruth: group.reduce((sum, r) => sum + r.score.audit.excludedGroundTruth, 0), locationUnresolved, hallucinationDenominator, scopePendingCases: group.filter(r => !r.score.audit.scopeConfirmed).length,
      branchResolution: { eligible: group.reduce((sum, r) => sum + r.score.audit.branchResolution.eligible, 0),
        correct: group.reduce((sum, r) => sum + r.score.audit.branchResolution.correct, 0) } },
      model, cases: group.length, tp: total("tp"), predicted: total("predicted"), expected: total("expected"),
      unsupported: total("unsupported"), ...measured, precision: finalized ? measured.precision : null, recall: finalized ? measured.recall : null,
      f1: finalized ? measured.f1 : null, hallucinationRate: finalized && !locationUnresolved ? measured.hallucinationRate : null,
      schemaValidityRate: group.filter(r => r.schemaValid).length / group.length,
      providerErrors: group.filter(r => r.error).length,
      manualReviewCount: group.reduce((sum, r) => sum + new Set([
        ...r.score.manualReview.map(m => JSON.stringify(m.prediction)),
        ...r.score.locationClaims.filter(l => l.status === "unresolved" && !r.score.incorrect.includes(l.prediction)).map(l => JSON.stringify(l.prediction)),
      ]).size, 0),
      averageLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50LatencyMs: latencies.length % 2 ? latencies[middle] : (latencies[middle - 1] + latencies[middle]) / 2,
      inputTokens: tokenTotal("inputTokens"), outputTokens: tokenTotal("outputTokens"),
      usageAvailableCases: group.filter(r => r.usage.inputTokens !== null && r.usage.outputTokens !== null).length,
      costUsd: group.every(r => r.costUsd !== null) ? knownCostUsd : null, knownCostUsd,
      costAvailableCases: group.filter(r => r.costUsd !== null).length };
  });
}
export async function resolvePlaces(c: Case, result: Evaluated, lookup: PlaceLookup) {
  const eligible = c.ground_truth.map((g, i) => ({ g, i })).filter(({ g }) => g.google_place_id);
  if (c.synthetic || !eligible.length) return { eligible: 0, top1: 0, top3: 0, errors: 0, skipped: true };
  let top1 = 0, top3 = 0, errors = 0;
  for (const { g, i } of eligible) {
    const match = result.score.matched.find(m => m.truthIndex === i);
    if (!match) continue;
    const p = match.prediction;
    try {
      const options = await lookup.search({ query: p.name, hint: p.location_context, excerpt: p.evidence },
        { destination: c.destination ?? "" });
      if (options[0]?.providerPlaceId === g.google_place_id) top1++;
      if (options.slice(0, 3).some(o => o.providerPlaceId === g.google_place_id)) top3++;
    } catch { errors++; }
  }
  return { eligible: eligible.length, top1, top3, errors, skipped: false };
}
export function markdown(summary: ReturnType<typeof summarize>) {
  const cell = (n: number | null) => n === null ? "unknown" : Number(n.toFixed(6)).toString();
  return [
    "# Place-clue extraction benchmark",
    "",
    "Provisional conservative entity scores; inspect manual-review cases before making a model decision. Synthetic samples are not held-out measurements.",
    "",
    "| Model | Precision | Recall | F1 | Hallucination rate | Schema valid | Avg ms | p50 ms | Input tokens | Output tokens | Estimated USD | Review | Errors |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...summary.map(r => "| " + [r.model.replaceAll("|", "\\|"), r.precision, r.recall, r.f1, r.hallucinationRate,
      r.schemaValidityRate, r.averageLatencyMs, r.p50LatencyMs, r.inputTokens, r.outputTokens, r.costUsd,
      r.manualReviewCount, r.providerErrors].map(v => typeof v === "string" ? v : cell(v)).join(" | ") + " |"),
    "", "Undefined denominators and unavailable usage/prices are unknown, never zero-cost assumptions.",
    "Latency includes failed attempts and original network time during replay. Costs exclude Google Places.", "",
  ].join("\n");
}

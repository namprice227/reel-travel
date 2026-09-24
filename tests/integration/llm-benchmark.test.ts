import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CaseSchema, DatasetSchema, hash, evidenceInput, WIRE_SCHEMA, PROMPT_VERSION, normalize, OutputSchema, PROMPT, type Case, type Prediction } from "../../evals/llm/schema";
import { attempt, cacheFor, estimate, evaluate, markdown, mergeRows, replay, replayHistorical, resolvePlaces, summarize, type Row } from "../../evals/llm/benchmark";
import { createAdapter, emptyUsage, settingsFor, type Adapter } from "../../evals/llm/providers";
import { rates, score } from "../../evals/llm/metrics";
import { main } from "../../scripts/benchmark-llm";
import samples from "../../evals/datasets/llm-place-extraction.json";

const example = (truth: unknown[] = [{ name: "Hoshi Coffee", location_context: "Omotesando", aliases: ["Hoshi"] }]): Case =>
  CaseSchema.parse({ id: "test", synthetic: true, transcript: "Hoshi Coffee in Omotesando. Kumo Ramen in Ginza.", ground_truth: truth });
const prediction = (fields: Partial<Prediction> = {}): Prediction => ({
  name: "Hoshi Coffee", location_context: "Omotesando", evidence: "Hoshi Coffee in Omotesando.", confidence: 0.9, ...fields,
});
const fake = (text = JSON.stringify({ place_clues: [prediction()] })): Adapter => ({
  id: "openai", model: "test-model", settings: settingsFor("openai", "test-model"),
  async generate() { return { text, model: "test-model", complete: true,
    usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10, cacheWriteTokens: 0 } }; },
});
const pricing = { currency: "USD" as const, models: {} };
afterEach(() => vi.restoreAllMocks());

describe("place benchmark scoring", () => {
  it("normalizes case, width, punctuation and whitespace without dropping non-Latin names", () => {
    expect(normalize("  ＨＯＳＨＩ—Coffee!  ")).toBe("hoshi coffee");
    expect(normalize("O’Brian's")).toBe("obrians");
    expect(normalize("東京 カフェ")).toBe("東京 カフェ");
  });
  it("calculates precision recall F1 and hallucination from counts", () => {
    expect(rates(2, 4, 3, 1)).toEqual({ precision: .5, recall: 2 / 3, f1: 4 / 7, hallucinationRate: .25 });
  });
  it("matches aliases and reports unsupported places", () => {
    const s = score(example(), [prediction({ name: "Hoshi" }), prediction({ name: "Unknown" })]);
    expect(s).toMatchObject({ tp: 1, predicted: 2, expected: 1, unsupported: 1, precision: .5, recall: 1 });
    expect(s.hallucinated[0].name).toBe("Unknown");
  });
  it("does not reward all-empty or abstaining systems with perfect metrics", () => {
    expect(score(example([]), [])).toMatchObject({ precision: null, recall: null, f1: null, hallucinationRate: null });
    expect(score(example(), [])).toMatchObject({ precision: null, recall: 0, f1: 0 });
    expect(score(example([]), [prediction()])).toMatchObject({ precision: 0, recall: null, f1: 0, hallucinationRate: 1 });
  });
  it("deduplicates predictions and aliases for the same labelled entity", () => {
    const s = score(example(), [prediction(), prediction(), prediction({ name: "Hoshi" })]);
    expect(s).toMatchObject({ tp: 1, predicted: 1, duplicateCount: 2 });
  });
  it("accepts explicit location aliases but rejects wrong branches", () => {
    const c = example([{ name: "Hoshi Coffee", location_context: "Omotesando", location_aliases: ["Omote"] }]);
    expect(score(c, [prediction({ location_context: "Omote" })]).tp).toBe(1);
    expect(score(c, [prediction({ location_context: "Ginza" })]).unsupported).toBe(1);
  });
  it("flags missing branch and unlabelled context instead of guessing", () => {
    expect(score(example(), [prediction({ location_context: null })]).tp).toBe(1);
    expect(score(example([{ name: "Hoshi Coffee", location_context: null }]), [prediction()])).toMatchObject({ tp: 1, audit: { locationUnresolved: 1 } });
    const c = example([{ name: "Hoshi Coffee", location_context: "Omotesando" }, { name: "Hoshi Coffee", location_context: "Ginza" }]);
    expect(score(c, [prediction({ location_context: null })])).toMatchObject({ tp: 0, unsupported: 0 });
    expect(score(c, [prediction({ location_context: null })]).manualReview).toHaveLength(1);
  });
  it("rejects invented evidence and accepts a quote from visual observations", () => {
    expect(score(example(), [prediction({ evidence: "invented quotation" })]).unsupported).toBe(1);
    const c = { ...example(), transcript: "", visual_observations: ["Hoshi Coffee in Omotesando."] };
    expect(score(c, [prediction()]).tp).toBe(1);
  });
  it("validates local bounds, fields, and unique dataset IDs", () => {
    expect(OutputSchema.safeParse({ place_clues: [prediction({ confidence: 1.1 })] }).success).toBe(false);
    expect(OutputSchema.safeParse({ place_clues: [prediction()], extra: true }).success).toBe(false);
    expect(DatasetSchema.safeParse({ description: "test", split: "development", cases: [example(), example()] }).success).toBe(false);
    expect(DatasetSchema.parse(samples).cases).toHaveLength(4);
  });
});

describe("attempts, costs and replay", () => {
  it("validates historical provenance without allowing stale live resume or rewritten outputs", async () => {
    const c = example(), dataset = DatasetSchema.parse({ description: "test", split: "development", cases: [c] });
    const oldPrompt = "Previous extraction instructions";
    const row = { ...await attempt(c, fake()), inputHash: hash({ version: PROMPT_VERSION, prompt: oldPrompt, schema: WIRE_SCHEMA, input: evidenceInput(c) }) };
    const cache = cacheFor(dataset, [row]);
    const report = { datasetHash: hash(dataset), prompt: oldPrompt, promptVersion: PROMPT_VERSION, wireSchema: WIRE_SCHEMA, rows: [{ ...row, schemaValid: true, score: { tp: 1 } }] };
    expect(() => replay(cache, dataset)).toThrow("mismatch");
    expect(replayHistorical(cache, dataset, report).prompt).toBe(oldPrompt);
    expect(() => replayHistorical(cache, dataset)).toThrow("original results report");
    expect(() => replayHistorical(cache, dataset, { ...report, prompt: "tampered" })).toThrow("mismatch");
    expect(() => replayHistorical({ ...cache, rows: [{ ...row, text: "changed" }] }, dataset, report)).toThrow("mismatch");
  });

  it("preserves unselected cached attempts during partial resume", async () => {
    const row = await attempt(example(), fake());
    const other = { ...row, caseId: "other" };
    const changed = { ...row, text: '{"place_clues":[]}' };
    expect(mergeRows([row, other], [changed])).toEqual([changed, other]);
    expect(mergeRows([row], [other])).toEqual([row, other]);
  });
  it.each(["", "not JSON", '{"place_clues":[{"name":"x"}]}'])("records invalid output %s", async text => {
    const row = await attempt(example(), fake(text));
    const result = evaluate(example(), row, pricing);
    expect(result.schemaValid).toBe(false);
    expect(result.score.recall).toBe(0);
    expect(result.usage.inputTokens).toBe(100);
    expect(result.text).toBe(text);
  });
  it("distinguishes valid empty output from invalid output", async () => {
    const result = evaluate(example(), await attempt(example(), fake('{"place_clues":[]}')), pricing);
    expect(result.schemaValid).toBe(true);
    expect(result.score.recall).toBe(0);
  });
  it("counts refusal/truncation as invalid even with valid JSON", async () => {
    const row = await attempt(example(), fake());
    expect(evaluate(example(), { ...row, complete: false }, pricing).schemaValid).toBe(false);
  });
  it("sanitizes provider failures and retains failed cases in summaries", async () => {
    const adapter = fake();
    adapter.generate = async () => { throw Error("secret-key provider response"); };
    const row = await attempt(example(), adapter);
    expect(JSON.stringify(row)).not.toContain("secret-key");
    const summary = summarize([evaluate(example(), row, pricing)])[0];
    expect(summary).toMatchObject({ cases: 1, providerErrors: 1, schemaValidityRate: 0, recall: 0, costUsd: null });
  });
  it("replays without a provider and detects changed dataset, prompt input and duplicate records", async () => {
    const dataset = DatasetSchema.parse({ description: "test", split: "development", cases: [example()] });
    const row = await attempt(example(), fake());
    const cache = cacheFor(dataset, [row]);
    expect(replay(JSON.parse(JSON.stringify(cache)), dataset)).toEqual(cache);
    expect(() => replay(cache, { ...dataset, description: "changed" })).toThrow("Dataset changed");
    expect(() => replay({ ...cache, rows: [{ ...row, inputHash: "changed" }] }, dataset)).toThrow("mismatch");
    expect(() => replay({ ...cache, rows: [row, row] }, dataset)).toThrow("Duplicate");
  });
  it("estimates configured cache-aware prices and preserves unknown costs", async () => {
    const row = await attempt(example(), fake());
    expect(estimate(row, pricing)).toBeNull();
    const rates = { currency: "USD" as const, models: { "openai/test-model": {
      inputPerMillion: 2, outputPerMillion: 4, cachedInputPerMillion: 1,
      source: "https://example.test/prices", checkedOn: "2026-09-22",
    } } };
    expect(estimate(row, rates)).toBeCloseTo(.00027);
    expect(estimate({ ...row, usage: emptyUsage() }, rates)).toBeNull();
    expect(estimate({ ...row, usage: { ...row.usage, cacheWriteTokens: 1 } }, rates)).toBeNull();
  });
  it("aggregates micro counts, median and incomplete usage without dropping costs", async () => {
    const row = await attempt(example(), fake());
    const results = [evaluate(example(), { ...row, latencyMs: 10 }, pricing),
      evaluate(example(), { ...row, latencyMs: 30, text: '{"place_clues":[]}', usage: emptyUsage() }, pricing)];
    expect(summarize(results)[0]).toMatchObject({ precision: 1, recall: .5, f1: 2 / 3,
      averageLatencyMs: 20, p50LatencyMs: 20, inputTokens: null, usageAvailableCases: 1 });
    expect(markdown(summarize(results))).toContain("unknown");
  });
  it("runs the offline CLI end-to-end and rejects missing comparisons", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "reel-llm-test-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const dataset = DatasetSchema.parse({ description: "test", split: "development", cases: [example()] });
      const datasetFile = path.join(dir, "dataset.json"), cacheFile = path.join(dir, "cache.json");
      await writeFile(datasetFile, JSON.stringify(dataset));
      await writeFile(cacheFile, JSON.stringify(cacheFor(dataset, [await attempt(example(), fake())])));
      await main(["--offline", "--provider", "openai", "--dataset", datasetFile, "--cache", cacheFile, "--out", dir]);
      const report = JSON.parse(await readFile(path.join(dir, "llm-place-extraction-results.json"), "utf8"));
      expect(report.mode).toBe("offline-replay");
      expect(report.summary[0].precision).toBeNull();
      const reviewFile = path.join(dir, "evaluation-review.json");
      const adjudication = JSON.parse(await readFile(reviewFile, "utf8"));
      adjudication.reviewer = "Offline reviewer"; adjudication.confirmation = "ADJUDICATED";
      adjudication.cases.forEach((c: { scopeConfirmed: boolean }) => { c.scopeConfirmed = true; });
      await writeFile(reviewFile, JSON.stringify(adjudication));
      await main(["--offline", "--dataset", datasetFile, "--cache", cacheFile, "--out", dir, "--provider", "openai"]);
      const finalized = JSON.parse(await readFile(path.join(dir, "llm-place-extraction-results.json"), "utf8"));
      expect(finalized.summary[0].precision).toBe(1);
      expect(report.placesEnabled).toBe(false);
      await expect(main(["--offline", "--dataset", datasetFile, "--cache", cacheFile, "--out", dir])).rejects.toThrow("missing requested");
      await expect(main(["--offline", "--places"])).rejects.toThrow("cannot");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe("provider request equivalence and response handling", () => {
  const env = { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-5.6-luna",
    ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-haiku-4-5",
    DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "deepseek-flash" };
  it.each(["openai", "anthropic", "deepseek"] as const)("uses shared instructions, validates %s transport and usage", async id => {
    const text = JSON.stringify({ place_clues: [prediction()] });
    const response = id === "openai" ? { model: "snapshot", status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
      usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 5 } } }
      : id === "anthropic" ? { model: "snapshot", stop_reason: "end_turn", content: [{ type: "text", text }],
        usage: { input_tokens: 95, output_tokens: 20, cache_read_input_tokens: 5 } }
      : { model: "snapshot", choices: [{ finish_reason: "stop", message: { content: text } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 5 } };
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      expect(body.model).toBe(env[(id.toUpperCase() + "_MODEL") as keyof typeof env]);
      const system = body.system ?? (body.input ?? body.messages)[0].content;
      expect(system).toBe(PROMPT);
      const user = (body.input ?? body.messages).at(-1).content;
      expect(JSON.parse(user)).toEqual({ transcript: example().transcript, visual_observations: [] });
      expect(user).not.toContain("ground_truth");
      expect(body.max_output_tokens ?? body.max_tokens).toBe(1500);
      if (id === "openai") { expect(body.temperature).toBeUndefined(); expect(body.reasoning.effort).toBe("none"); }
      if (id === "anthropic") expect(body.output_config.format.type).toBe("json_schema");
      if (id === "deepseek") { expect(body.thinking.type).toBe("disabled"); expect(body.response_format.type).toBe("json_object"); }
      return new Response(JSON.stringify(response));
    });
    const row = await attempt(example(), createAdapter(id, env, fetchMock));
    expect(row).toMatchObject({ returnedModel: "snapshot", complete: true, error: null,
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 5 } });
    expect(evaluate(example(), row, pricing).schemaValid).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("preflights missing fields and reports HTTP failure without response-body secrets", async () => {
    expect(() => createAdapter("openai", {})).toThrow("Missing");
    const adapter = createAdapter("deepseek", env, vi.fn(async () => new Response("secret", { status: 429 })));
    const row = await attempt(example(), adapter);
    expect(row.error).toBe("PROVIDER_ERROR");
    expect(JSON.stringify(row)).not.toContain("secret");
  });
});

describe("optional Places evaluation", () => {
  it("skips synthetic cases and requires exact labelled provider IDs", async () => {
    const c = example();
    const row = evaluate(c, await attempt(c, fake()), pricing);
    const search = vi.fn(async () => []);
    expect((await resolvePlaces(c, row, { search })).skipped).toBe(true);
    expect(search).not.toHaveBeenCalled();
    const real = { ...c, synthetic: false, ground_truth: [{ ...c.ground_truth[0], google_place_id: "correct" }] };
    const lookup = { search: vi.fn(async () => [{ providerPlaceId: "other" }, { providerPlaceId: "correct" }]) };
    // The scorer only reads provider IDs; the production adapter validates full PlaceOption objects.
    expect(await resolvePlaces(real, row, lookup as any)).toMatchObject({ eligible: 1, top1: 0, top3: 1, errors: 0 });
    expect(await resolvePlaces(real, row, { search: async () => { throw Error("failure"); } })).toMatchObject({ errors: 1 });
  });
});

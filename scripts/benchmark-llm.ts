import { metricDiagnostics, diagnosticsMarkdown } from "../evals/llm/diagnostics";
import { adjudicationDraft, validateAdjudication, scoringReview } from "../evals/llm/adjudication";
import { SCORING_VERSION } from "../evals/llm/metrics";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createGooglePlaceLookup } from "../packages/ai/src/google-places";
import { DatasetSchema, Provider, hash, PROMPT, PROMPT_VERSION, WIRE_SCHEMA } from "../evals/llm/schema";
import { createAdapter } from "../evals/llm/providers";
import { attempt, cacheFor, evaluate, markdown, mergeRows, PricingSchema, replay, replayHistorical, resolvePlaces, summarize, type Row } from "../evals/llm/benchmark";

const HELP = `Usage: npm run eval:llm -- [options]
  --provider all|openai|anthropic|deepseek (default all)
  --case ID                 Restrict to one dataset example
  --dataset PATH            JSON dataset (default evals/datasets/llm-place-extraction.json)
  --pricing PATH            Rates (default evals/llm/pricing.json)
  --live                    Allow paid LLM requests
  --offline                 Evaluate saved responses; never calls a provider
  --resume                  Reuse matching saved attempts; requires --live
  --cache PATH              Saved responses (default evals/private/llm/cache.json)
  --out DIR                 Reports (default evals/private/llm)
  --places                  Optional paid Google Places evaluation; requires --live
  --help
Environment is loaded from apps/web/.env.local for live runs only.
No Gemini, video download, Supabase writes or itinerary generation is performed.`;

async function readJson(file: string): Promise<unknown> { return JSON.parse(await readFile(file, "utf8")); }
async function save(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await writeFile(temp, content, { mode: 0o600 });
  await rename(temp, file);
}
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    provider: { type: "string", default: "all" }, case: { type: "string" },
    dataset: { type: "string", default: "evals/datasets/llm-place-extraction.json" },
    pricing: { type: "string", default: "evals/llm/pricing.json" },
    cache: { type: "string", default: "evals/private/llm/cache.json" },
    out: { type: "string", default: "evals/private/llm" },
    live: { type: "boolean" }, offline: { type: "boolean" },
    resume: { type: "boolean" }, places: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) { console.log(HELP); return; }
  if (!!values.live === !!values.offline) throw Error("Choose --live or --offline. Use --help for usage.");
  if (values.offline && (values.places || values.resume)) throw Error("--offline cannot use --places or --resume.");
  const dataset = DatasetSchema.parse(await readJson(values.dataset));
  const pricing = PricingSchema.parse(await readJson(values.pricing));
  const providers = values.provider === "all" ? Provider.options : [Provider.parse(values.provider)];
  const cases = dataset.cases.filter(c => !values.case || c.id === values.case);
  if (!cases.length) throw Error("Unknown case ID.");
  const out = path.resolve(values.out), cachePath = path.resolve(values.cache);
  const jsonPath = path.join(out, "llm-place-extraction-results.json");
  const markdownPath = path.join(out, "summary.md");
  const diagnosticsPath = path.join(out, "metrics-diagnostics.json");
  const diagnosticsMarkdownPath = path.join(out, "metrics-diagnostics.md");
  if ([values.dataset, values.pricing, values.cache].some(f =>
    [jsonPath, markdownPath, diagnosticsPath, diagnosticsMarkdownPath].includes(path.resolve(f)))) throw Error("Output must not overwrite an input or cache.");
  if ([values.dataset, values.pricing].some(f => path.resolve(f) === cachePath)) throw Error("Cache must not overwrite dataset or pricing.");
  let reportPrompt = PROMPT;
  let reportWireSchema: unknown = WIRE_SCHEMA;
  let rows: Row[] = [];
  let retainedRows: Row[] = [];
  let secrets: string[] = [];
  if (values.offline || values.resume) {
    const rawCache = await readJson(cachePath);
    const historical = values.offline ? replayHistorical(rawCache, dataset, existsSync(jsonPath) ? await readJson(jsonPath) : undefined) : undefined;
    const cached = historical?.cache ?? replay(rawCache, dataset);
    if (historical) { reportPrompt = historical.prompt; reportWireSchema = historical.wireSchema; }
    retainedRows = cached.rows;
    rows = cached.rows.filter(r => providers.includes(r.provider) && cases.some(c => c.id === r.caseId));
  }
  if (values.live) {
    if (existsSync("apps/web/.env.local")) loadEnvFile("apps/web/.env.local");
    secrets = Object.entries(process.env).filter(([key, value]) => /API_KEY|SECRET|TOKEN|PASSWORD/.test(key) && value)
      .map(([, value]) => value!);
  }
  const redact = (text: string) => secrets.reduce((value, secret) => value.split(secret).join("[REDACTED]"), text);
  if (values.live) {
    // Preflight every selected provider before paying for the first case.
    const adapters = providers.map(id => createAdapter(id, process.env));
    if (values.places && !process.env.GOOGLE_PLACES_API_KEY?.trim()) throw Error("Missing GOOGLE_PLACES_API_KEY.");
    for (const row of rows) {
      const adapter = adapters.find(a => a.id === row.provider)!;
      if (row.requestedModel !== adapter.model || hash(row.settings) !== hash(adapter.settings))
        throw Error("Resume model/settings mismatch. Use a new cache for a new run.");
    }
    await mkdir(path.dirname(cachePath), { recursive: true });
    // Check write access before paid calls and checkpoint each completed attempt.
    await save(cachePath, JSON.stringify(cacheFor(dataset, mergeRows(retainedRows, rows)), null, 2) + "\n");
    for (const [index, c] of cases.entries()) {
      // Rotate provider order across cases to reduce systematic time-of-run effects.
      const ordered = [...adapters.slice(index % adapters.length), ...adapters.slice(0, index % adapters.length)];
      for (const adapter of ordered) {
        if (rows.some(r => r.provider === adapter.id && r.caseId === c.id)) continue;
        const row = await attempt(c, adapter);
        row.text = redact(row.text);
        if (row.returnedModel) row.returnedModel = redact(row.returnedModel);
        rows.push(row);
        await save(cachePath, redact(JSON.stringify(cacheFor(dataset, mergeRows(retainedRows, rows)), null, 2)) + "\n");
        console.log(adapter.id + "/" + c.id + ": " + (row.error ?? (row.complete ? "received" : "incomplete")));
      }
    }
  }
  for (const provider of providers) for (const c of cases)
    if (!rows.some(r => r.provider === provider && r.caseId === c.id))
      throw Error("Replay is missing requested provider/case pairs; narrow --provider/--case or complete the run.");
  const adjudicationPath = path.join(out, "evaluation-review.json");
  const allRows = mergeRows(retainedRows, rows);
  if ([values.dataset, values.pricing, values.cache].some(f => path.resolve(f) === adjudicationPath))
    throw Error("Output must not overwrite an input or cache.");
  if (!existsSync(adjudicationPath)) await save(adjudicationPath, JSON.stringify(adjudicationDraft(dataset, allRows), null, 2) + "\n");
  const adjudication = validateAdjudication(await readJson(adjudicationPath), dataset, allRows);
  const results = rows.map(row => evaluate(cases.find(c => c.id === row.caseId)!, row, pricing, scoringReview(adjudication, row)));
  const places: Array<{ provider: string; caseId: string } & Awaited<ReturnType<typeof resolvePlaces>>> = [];
  if (values.places) {
    const lookup = createGooglePlaceLookup({ apiKey: process.env.GOOGLE_PLACES_API_KEY });
    for (const row of results) places.push({ provider: row.provider, caseId: row.caseId,
      ...await resolvePlaces(cases.find(c => c.id === row.caseId)!, row, lookup) });
  }
  const summary = summarize(results);
  let commit: string | null = null;
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  const placesSummary = providers.map(provider => {
    const group = places.filter(p => p.provider === provider);
    const eligible = group.reduce((sum, p) => sum + p.eligible, 0);
    return { provider, eligible, top1Rate: eligible ? group.reduce((s, p) => s + p.top1, 0) / eligible : null,
      top3Rate: eligible ? group.reduce((s, p) => s + p.top3, 0) / eligible : null,
      errors: group.reduce((s, p) => s + p.errors, 0) };
  });
  const report = { version: 1, measuredAt: new Date().toISOString(), mode: values.offline ? "offline-replay" : "live",
    commit, node: process.version, datasetHash: hash(dataset), split: dataset.split,
    description: dataset.description, syntheticCases: cases.filter(c => c.synthetic).length,
    promptVersion: PROMPT_VERSION, prompt: reportPrompt, wireSchema: reportWireSchema, pricing,
    scoringVersion: SCORING_VERSION, adjudication, summary, rows: results, placesEnabled: !!values.places, places, placesSummary };
  await save(jsonPath, redact(JSON.stringify(report, null, 2)) + "\n");
  await save(markdownPath, redact(markdown(summary)));
  const diagnostics = metricDiagnostics(results, summary, adjudication);
  await save(diagnosticsPath, redact(JSON.stringify(diagnostics, null, 2)) + "\n");
  await save(diagnosticsMarkdownPath, redact(diagnosticsMarkdown(diagnostics)));
  console.log("Wrote " + jsonPath + " and " + markdownPath);
  console.log("Metric diagnostics: " + diagnosticsMarkdownPath + " and " + diagnosticsPath);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // Zod/provider errors can include untrusted values: print only locally authored CLI errors.
    const safe = error instanceof Error && error.constructor === Error &&
      /^(Conflicting adjudication |Adjudication |Correct adjudication |Invalid scope |Approved location |Invalid adjudicated |Choose |--offline |Unknown case |Output must |Cache must |Missing (OPENAI|ANTHROPIC|DEEPSEEK|GOOGLE)|Resume model|Replay is missing|Dataset changed|Cached input|Duplicate cached)/.test(error.message);
    console.error(safe ? error.message : "Benchmark failed: check CLI arguments, input/cache schemas and filesystem access. Use --help.");
    process.exitCode = 1;
  });
}

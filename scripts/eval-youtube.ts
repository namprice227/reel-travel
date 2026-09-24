import { adjudicateRun } from "../evals/llm/interactive-adjudication";
import { createGooglePlaceLookup } from "../packages/ai/src/google-places";
import type { PlaceLookup } from "../packages/ai/src/types";
import { reviewLookups, type LookupApproval } from "../evals/llm/review-lookup";
import { proposePlaces } from "../evals/llm/review-candidates";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGeminiYouTubeReader, normalizeYouTubeUrl } from "../packages/ai/src/youtube";
import { VideoEvidenceOutputSchema } from "../packages/ai/src/reel-schema";
import { YOUTUBE_EVIDENCE_PROMPT, YOUTUBE_EVIDENCE_PROMPT_VERSION } from "../packages/ai/prompts/youtube-evidence-v1";
import { Provider, hash } from "../evals/llm/schema";
import { EvidenceArtifactSchema, LabelsSchema, ReviewError, labelInteractively, newLabels, requireReview,
  type Ask, type EvidenceArtifact } from "../evals/llm/youtube-review";
import { main as benchmark } from "./benchmark-llm";

const HELP = `Evaluation only. Production imports/frontend are unaffected.
1. npm run eval:youtube -- --url "URL" --live
   Saves Gemini evidence and a blank labels.json; stops before comparator calls.
2. npm run eval:youtube -- --url "URL" --review
   Shows evidence, collects labels and explicit human confirmation; Places suggestions when configured.
3. npm run eval:youtube -- --url "URL" --provider all --run --live
   Runs the existing three-provider benchmark against reviewed labels.
4. npm run eval:youtube -- --url "URL" --provider all --offline
   Re-scores the saved comparison without API calls.
Options:
  --adjudicate    Interactively complete saved evaluation review; no API calls
  --dir PATH       Private session directory under evals/private (default youtube/VIDEO_ID)
  --provider NAME  all (default), openai, anthropic, deepseek
  --pricing PATH   default evals/llm/pricing.json
  --resume         Reuse completed comparator attempts; only with --run --live
  --help
Edit labels.json to correct/add/remove labels, then run --review again.
Use a new --dir to refresh Gemini evidence. Existing evidence is reused, never silently replaced.
Gemini cost/latency are separate from comparator metrics; evidence cost is not measured.`;
type Dependencies = {
  lookup?: PlaceLookup;
  ask?: Ask; show?: (text: string) => void; env?: NodeJS.ProcessEnv;
  readEvidence?: (url: string) => Promise<{ model: string; data: unknown }>;
  benchmark?: typeof benchmark;
};
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8")) as unknown;
async function createJson(file: string, data: unknown) {
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
async function replaceJson(file: string, data: unknown) {
  const temp = file + ".tmp";
  await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, file);
}
export async function main(args = process.argv.slice(2), deps: Dependencies = {}) {
  const { values: v } = parseArgs({ args, options: {
    url: { type: "string" }, dir: { type: "string" },
    provider: { type: "string", default: "all" }, pricing: { type: "string", default: "evals/llm/pricing.json" },
    adjudicate: { type: "boolean" }, review: { type: "boolean" }, run: { type: "boolean" }, offline: { type: "boolean" },
    live: { type: "boolean" }, resume: { type: "boolean" }, help: { type: "boolean" },
  } });
  const show = deps.show ?? console.log;
  if (v.help) { show(HELP); return; }
  const url = normalizeYouTubeUrl(v.url ?? "");
  if (!url) throw new ReviewError("Provide --url with a supported public HTTPS YouTube URL.");
  if (v.provider !== "all") Provider.parse(v.provider);
  if ([v.review, v.run, v.offline, v.adjudicate].filter(Boolean).length > 1 ||
    ((v.review || v.offline || v.adjudicate) && v.live) || (v.resume && (!v.run || !v.live)))
    throw new ReviewError("Choose one stage: prepare --live, --review, --run --live, --offline, or --adjudicate.");
  if (!v.review && !v.offline && !v.adjudicate && !v.live) throw new ReviewError("Use --live to permit paid evidence or benchmark requests.");
  const privateRoot = path.resolve("evals/private");
  const dir = path.resolve(v.dir ?? path.join(privateRoot, "youtube", new URL(url).searchParams.get("v")!));
  if (!dir.startsWith(privateRoot + path.sep)) throw new ReviewError("--dir must be a subdirectory of evals/private.");
  const evidenceFile = path.join(dir, "evidence.json"), labelsFile = path.join(dir, "labels.json");
  const prepare = !v.review && !v.run && !v.offline && !v.adjudicate;
  if (!existsSync(evidenceFile)) {
    if (!prepare) throw new ReviewError("Evidence not prepared. Run with --url and --live first.");
    let env = deps.env;
    if (!env) { if (existsSync("apps/web/.env.local")) loadEnvFile("apps/web/.env.local"); env = process.env; }
    if (!deps.readEvidence && !env.GOOGLE_AI_API_KEY?.trim()) throw new ReviewError("Set GOOGLE_AI_API_KEY before preparing evidence.");
    if (existsSync(labelsFile)) throw new ReviewError("Labels exist without evidence. Use a new --dir to preserve that work.");
    await mkdir(dir, { recursive: true });
    const reader = deps.readEvidence ?? (async (sourceUrl: string) => {
      const reader = createGeminiYouTubeReader({
        apiKey: env!.GOOGLE_AI_API_KEY, model: env!.GEMINI_TRANSCRIPTION_MODEL,
        timeoutMs: env!.GEMINI_TRANSCRIPTION_TIMEOUT_MS?.trim() ? Number(env!.GEMINI_TRANSCRIPTION_TIMEOUT_MS) : undefined,
      }, VideoEvidenceOutputSchema, YOUTUBE_EVIDENCE_PROMPT);
      const result = await reader.read(sourceUrl);
      if (result.status !== "ok") throw new ReviewError("Video unavailable; no evidence or labels accepted.");
      return result;
    });
    show("Gemini: collecting evidence once. No comparator or Places requests are made at this stage.");
    const start = performance.now();
    const observed = await reader(url);
    // Persist schema-approved evidence only, never provider headers or response envelopes.
    const artifact = EvidenceArtifactSchema.parse({
      version: 1, sourceUrl: url, model: observed.model, promptVersion: YOUTUBE_EVIDENCE_PROMPT_VERSION,
      capturedAt: new Date().toISOString(), latencyMs: performance.now() - start, evidence: observed.data,
    });
    await createJson(evidenceFile, artifact);
  }
  const artifact = EvidenceArtifactSchema.parse(await readJson(evidenceFile));
  if (artifact.sourceUrl !== url) throw new ReviewError("Session URL mismatch. Use its original URL or a different --dir.");
  if (!existsSync(labelsFile)) {
    if (!prepare) throw new ReviewError("Missing labels.json. Run prepare again to create a blank label draft.");
    await createJson(labelsFile, newLabels());
  }
  if (prepare) {
    show("Evidence ready: " + evidenceFile);
    show("Labels draft: " + labelsFile);
    show("Next: run the same --url/--dir with --review. No extraction benchmark has run.");
    return;
  }
  const labels = LabelsSchema.parse(await readJson(labelsFile));
  if (v.review) {
    if (!deps.ask && (!process.stdin.isTTY || !process.stdout.isTTY))
      throw new ReviewError("Review requires an interactive terminal. Edit labels.json then run --review in your terminal.");
    await replaceJson(path.join(dir, "review-proposals.json"), { version: 1, algorithm: "named-place-rules-v3", evidenceHash: hash(artifact), candidates: proposePlaces(artifact.evidence) });
    let env = deps.env;
    if (!env) { if (existsSync("apps/web/.env.local")) loadEnvFile("apps/web/.env.local"); env = process.env; }
    const lookup = deps.lookup ?? (env.GOOGLE_PLACES_API_KEY?.trim()
      ? createGooglePlaceLookup({ apiKey: env.GOOGLE_PLACES_API_KEY, timeoutMs: 10000 }) : undefined);
    let lookupApprovals: LookupApproval[] = [];
    const terminal = deps.ask ? undefined : createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ask = deps.ask ?? (q => terminal!.question(q));
      const reviewed = await labelInteractively(artifact, labels, ask, show, lookup ? async draft => {
        lookupApprovals = await reviewLookups(artifact, draft, lookup, ask, show);
      } : undefined);
      // Reject concurrent editor changes rather than overwriting a newer draft.
      if (JSON.stringify(LabelsSchema.parse(await readJson(labelsFile))) !== JSON.stringify(labels) ||
        JSON.stringify(EvidenceArtifactSchema.parse(await readJson(evidenceFile))) !== JSON.stringify(artifact))
        throw new ReviewError("Evidence or labels changed during review. Run --review again.");
      if (lookup) await replaceJson(path.join(dir, "lookup-review.json"), {
        version: 1, evidenceHash: hash(artifact), reviewHash: reviewed.reviewHash,
        reviewer: reviewed.reviewer, reviewedAt: reviewed.reviewedAt,
        scope: "Human-approved external lookup information; not source evidence or benchmark ground truth",
        approvals: lookupApprovals,
      });
      await replaceJson(labelsFile, reviewed);
      show("Human review saved. Next: use --provider all --run --live.");
    } finally { terminal?.close(); }
    return;
  }
  const dataset = requireReview(artifact, labels);
  const runDir = path.join(dir, "runs", labels.reviewHash!);
  if (v.adjudicate) {
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    await adjudicateRun(runDir, { ask: deps.ask, show,
      replayCommand: "npm run eval:youtube -- --url " + quote(url) + (v.dir ? " --dir " + quote(v.dir) : "") + " --provider all --offline" });
    return;
  }
  const datasetFile = path.join(runDir, "dataset.json"), reviewFile = path.join(runDir, "review.json");
  if (v.offline && !existsSync(datasetFile)) throw new ReviewError("No comparison exists for these reviewed labels; run --run --live first.");
  await mkdir(runDir, { recursive: true });
  if (!existsSync(datasetFile)) await createJson(datasetFile, dataset);
  else if (JSON.stringify(await readJson(datasetFile)) !== JSON.stringify(dataset))
    throw new ReviewError("Saved comparison dataset changed; restore it or use a new session.");
  if (!existsSync(reviewFile)) await createJson(reviewFile, { sourceUrl: artifact.sourceUrl,
    evidenceModel: artifact.model, evidencePromptVersion: artifact.promptVersion,
    evidenceCapturedAt: artifact.capturedAt, evidenceLatencyMs: artifact.latencyMs, evidenceCostUsd: null,
    reviewer: labels.reviewer, reviewedAt: labels.reviewedAt, reviewHash: labels.reviewHash,
    human_reviewed: true, scope: "Accuracy against saved Gemini evidence; upstream evidence errors are not independently scored." });
  const cache = path.join(runDir, "cache.json");
  if (v.run && existsSync(cache) && !v.resume)
    throw new ReviewError("Comparison cache already exists. Use --resume to complete it, or --offline to re-score without paid calls.");
  await (deps.benchmark ?? benchmark)([
    "--provider", v.provider, "--dataset", datasetFile, "--pricing", v.pricing,
    "--cache", cache, "--out", runDir, ...(v.offline ? ["--offline"] : ["--live"]),
    ...(v.resume ? ["--resume"] : []),
  ]);
  show("Evaluation reports and review provenance: " + runDir);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof ReviewError || (error instanceof Error && /^(Cached |Dataset changed|Duplicate cached|Adjudication |Correct adjudication |Invalid scope |Conflicting adjudication |Approved location)/.test(error.message)) ? error.message :
      "YouTube evaluation failed. Check evidence/label JSON, provider configuration and access. No automatic retry was made.");
    process.exitCode = 1;
  });
}

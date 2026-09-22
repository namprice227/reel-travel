// Server/CLI only. This artifact is not connected to persisted trip/planner contracts.
import { z } from "zod";
import { createGeminiYouTubeReader, normalizeYouTubeUrl, type GeminiYouTubeOptions } from "./youtube";
import { ProviderError, providerJson } from "./provider-request";
import { CLASSIFY_REEL_PROMPT, CLASSIFY_REEL_PROMPT_VERSION } from "../prompts/classify-reel-v1";
import { YOUTUBE_EVIDENCE_PROMPT, YOUTUBE_EVIDENCE_PROMPT_VERSION } from "../prompts/youtube-evidence-v1";
import { VideoEvidenceOutputSchema, ReelResponseSchema, normalizeVideoEvidence, validateReel,
  type VideoEvidence, type Reel } from "./reel-schema";
export * from "./reel-schema";

export type ReelClassifierOptions = { apiKey?: string; model?: string; timeoutMs?: number; fetch?: typeof fetch };
export function createReelClassifier(options: ReelClassifierOptions) {
  const model = options.model?.trim() || "gpt-4o-mini";
  return { model, async classify(evidence: VideoEvidence): Promise<Reel> {
    if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Set OPENAI_API_KEY.");
    const raw = await providerJson("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${options.apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, store: false,
        input: [{ role: "system", content: CLASSIFY_REEL_PROMPT }, { role: "user", content: JSON.stringify(evidence) }],
        text: { format: { type: "json_schema", name: "travel_reel", strict: true,
          schema: z.toJSONSchema(ReelResponseSchema, { target: "draft-7" }) } },
        max_output_tokens: 12000,
      }),
    }, { ...options, code: "CLASSIFICATION_FAILED" });
    try {
      const response = z.object({ status: z.string(), output: z.array(z.object({
        type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      })) }).parse(raw);
      const content = response.output.filter(x => x.type === "message").flatMap(x => x.content ?? []);
      if (content.some(x => x.type === "refusal")) throw new ProviderError("LLM_REFUSAL", "Classification was refused.");
      if (response.status !== "completed") throw new ProviderError("CLASSIFICATION_FAILED", "Classification incomplete; partial output rejected.");
      const outputs = content.filter(x => x.type === "output_text");
      if (outputs.length !== 1 || !outputs[0].text) throw new Error("Missing output");
      return validateReel(JSON.parse(outputs[0].text), evidence);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("MALFORMED_OUTPUT", "Classification returned invalid structured JSON.");
    }
  } };
}

export async function analyzeYouTubeReel(url: string, options: {
  gemini: GeminiYouTubeOptions; openai: ReelClassifierOptions;
  onProgress?: (stage: "evidence" | "classification" | "validated") => void;
}) {
  const sourceUrl = normalizeYouTubeUrl(url);
  if (!sourceUrl) return { status: "needs_input" as const, failureCode: "SOURCE_INACCESSIBLE" as const,
    message: "Provide a supported public HTTPS YouTube video URL." };
  // Preflight both stages to avoid paying Gemini before discovering missing OpenAI configuration.
  if (!options.gemini.apiKey?.trim() || !options.openai.apiKey?.trim())
    throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_AI_API_KEY and OPENAI_API_KEY.");
  const reader = createGeminiYouTubeReader(options.gemini, VideoEvidenceOutputSchema, YOUTUBE_EVIDENCE_PROMPT);
  const classifier = createReelClassifier(options.openai);
  if (options.openai.timeoutMs !== undefined &&
    (!Number.isInteger(options.openai.timeoutMs) || options.openai.timeoutMs < 1 || options.openai.timeoutMs > 300_000))
    throw new ProviderError("INVALID_CONFIGURATION", "OpenAI timeout must be between 1 and 300000 ms.");
  options.onProgress?.("evidence");
  const start = performance.now();
  const observed = await reader.read(sourceUrl);
  if (observed.status !== "ok") return observed;
  if (observed.data.status === "unavailable") return { status: "needs_input" as const,
    failureCode: "SOURCE_INACCESSIBLE" as const, message: "Video unavailable. Provide an accessible public YouTube URL." };
  const evidence = normalizeVideoEvidence(observed.data);
  const evidenceMs = performance.now() - start;
  options.onProgress?.("classification");
  const result = await classifier.classify(evidence);
  options.onProgress?.("validated");
  return {
    status: "ok" as const, source_url: sourceUrl, evidence, result,
    provenance: {
      gemini: { model: observed.model, prompt_version: YOUTUBE_EVIDENCE_PROMPT_VERSION, kind: "model_generated_video_observations" },
      openai: { model: classifier.model, prompt_version: CLASSIFY_REEL_PROMPT_VERSION },
      facts_verified: false, planner_validated: false,
    },
    timings_ms: { evidence: Math.round(evidenceMs), classification: Math.round(performance.now() - start - evidenceMs) },
    limitations: [
      "Visual timestamps and observations are model-generated; frame selection and full coverage are not verified.",
      "Source claims, including fees and advice, are not externally verified.",
      "Literal citations do not prove semantic correctness or prompt-injection resistance.",
    ],
  };
}


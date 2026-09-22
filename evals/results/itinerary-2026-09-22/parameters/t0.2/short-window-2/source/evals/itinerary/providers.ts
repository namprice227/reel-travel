import { z } from "zod";
import type { ItineraryProvider, ItineraryProviderRequest } from "@reel/ai/itinerary";
import { ProviderError, providerJson } from "../../packages/ai/src/provider-request";

const count = z.number().int().nonnegative().optional();
const userText = (request: ItineraryProviderRequest) => JSON.stringify({ ...request.input,
  ...(request.repair ? { repair: request.repair } : {}) });

/** Benchmark adapters only: the production provider registry remains unchanged. */
export function geminiProvider(options: { apiKey?: string; model?: string; temperature?: number; fetch?: typeof fetch }): ItineraryProvider {
  const model = options.model ?? "gemini-3.6-flash";
  return { id: "gemini", async generate(request) {
    if (!options.apiKey) throw new ProviderError("API_KEY_MISSING", "Gemini key is missing.");
    const raw = await providerJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userText(request) }] }],
        generationConfig: { temperature: options.temperature ?? 0.2, candidateCount: 1,
          maxOutputTokens: request.limits.maxOutputTokens, thinkingConfig: { thinkingLevel: "minimal" },
          responseMimeType: "application/json", responseJsonSchema: request.jsonSchema } }),
    }, { fetch: options.fetch, timeoutMs: request.limits.timeoutMs, code: "GENERATION_FAILED" });
    try {
      const data = z.object({ modelVersion: z.string().optional(),
        candidates: z.array(z.object({ finishReason: z.string(), content: z.object({
          parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }) })).length(1),
        usageMetadata: z.object({ promptTokenCount: count, candidatesTokenCount: count, thoughtsTokenCount: count }).optional(),
      }).parse(raw);
      const candidate = data.candidates[0]!;
      if (candidate.finishReason !== "STOP") throw Error("Incomplete response");
      const text = candidate.content.parts.filter(p => !p.thought).map(p => p.text ?? "").join("");
      return { model: data.modelVersion ?? model, proposal: JSON.parse(text) as unknown,
        usage: { inputTokens: data.usageMetadata?.promptTokenCount ?? null,
          outputTokens: data.usageMetadata?.candidatesTokenCount == null ? null :
            data.usageMetadata.candidatesTokenCount + (data.usageMetadata.thoughtsTokenCount ?? 0) } };
    } catch { throw new ProviderError("MALFORMED_OUTPUT", "Gemini returned blocked, truncated or invalid JSON output."); }
  } };
}

export function ollamaProvider(options: { model?: string; temperature?: number; fetch?: typeof fetch } = {}): ItineraryProvider {
  const model = options.model ?? "qwen3:8b";
  return { id: "ollama", async generate(request) {
    const raw = await providerJson("http://127.0.0.1:11434/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false, think: false, keep_alive: "30m", format: request.jsonSchema,
        messages: [{ role: "system", content: request.systemPrompt }, { role: "user", content: userText(request) }],
        options: { temperature: options.temperature ?? 0.2, num_ctx: 16384, num_predict: request.limits.maxOutputTokens } }),
    }, { fetch: options.fetch, timeoutMs: request.limits.timeoutMs, code: "GENERATION_FAILED" });
    try {
      const data = z.object({ model: z.string(), done: z.literal(true), done_reason: z.string(),
        message: z.object({ content: z.string() }), prompt_eval_count: count, eval_count: count }).parse(raw);
      if (data.done_reason !== "stop") throw Error("Truncated response");
      return { model: data.model, proposal: JSON.parse(data.message.content) as unknown,
        usage: { inputTokens: data.prompt_eval_count ?? null, outputTokens: data.eval_count ?? null } };
    } catch { throw new ProviderError("MALFORMED_OUTPUT", "Ollama returned incomplete or invalid JSON output."); }
  } };
}

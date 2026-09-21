import { z } from "zod";
import type { ItineraryProvider } from "./itinerary";
import { ProviderError, providerJson } from "./provider-request";

export function createOpenAIItineraryProvider(options: { apiKey?: string; model?: string; fetch?: typeof fetch }): ItineraryProvider {
  const model = options.model?.trim() || "gpt-4.1-mini-2025-04-14";
  return { id: "openai", async generate(request) {
    if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "OpenAI itinerary generation is not configured.");
    const raw = await providerJson("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${options.apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, store: false, input: [
        { role: "system", content: request.systemPrompt }, { role: "user", content: JSON.stringify(request.input) },
      ], text: { format: { type: "json_schema", name: "itinerary_proposal", strict: true, schema: request.jsonSchema } },
      max_output_tokens: request.limits.maxOutputTokens }),
    }, { fetch: options.fetch, timeoutMs: request.limits.timeoutMs, code: "GENERATION_FAILED" });
    try {
      const result = z.object({ status: z.string(), model: z.string().optional(),
        usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).optional(),
        output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
      }).parse(raw);
      const content = result.output.filter(o => o.type === "message").flatMap(o => o.content ?? []);
      if (content.some(c => c.type === "refusal")) throw new ProviderError("LLM_REFUSAL", "The itinerary model refused this request.");
      const texts = content.filter(c => c.type === "output_text");
      if (result.status !== "completed" || texts.length !== 1 || !texts[0]?.text) throw Error("Incomplete output");
      return { proposal: JSON.parse(texts[0].text) as unknown, model: result.model ?? model,
        usage: { inputTokens: result.usage?.input_tokens ?? null, outputTokens: result.usage?.output_tokens ?? null } };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("MALFORMED_OUTPUT", "The itinerary model returned incomplete or invalid JSON.");
    }
  } };
}

import { z } from "zod";
import { EXTRACT_PLACES_PROMPT } from "../prompts/extract-places-v1";
import { ClueListSchema, type Extractor } from "./types";
import { ProviderError, providerJson } from "./provider-request";
import type { YouTubeTranscriber } from "./youtube";

export function createOpenAIExtractor(options: {
  apiKey?: string; model?: string; timeoutMs?: number; fetch?: typeof fetch; youtube?: YouTubeTranscriber;
}): Extractor {
  return { async extract(input) {
    const extra = [input.note, input.details].filter(Boolean).join("\n");
    let text = extra;
    if (input.sourceType === "text") text = [input.text, extra].filter(Boolean).join("\n");
    else if (input.sourceType === "link" && !extra) {
      if (!options.youtube) return { status: "needs_input", failureCode: "SOURCE_INACCESSIBLE", message: "Supply transcript text or enable YouTube transcription." };
      const result = await options.youtube.transcribe(input.url);
      if (result.status !== "ok") return result;
      text = result.transcript;
    } else if (input.sourceType === "screenshot" && !extra) {
      return { status: "needs_input", failureCode: "IMAGE_UNREADABLE", message: "Add the place names as text." };
    }
    if (!text.trim()) return { status: "ok", clues: [] };
    if (text.length > 100_000) throw new ProviderError("EXTRACTION_ERROR", "Source exceeds 100000 characters.");
    if (!options.apiKey?.trim()) throw new ProviderError("API_KEY_MISSING", "Set OPENAI_API_KEY in apps/web/.env.local.");
    const raw = await providerJson("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${options.apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model?.trim() || "gpt-4o-mini", store: false,
        input: [{ role: "system", content: EXTRACT_PLACES_PROMPT }, { role: "user", content: text }],
        text: { format: { type: "json_schema", name: "place_clues", strict: true,
          schema: z.toJSONSchema(ClueListSchema, { target: "draft-7" }) } }, max_output_tokens: 8000 }),
    }, { ...options, code: "EXTRACTION_ERROR" });
    try {
      const response = z.object({ status: z.string(), output: z.array(z.object({ type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).parse(raw);
      const content = response.output.filter(x => x.type === "message").flatMap(x => x.content ?? []);
      if (content.some(x => x.type === "refusal")) throw new ProviderError("LLM_REFUSAL", "Extraction model refused the source.");
      if (response.status !== "completed") throw new ProviderError("EXTRACTION_ERROR", "Extraction did not complete; partial output rejected.");
      const outputs = content.filter(x => x.type === "output_text");
      if (outputs.length !== 1 || !outputs[0]?.text) throw new Error("Missing output");
      const parsed = ClueListSchema.parse(JSON.parse(outputs[0].text));
      if (parsed.clues.some(c => !c.excerpt?.trim() || !text.includes(c.excerpt))) throw new Error("Unsupported evidence");
      // Only identical clues collapse; preserve distinct branches and evidence excerpts.
      const clues = parsed.clues.filter((c, i, all) => all.findIndex(p =>
        p.query === c.query && p.hint === c.hint && p.excerpt === c.excerpt) === i);
      return { status: "ok", clues };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("MALFORMED_OUTPUT", "Clues failed schema or literal source-evidence validation.");
    }
  } };
}

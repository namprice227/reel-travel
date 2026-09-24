import { z } from "zod";
import { CountryCode, SourceCategory, mentionsCountry } from "@reel/contracts";
import { EXTRACT_PLACES_PROMPT } from "../prompts/extract-places-v1";
import { ClueListSchema, PlaceClueSchema, type Extractor } from "./types";
import { PROVIDER_RETRY_DELAYS_MS, ProviderError, providerJson } from "./provider-request";
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
    // The model cites a passage ID; only the server copies original source text into evidence.
    const passages = sourcePassages(text);
    const reference = z.number().int().min(0).max(passages.length - 1);
    const outputSchema = z.object({ clues: z.array(PlaceClueSchema.omit({ excerpt: true, classification: true }).extend({
      sourcePassage: z.number().int().min(0).max(passages.length - 1),
      countryCode: CountryCode.nullable(),
      countryPassage: reference.nullable(),
      category: SourceCategory.nullable(),
      categoryPassage: reference.nullable(),
    })).max(50) });
    const raw = await providerJson("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${options.apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model?.trim() || "gpt-4o-mini", store: false,
        input: [{ role: "system", content: EXTRACT_PLACES_PROMPT }, { role: "user", content: JSON.stringify({
          passages: passages.map((text, id) => ({ id, text })),
        }) }],
        text: { format: { type: "json_schema", name: "place_clues", strict: true,
          schema: z.toJSONSchema(outputSchema, { target: "draft-7" }) } }, max_output_tokens: 8000 }),
    }, { ...options, code: "EXTRACTION_ERROR", retryDelaysMs: PROVIDER_RETRY_DELAYS_MS });
    try {
      const response = z.object({ status: z.string(), output: z.array(z.object({ type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).parse(raw);
      const content = response.output.filter(x => x.type === "message").flatMap(x => x.content ?? []);
      if (content.some(x => x.type === "refusal")) throw new ProviderError("LLM_REFUSAL", "Extraction model refused the source.");
      if (response.status !== "completed") throw new ProviderError("EXTRACTION_ERROR", "Extraction did not complete; partial output rejected.");
      const outputs = content.filter(x => x.type === "output_text");
      if (outputs.length !== 1 || !outputs[0]?.text) throw new Error("Missing output");
      const referenced = outputSchema.parse(JSON.parse(outputs[0].text));
      const parsed = ClueListSchema.parse({ clues: referenced.clues.map(({ sourcePassage, countryCode, countryPassage, category, categoryPassage, ...clue }) => {
        // Copy evidence ourselves. Unsupported labels become unknown without discarding a valid place clue.
        const countryExcerpt = countryPassage === null ? null : passages[countryPassage]!;
        return { ...clue, excerpt: passages[sourcePassage], classification: {
          source: "ai", country: countryCode && countryExcerpt && mentionsCountry(countryExcerpt, countryCode)
            ? { code: countryCode, excerpt: countryExcerpt } : null,
          category: category && categoryPassage !== null ? { value: category, excerpt: passages[categoryPassage] } : null,
        } };
      }) });
      if (parsed.clues.some(c => !c.excerpt?.trim() || !text.includes(c.excerpt))) throw new Error("Unsupported evidence");
      // Only identical clues collapse; preserve distinct branches and evidence excerpts.
      const clues = parsed.clues.filter((c, i, all) => all.findIndex(p =>
        p.query === c.query && p.hint === c.hint && p.excerpt === c.excerpt
        && JSON.stringify(p.classification) === JSON.stringify(c.classification)) === i);
      return { status: "ok", clues };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("MALFORMED_OUTPUT", "Clues failed schema or literal source-evidence validation.");
    }
  } };
}

/** Bounded, contiguous source quotes. Never paraphrase or join distant text. */
function sourcePassages(text: string): string[] {
  const passages: string[] = [];
  for (const sentence of text.match(/[\s\S]*?(?:[.!?](?=\s|$)|\n|$)/g) ?? []) {
    let remaining = sentence.trim();
    while (remaining.length > 300) {
      const space = remaining.lastIndexOf(" ", 300);
      const end = space > 0 ? space : 300;
      passages.push(remaining.slice(0, end));
      remaining = remaining.slice(end).trim();
    }
    if (remaining) passages.push(remaining);
  }
  return passages;
}

import { z } from "zod";
import { providerJson } from "../../packages/ai/src/provider-request";
import { evidenceInput, PROMPT, WIRE_SCHEMA, type Case, type ProviderId } from "./schema";

const count = z.number().int().nonnegative().nullable();
export const UsageSchema = z.strictObject({
  inputTokens: count, outputTokens: count, cachedInputTokens: count, cacheWriteTokens: count,
});
export type Usage = z.infer<typeof UsageSchema>;
export const emptyUsage = (): Usage => ({ inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteTokens: null });
export const SettingsSchema = z.strictObject({
  maxOutputTokens: z.number().int().positive(), timeoutMs: z.number().int().positive().max(300000),
  temperature: z.number().min(0).max(2).nullable(),
  reasoning: z.string().nullable(), format: z.enum(["json_schema", "json_object"]),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type Response = { text: string; model: string; usage: Usage; complete: boolean };
export interface Adapter {
  id: ProviderId; model: string; settings: Settings;
  generate(c: Case): Promise<Response>;
}
export function settingsFor(id: ProviderId, model: string): Settings {
  return { maxOutputTokens: 1500, timeoutMs: 60000,
    temperature: id === "deepseek" || (id === "anthropic" && /^claude-haiku-4-5/.test(model)) ? 0 : null,
    reasoning: id === "deepseek" ? "disabled" : id === "openai" && /^gpt-5\.6(?:-|$)/.test(model) ? "none" : null,
    format: id === "deepseek" ? "json_object" : "json_schema" };
}
const token = (v: unknown): number | null => typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
const object = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const list = (v: unknown): Record<string, any>[] => Array.isArray(v) ? v.map(object) : [];
export function createAdapter(id: ProviderId, env: NodeJS.ProcessEnv, customFetch?: typeof fetch): Adapter {
  const key = env[id.toUpperCase() + "_API_KEY"]?.trim();
  const model = env[id.toUpperCase() + "_MODEL"]?.trim();
  if (!key || !model) throw Error("Missing " + id.toUpperCase() + "_API_KEY or _MODEL.");
  const settings = settingsFor(id, model);
  return { id, model, settings, async generate(c) {
    const input = JSON.stringify(evidenceInput(c));
    const sampling = settings.temperature === null ? {} : { temperature: settings.temperature };
    let url: string, body: object;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (id === "openai") {
      url = "https://api.openai.com/v1/responses";
      headers.Authorization = "Bearer " + key;
      body = { model, store: false, max_output_tokens: settings.maxOutputTokens, ...sampling,
        ...(settings.reasoning ? { reasoning: { effort: settings.reasoning } } : {}),
        input: [{ role: "system", content: PROMPT }, { role: "user", content: input }],
        text: { format: { type: "json_schema", name: "place_clues", strict: true, schema: WIRE_SCHEMA } } };
    } else if (id === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01";
      body = { model, system: PROMPT, max_tokens: settings.maxOutputTokens, ...sampling,
        messages: [{ role: "user", content: input }],
        output_config: { format: { type: "json_schema", schema: WIRE_SCHEMA } } };
    } else {
      url = "https://api.deepseek.com/chat/completions";
      headers.Authorization = "Bearer " + key;
      body = { model, max_tokens: settings.maxOutputTokens, ...sampling, thinking: { type: "disabled" },
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: input }],
        response_format: { type: "json_object" } };
    }
    const data = object(await providerJson(url, { method: "POST", headers, body: JSON.stringify(body) },
      { fetch: customFetch, timeoutMs: settings.timeoutMs, code: "PROVIDER_ERROR" }));
    const u = object(data.usage);
    const reportedModel = typeof data.model === "string" ? data.model : model;
    if (id === "openai") {
      const content = list(data.output).filter(p => p.type === "message").flatMap(p => list(p.content));
      const texts = content.filter(p => p.type === "output_text" && typeof p.text === "string");
      return { model: reportedModel, text: texts.map(p => p.text).join(""),
        complete: data.status === "completed" && texts.length === 1 && !content.some(p => p.type === "refusal"),
        usage: { inputTokens: token(u.input_tokens), outputTokens: token(u.output_tokens),
          cachedInputTokens: token(object(u.input_tokens_details).cached_tokens), cacheWriteTokens: 0 } };
    }
    if (id === "anthropic") {
      const texts = list(data.content).filter(p => p.type === "text" && typeof p.text === "string");
      const read = token(u.cache_read_input_tokens) ?? 0, write = token(u.cache_creation_input_tokens) ?? 0;
      return { model: reportedModel, text: texts.map(p => p.text).join(""),
        complete: data.stop_reason === "end_turn" && texts.length === 1,
        usage: { inputTokens: token(u.input_tokens) === null ? null : u.input_tokens + read + write,
          outputTokens: token(u.output_tokens), cachedInputTokens: read, cacheWriteTokens: write } };
    }
    const choices = list(data.choices), choice = choices[0] ?? {}, message = object(choice.message);
    return { model: reportedModel, text: typeof message.content === "string" ? message.content : "",
      complete: choices.length === 1 && choice.finish_reason === "stop",
      usage: { inputTokens: token(u.prompt_tokens), outputTokens: token(u.completion_tokens),
        cachedInputTokens: token(u.prompt_cache_hit_tokens) ?? token(object(u.prompt_tokens_details).cached_tokens),
        cacheWriteTokens: 0 } };
  } };
}

// Node/server-only entry point: @reel/ai/audio. Never import into client components.
import { open } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import { AUDIO_EXTRACTION_PROMPT } from "../prompts/audio-extraction-v1";
import { AudioExtractionResultSchema, TranscriptExtractionSchema, type AudioExtractionResult, type ExtractedPlace } from "./audio-schema";
export * from "./audio-schema";

export type AudioErrorCode = "INVALID_FILE" | "UNSUPPORTED_AUDIO_TYPE" | "AUDIO_TOO_LARGE"
  | "API_KEY_MISSING" | "INVALID_CONFIGURATION" | "TRANSCRIPTION_TIMEOUT" | "TRANSCRIPTION_FAILED"
  | "EXTRACTION_TIMEOUT" | "EXTRACTION_FAILED" | "LLM_REFUSAL" | "MALFORMED_OUTPUT";
export class AudioPipelineError extends Error {
  constructor(public readonly code: AudioErrorCode, message: string) {
    super(message);
    this.name = "AudioPipelineError";
  }
}
export interface AudioTranscriber { transcribe(audio: File): Promise<string> }
export interface TranscriptExtractor { extract(transcript: string): Promise<{ extractedPlaces: ExtractedPlace[] }> }
export interface AudioProviders { transcriber: AudioTranscriber; extractor: TranscriptExtractor }
export const MAX_AUDIO_BYTES = 25_000_000;
// Deliberately narrower than the API: this slice accepts audio samples, not uploaded videos.
const audioTypes: Record<string, string> = {
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mpga": "audio/mpeg",
};

export async function readLocalAudio(filepath: string): Promise<File> {
  if (!filepath?.trim()) throw new AudioPipelineError("INVALID_FILE", "Provide a local audio filepath.");
  const extension = extname(filepath).toLowerCase();
  const contentType = audioTypes[extension];
  if (!contentType) throw new AudioPipelineError("UNSUPPORTED_AUDIO_TYPE", "Supported audio types: wav, mp3, m4a, mpga.");
  let handle;
  try {
    handle = await open(filepath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0) throw new AudioPipelineError("INVALID_FILE", "Audio must be a nonempty regular file.");
    if (stat.size > MAX_AUDIO_BYTES) throw new AudioPipelineError("AUDIO_TOO_LARGE", "Audio must be at most 25 MB.");
    // Read at most the checked size plus one byte, even if the file grows concurrently.
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length !== stat.size) throw new AudioPipelineError("INVALID_FILE", "Audio changed while being read. Try again.");
    // Generic filename avoids disclosing the user's local path or filename to the provider.
    return new File([bytes.subarray(0, length)], `sample${extension}`, { type: contentType });
  } catch (error) {
    if (error instanceof AudioPipelineError) throw error;
    throw new AudioPipelineError("INVALID_FILE", "Audio file is missing, unreadable, or invalid.");
  } finally {
    await handle?.close();
  }
}

/** Validate independently of the provider, retaining literal source evidence. */
export function validateTranscriptExtraction(value: unknown, transcript: string) {
  const parsed = TranscriptExtractionSchema.safeParse(value);
  if (!parsed.success || parsed.data.extractedPlaces.some(p => p.excerpts.some(e => !transcript.includes(e)))) {
    throw new AudioPipelineError("MALFORMED_OUTPUT", "Extraction does not match the schema or its evidence is absent from the transcript.");
  }
  // Only consolidate exact identities; never guess that differently named branches are equivalent.
  const places: ExtractedPlace[] = [];
  for (const place of parsed.data.extractedPlaces) {
    const duplicate = place.name === null ? undefined : places.find(p =>
      p.name === place.name && p.city === place.city && p.area === place.area && p.category === place.category);
    if (duplicate) {
      duplicate.excerpts = [...new Set([...duplicate.excerpts, ...place.excerpts])];
      duplicate.clues = [...new Set([...duplicate.clues, ...place.clues])];
    } else places.push(place);
  }
  const result = TranscriptExtractionSchema.safeParse({ extractedPlaces: places });
  if (!result.success) throw new AudioPipelineError("MALFORMED_OUTPUT", "Consolidated extraction exceeds schema limits.");
  return result.data;
}

export function createOpenAIAudioProviders(options: {
  apiKey?: string; transcriptionModel?: string; extractionModel?: string; timeoutMs?: number; fetch?: typeof fetch;
}): AudioProviders {
  const key = options.apiKey?.trim();
  if (!key) throw new AudioPipelineError("API_KEY_MISSING", "Set OPENAI_API_KEY in apps/web/.env.local or your environment.");
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new AudioPipelineError("INVALID_CONFIGURATION", "Timeout must be an integer between 1 and 300000 ms.");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  async function request(path: string, body: BodyInit, stage: "TRANSCRIPTION" | "EXTRACTION", json = false): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AudioPipelineError(`${stage}_TIMEOUT`, `${stage.toLowerCase()} timed out. Try a shorter sample or increase the timeout.`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetcher(`https://api.openai.com/v1/${path}`, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, ...(json ? { "Content-Type": "application/json" } : {}) }, body,
        });
        if (!response.ok) throw new AudioPipelineError(`${stage}_FAILED`, `${stage.toLowerCase()} request failed (HTTP ${response.status}). Check credentials, model access, and quota.`);
        return await response.json();
      })()]);
    } catch (error) {
      if (error instanceof AudioPipelineError) throw error;
      // Do not echo provider bodies, source content, API keys, or filesystem paths.
      throw new AudioPipelineError(`${stage}_FAILED`, `${stage.toLowerCase()} request failed or returned an invalid response.`);
    } finally { clearTimeout(timer); }
  }
  return {
    transcriber: {
      async transcribe(audio) {
        const form = new FormData();
        form.set("file", audio);
        form.set("model", options.transcriptionModel?.trim() || "gpt-4o-mini-transcribe");
        form.set("response_format", "json");
        const result = z.object({ text: z.string().max(100_000) }).safeParse(await request("audio/transcriptions", form, "TRANSCRIPTION"));
        if (!result.success) throw new AudioPipelineError("TRANSCRIPTION_FAILED", "Transcription response has no valid text.");
        return result.data.text;
      },
    },
    extractor: {
      async extract(transcript) {
        if (transcript.length > 100_000) throw new AudioPipelineError("EXTRACTION_FAILED", "Transcript exceeds the sample limit of 100000 characters.");
        if (!transcript.trim()) return { extractedPlaces: [] };
        const response = await request("responses", JSON.stringify({
          model: options.extractionModel?.trim() || "gpt-4o-mini",
          store: false,
          input: [{ role: "system", content: AUDIO_EXTRACTION_PROMPT }, { role: "user", content: transcript }],
          text: { format: { type: "json_schema", name: "travel_place_leads", strict: true,
            schema: z.toJSONSchema(TranscriptExtractionSchema, { target: "draft-7" }) } },
          max_output_tokens: 8000,
        }), "EXTRACTION", true);
        const envelope = z.object({ status: z.string(), output: z.array(z.object({
          type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
        })) }).safeParse(response);
        if (!envelope.success) throw new AudioPipelineError("MALFORMED_OUTPUT", "Invalid extraction response envelope.");
        const content = envelope.data.output.filter(item => item.type === "message").flatMap(item => item.content ?? []);
        if (content.some(item => item.type === "refusal")) throw new AudioPipelineError("LLM_REFUSAL", "The extraction model refused this input.");
        if (envelope.data.status !== "completed") throw new AudioPipelineError("EXTRACTION_FAILED", "Extraction did not complete; no partial output was accepted.");
        const output = content.filter(item => item.type === "output_text");
        if (output.length !== 1 || typeof output[0]?.text !== "string") throw new AudioPipelineError("MALFORMED_OUTPUT", "Expected one structured extraction result.");
        let value: unknown;
        try { value = JSON.parse(output[0].text); }
        catch { throw new AudioPipelineError("MALFORMED_OUTPUT", "Extraction returned invalid JSON."); }
        return validateTranscriptExtraction(value, transcript);
      },
    },
  };
}

export async function extractPlacesFromAudio(filepath: string, providers: AudioProviders): Promise<AudioExtractionResult> {
  const audio = await readLocalAudio(filepath);
  const transcript = await providers.transcriber.transcribe(audio);
  if (typeof transcript !== "string" || transcript.length > 100_000) throw new AudioPipelineError("TRANSCRIPTION_FAILED", "Invalid transcript.");
  const result = validateTranscriptExtraction(await providers.extractor.extract(transcript), transcript);
  return AudioExtractionResultSchema.parse({ transcript, ...result });
}

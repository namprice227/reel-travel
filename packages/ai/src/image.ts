import { z } from "zod";
import type { ImportFailureCode } from "@reel/contracts";
import { IMAGE_EVIDENCE_PROMPT } from "../prompts/image-evidence-v1";
import { IMAGE_STOPS_PROMPT } from "../prompts/image-stops-v1";
import { toGeminiJsonSchema } from "./gemini-schema";
import {
  ImageEvidenceOutputSchema,
  ImageStopsOutputSchema,
  type ImageEvidenceOutput,
  type ImageStop,
} from "./image-schema";
import { ProviderError } from "./provider-request";

export interface GeminiImageOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ImageInput {
  bytes: Uint8Array;
  contentType: string;
}

export type ImageReadResult =
  | { status: "ok"; evidence: ImageEvidenceOutput }
  | { status: "needs_input"; failureCode: ImportFailureCode; message: string };

export function createGeminiImageReader(options: GeminiImageOptions = {}) {
  const model = options.model?.trim() || process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || "gemini-3.5-flash-lite";
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!/^[a-zA-Z0-9._-]+$/.test(model) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new ProviderError("INVALID_CONFIGURATION", "Use a valid Gemini model name and timeout between 1 and 300000 ms.");
  }

  return {
    async read(image: ImageInput): Promise<ImageReadResult> {
      if (!image.bytes || image.bytes.length === 0) {
        return { status: "needs_input", failureCode: "IMAGE_UNREADABLE", message: "Screenshot image is empty." };
      }
      const key = options.apiKey?.trim();
      if (!key) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_AI_API_KEY in apps/web/.env.local (not .env.example).");

      const base64Data = Buffer.from(image.bytes).toString("base64");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProviderError("EXTRACTION_ERROR", "Gemini image analysis timed out. Try a smaller image or increase timeout."));
        }, timeoutMs);
      });

      try {
        return await Promise.race([
          deadline,
          (async (): Promise<ImageReadResult> => {
            const response = await (options.fetch ?? globalThis.fetch)(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",
                redirect: "error",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: IMAGE_EVIDENCE_PROMPT }] },
                  contents: [
                    {
                      role: "user",
                      parts: [
                        { inlineData: { mimeType: image.contentType, data: base64Data } },
                        { text: "Analyze the image according to the system instructions and return the requested JSON." },
                      ],
                    },
                  ],
                  generationConfig: {
                    temperature: options.temperature ?? 0.2,
                    maxOutputTokens: options.maxOutputTokens ?? 4096,
                    responseMimeType: "application/json",
                    ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
                    responseJsonSchema: toGeminiJsonSchema(ImageEvidenceOutputSchema),
                  },
                }),
              },
            );

            if (!response.ok) {
              const guidance =
                response.status === 400
                  ? "Gemini rejected the request. Check image format or model parameters."
                  : response.status === 429
                    ? "Gemini rate limit exceeded. Check quota."
                    : "Check API key and image accessibility.";
              throw new ProviderError("EXTRACTION_ERROR", `Gemini request failed (HTTP ${response.status}). ${guidance}`);
            }

            const rawJson = await response.json();
            const envelope = z
              .object({
                promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
                candidates: z
                  .array(
                    z.object({
                      finishReason: z.string().optional(),
                      content: z
                        .object({
                          parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
                        })
                        .optional(),
                    }),
                  )
                  .optional(),
              })
              .safeParse(rawJson);

            if (!envelope.success) throw new ProviderError("MALFORMED_OUTPUT", "Invalid Gemini response shape.");
            const candidate = envelope.data.candidates?.[0];
            if (
              envelope.data.promptFeedback?.blockReason ||
              ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate?.finishReason ?? "")
            ) {
              throw new ProviderError("LLM_REFUSAL", "Gemini declined observation of this image.");
            }
            if (candidate?.finishReason !== "STOP" && candidate?.finishReason !== undefined) {
              throw new ProviderError("EXTRACTION_ERROR", `Gemini ended unexpectedly (${candidate?.finishReason}).`);
            }

            const rawText = candidate?.content?.parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
            if (!rawText.trim()) throw new ProviderError("MALFORMED_OUTPUT", "Gemini returned empty text.");

            let parsed: unknown;
            try {
              parsed = JSON.parse(rawText);
            } catch {
              throw new ProviderError("MALFORMED_OUTPUT", "Gemini output was not valid JSON.");
            }

            const evidence = ImageEvidenceOutputSchema.parse(parsed);
            if (evidence.status === "unavailable") {
              return {
                status: "needs_input",
                failureCode: "IMAGE_UNREADABLE",
                message: "Unable to read this screenshot. Type the place names as a note instead.",
              };
            }

            return { status: "ok", evidence };
          })(),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

export type ImageStopsResult =
  | { status: "ok"; visualDescription: string; stops: ImageStop[] }
  | { status: "needs_input"; failureCode: ImportFailureCode; message: string };

export function createGeminiImageStopExtractor(options: GeminiImageOptions = {}) {
  const model = options.model?.trim() || process.env.GEMINI_IMAGE_MODEL?.trim() || process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || "gemini-3.5-flash-lite";
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!/^[a-zA-Z0-9._-]+$/.test(model) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new ProviderError("INVALID_CONFIGURATION", "Use a valid Gemini model name and timeout between 1 and 300000 ms.");
  }

  return {
    async extract(image: ImageInput, destination?: string): Promise<ImageStopsResult> {
      if (!image.bytes || image.bytes.length === 0) {
        return { status: "needs_input", failureCode: "IMAGE_UNREADABLE", message: "Screenshot image is empty." };
      }
      const key = options.apiKey?.trim();
      if (!key) throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_AI_API_KEY in apps/web/.env.local (not .env.example).");

      const base64Data = Buffer.from(image.bytes).toString("base64");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProviderError("EXTRACTION_ERROR", "Gemini image analysis timed out. Try a smaller image or increase timeout."));
        }, timeoutMs);
      });

      try {
        return await Promise.race([
          deadline,
          (async (): Promise<ImageStopsResult> => {
            const promptText = destination
              ? `Trip destination: ${destination}. Extract all distinct travel stops, venues, and points of interest shown in this image.`
              : "Extract all distinct travel stops, venues, and points of interest shown in this image.";

            const response = await (options.fetch ?? globalThis.fetch)(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",
                redirect: "error",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: IMAGE_STOPS_PROMPT }] },
                  contents: [
                    {
                      role: "user",
                      parts: [
                        { inlineData: { mimeType: image.contentType, data: base64Data } },
                        { text: promptText },
                      ],
                    },
                  ],
                  generationConfig: {
                    temperature: options.temperature ?? 0.2,
                    maxOutputTokens: options.maxOutputTokens ?? 4096,
                    responseMimeType: "application/json",
                    ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
                    responseSchema: toGeminiJsonSchema(ImageStopsOutputSchema),
                  },
                }),
              },
            );

            if (!response.ok) {
              const guidance =
                response.status === 400
                  ? "Gemini rejected the request. Check image format or model parameters."
                  : response.status === 429
                    ? "Gemini rate limit exceeded. Check quota."
                    : "Check API key and image accessibility.";
              throw new ProviderError("EXTRACTION_ERROR", `Gemini request failed (HTTP ${response.status}). ${guidance}`);
            }

            const rawJson = await response.json();
            const envelope = z
              .object({
                promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
                candidates: z
                  .array(
                    z.object({
                      finishReason: z.string().optional(),
                      content: z
                        .object({
                          parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
                        })
                        .optional(),
                    }),
                  )
                  .optional(),
              })
              .safeParse(rawJson);

            if (!envelope.success) throw new ProviderError("MALFORMED_OUTPUT", "Invalid Gemini response shape.");
            const candidate = envelope.data.candidates?.[0];
            if (
              envelope.data.promptFeedback?.blockReason ||
              ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate?.finishReason ?? "")
            ) {
              throw new ProviderError("LLM_REFUSAL", "Gemini declined observation of this image.");
            }
            if (candidate?.finishReason !== "STOP" && candidate?.finishReason !== undefined) {
              throw new ProviderError("EXTRACTION_ERROR", `Gemini ended unexpectedly (${candidate?.finishReason}).`);
            }

            const rawText = candidate?.content?.parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
            if (!rawText.trim()) throw new ProviderError("MALFORMED_OUTPUT", "Gemini returned empty text.");

            let parsed: unknown;
            try {
              parsed = JSON.parse(rawText);
            } catch {
              throw new ProviderError("MALFORMED_OUTPUT", "Gemini output was not valid JSON.");
            }

            const output = ImageStopsOutputSchema.parse(parsed);
            if (output.status === "unavailable") {
              return {
                status: "needs_input",
                failureCode: "IMAGE_UNREADABLE",
                message: "Unable to read this screenshot. Type the place names as a note instead.",
              };
            }

            return { status: "ok", visualDescription: output.visual_description, stops: output.stops };
          })(),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

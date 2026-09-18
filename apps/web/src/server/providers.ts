import { createOpenAIExtractor } from "@reel/ai/real-providers";
import { createGeminiYouTubeTranscriber } from "@reel/ai/youtube";
import { createFakeExtractor, createFakePlaceLookup, type Extractor, type PlaceLookup } from "@reel/ai";
import { config } from "./config";

/**
 * Chooses extraction from env; real imports stop at unverified candidates.
 * Only the offline fake/fake demo uses lookup. Provider keys stay server-side.
 */
export function getProviders(): { extractor: Extractor; lookup: PlaceLookup | null } {
  // Real imports stop at source-backed LLM candidates. Legacy google settings cannot enable lookup.
  return { extractor: extractor(), lookup: config.aiProvider === "fake" && config.placesProvider === "fake" ? createFakePlaceLookup() : null };
}

function extractor(): Extractor {
  switch (config.aiProvider) {
    case "openai":
      return createOpenAIExtractor({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_EXTRACTION_MODEL,
        timeoutMs: timeout(process.env.OPENAI_TIMEOUT_MS),
        youtube: createGeminiYouTubeTranscriber({ apiKey: process.env.GOOGLE_AI_API_KEY,
          model: process.env.GEMINI_TRANSCRIPTION_MODEL, timeoutMs: timeout(process.env.GEMINI_TRANSCRIPTION_TIMEOUT_MS) }) });
    case "fake":
      return createFakeExtractor({ delayMs: config.fakeAiDelayMs });
    default:
      throw new Error("Unsupported AI_PROVIDER. Use openai or fake.");
  }
}

const timeout = (value: string | undefined) => value?.trim() ? Number(value) : undefined;

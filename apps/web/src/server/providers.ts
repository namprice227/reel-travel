import { createOpenAIExtractor, createGooglePlaceLookup } from "@reel/ai/real-providers";
import { createGeminiYouTubeTranscriber } from "@reel/ai/youtube";
import { createFakeExtractor, createFakePlaceLookup, type Extractor, type PlaceLookup } from "@reel/ai";
import { config } from "./config";

/**
 * Chooses AI and place providers from env (owner: Member 3). Add real adapters in packages/ai,
 * then add a branch here. Provider keys stay server-side.
 */
export function getProviders(): { extractor: Extractor; lookup: PlaceLookup } {
  return { extractor: extractor(), lookup: lookup() };
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
      throw new Error(`AI_PROVIDER="${config.aiProvider}" is not implemented. Add an adapter in packages/ai.`);
  }
}

function lookup(): PlaceLookup {
  switch (config.placesProvider) {
    case "google":
      return createGooglePlaceLookup({ apiKey: process.env.GOOGLE_PLACES_API_KEY, timeoutMs: timeout(process.env.GOOGLE_PLACES_TIMEOUT_MS) });
    case "fake":
      return createFakePlaceLookup();
    default:
      throw new Error(`PLACES_PROVIDER="${config.placesProvider}" is not implemented. Add an adapter in packages/ai.`);
  }
}

const timeout = (value: string | undefined) => value?.trim() ? Number(value) : undefined;

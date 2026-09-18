import { createGooglePlaceLookup, createOpenAIExtractor } from "@reel/ai/real-providers";
import { createGeminiYouTubeTranscriber } from "@reel/ai/youtube";
import { createFakeExtractor, createFakePlaceLookup, type Extractor, type PlaceLookup } from "@reel/ai";
import { config } from "./config";
import { createOsmLookup } from "./osm-lookup";

/**
 * Chooses extraction and lookup from env. Provider facts still require user confirmation.
 * The offline fake/fake demo stays separate from real imports. Keys stay server-side.
 */
export function getProviders(): { extractor: Extractor; lookup: PlaceLookup | null } {
  return { extractor: extractor(), lookup: lookup() };
}

function lookup(): PlaceLookup | null {
  switch (config.placesProvider) {
    case "openstreetmap":
      if (config.aiProvider === "fake") throw new Error("Use AI_PROVIDER=openai with OpenStreetMap lookup; fixture clues are fictional.");
      return createOsmLookup();
    case "google":
      if (config.aiProvider === "fake") throw new Error("Use AI_PROVIDER=openai with Google lookup; fixture clues are fictional.");
      return createGooglePlaceLookup({ apiKey: process.env.GOOGLE_PLACES_API_KEY,
        timeoutMs: timeout(process.env.GOOGLE_PLACES_TIMEOUT_MS) });
    case "none": return null;
    case "fake":
      if (config.aiProvider !== "fake") throw new Error("Real extraction requires PLACES_PROVIDER=openstreetmap, google or none; fake matches are fictional.");
      return createFakePlaceLookup();
    default: throw new Error("Unsupported PLACES_PROVIDER. Use openstreetmap, google, none or fake.");
  }
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

import { createFakeExtractor, createFakePlaceLookup, type Extractor, type PlaceLookup } from "@reel/ai";
import { config } from "./config";

/**
 * Chooses AI and place providers from env (owner: Member 2). Add real adapters in packages/ai,
 * then add a branch here. Provider keys stay server-side.
 */
export function getProviders(): { extractor: Extractor; lookup: PlaceLookup } {
  return { extractor: extractor(), lookup: lookup() };
}

function extractor(): Extractor {
  switch (config.aiProvider) {
    case "fake":
      return createFakeExtractor({ delayMs: config.fakeAiDelayMs });
    default:
      throw new Error(`AI_PROVIDER="${config.aiProvider}" is not implemented. Add an adapter in packages/ai.`);
  }
}

function lookup(): PlaceLookup {
  switch (config.placesProvider) {
    case "fake":
      return createFakePlaceLookup();
    default:
      throw new Error(`PLACES_PROVIDER="${config.placesProvider}" is not implemented. Add an adapter in packages/ai.`);
  }
}

import { createOpenAIItineraryProvider } from "@reel/ai/openai-itinerary";
import type { ItineraryProvider } from "@reel/ai/itinerary";
import { config } from "./config";

/** Server-owned registry. Adding a provider does not change handlers, saved schedules or the validator. */
export function itineraryProvider(): ItineraryProvider | null {
  switch (config.itineraryProvider) {
    case "baseline": return null;
    case "openai": return createOpenAIItineraryProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ITINERARY_MODEL });
  }
}

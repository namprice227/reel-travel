import { PlaceDetails, PlaceOption } from "@reel/contracts";
import type { PlaceClue, PlaceLookup, PlaceLookupContext } from "./types";
import { ProviderError, providerJson } from "./provider-request";

export interface GeminiSearchPlaceLookupOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GeminiSearchCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
    role?: string;
  };
  finishReason?: string;
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingChunks?: GroundingChunk[];
  };
}

interface GeminiSearchResponse {
  candidates?: GeminiSearchCandidate[];
}

interface ParsedPlaceOutput {
  found?: boolean;
  name?: string;
  address?: string | null;
  location?: { lat?: number; lng?: number } | null;
  category?: string | null;
  summary?: string | null;
  websiteUrl?: string | null;
  placeId?: string | null;
}

function extractJson(text: string): ParsedPlaceOutput | null {
  const trimmed = text.trim();
  // Check for ```json ... ``` code fence
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const jsonCandidate = fenceMatch ? fenceMatch[1]!.trim() : trimmed;
  try {
    return JSON.parse(jsonCandidate) as ParsedPlaceOutput;
  } catch {
    // Attempt to extract the first { ... } block
    const firstBrace = jsonCandidate.indexOf("{");
    const lastBrace = jsonCandidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(jsonCandidate.slice(firstBrace, lastBrace + 1)) as ParsedPlaceOutput;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Place lookup adapter utilizing Gemini 3.5 Flash-Lite with the Google Search grounding tool.
 * Resolves places against real-time web search and returns grounded PlaceOptions with citations.
 */
export function createGeminiSearchPlaceLookup(options: GeminiSearchPlaceLookupOptions = {}): PlaceLookup {
  const model = options.model?.trim() || process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-3.5-flash-lite";
  const timeoutMs = options.timeoutMs ?? 60_000;

  if (!/^[a-zA-Z0-9._-]+$/.test(model) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new ProviderError("INVALID_CONFIGURATION", "Use a valid Gemini model name and timeout between 1 and 300000 ms.");
  }

  return {
    async search(clue: PlaceClue, context: PlaceLookupContext): Promise<PlaceOption[]> {
      const key = options.apiKey?.trim() || process.env.GOOGLE_AI_API_KEY?.trim();
      if (!key) {
        throw new ProviderError("API_KEY_MISSING", "Set GOOGLE_AI_API_KEY to use Gemini search place lookup.");
      }

      const prompt = `You are a real-world place resolution agent. Use Google Search to verify and identify this place in ${context.destination}.
Clue: "${clue.query}"
${clue.hint ? `Area/Context hint: "${clue.hint}"` : ""}
Destination: "${context.destination}"

Instructions:
1. Search Google to confirm whether this place exists in or near ${context.destination}.
2. If confirmed, return ONLY a JSON object (or markdown json block) with:
{
  "found": true,
  "name": "Official canonical place name",
  "address": "Full street address or neighborhood, or null if unknown",
  "location": { "lat": 35.658, "lng": 139.701 },
  "category": "attraction" | "food" | "lodging" | "other" | null,
  "summary": "1-2 sentence factual summary of the venue based on search results",
  "websiteUrl": "Official website or verified URL if found, or null",
  "placeId": "A unique identifier string"
}
3. If the place does NOT exist in or near ${context.destination}, or is too vague to identify as a specific venue, return:
{
  "found": false
}
Do NOT invent fake coordinates or fake addresses. Provide coordinates only if reliably known from search results; otherwise use null for location.`;

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        tools: [
          {
            google_search: {},
          },
        ],
      };

      let raw: unknown;
      try {
        raw = await providerJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: JSON.stringify(requestBody),
          },
          {
            fetch: options.fetch,
            timeoutMs,
            code: "SEARCH_LOOKUP_FAILED",
          },
        );
      } catch (searchErr) {
        // If search grounding fails (e.g. 429 quota exhausted), fall back to direct generateContent without google_search tool
        const isQuotaOrToolErr =
          searchErr instanceof ProviderError &&
          (searchErr.message.includes("429") ||
            searchErr.message.includes("quota") ||
            searchErr.code === "SEARCH_LOOKUP_FAILED");
        if (isQuotaOrToolErr) {
          raw = await providerJson(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": key,
              },
              body: JSON.stringify({
                contents: requestBody.contents,
                generationConfig: { responseMimeType: "application/json" },
              }),
            },
            {
              fetch: options.fetch,
              timeoutMs,
              code: "SEARCH_LOOKUP_FAILED",
            },
          );
        } else {
          throw searchErr;
        }
      }

      const geminiResponse = raw as GeminiSearchResponse;
      const candidate = geminiResponse.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        return [];
      }

      const parsed = extractJson(text);
      if (!parsed || !parsed.found || !parsed.name?.trim()) {
        return [];
      }
      const lat = parsed.location?.lat;
      const lng = parsed.location?.lng;
      // An unresolved location is not a routable place. Reject the legacy (0, 0) sentinel too.
      if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return [];

      const groundingChunks = candidate.groundingMetadata?.groundingChunks ?? [];
      const citations = groundingChunks
        .map((chunk) => {
          const uri = chunk.web?.uri;
          const title = chunk.web?.title ?? "Web source";
          return uri ? `[${title}](${uri})` : title;
        })
        .filter(Boolean);

      const canonicalName = parsed.name.trim();
      const slug = canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      const providerPlaceId = parsed.placeId?.trim() || `gemini_search_${slug}`;
      const firstWebUri = groundingChunks.find((c) => c.web?.uri)?.web?.uri ?? null;

      const details = PlaceDetails.parse({
        provider: "gemini-search",
        providerPlaceId,
        fetchedAt: new Date().toISOString(),
        category: parsed.category ?? null,
        openingHours: { status: "unknown" },
        typicalVisitMinutes: null,
        priceLevel: null,
        unknownFields: citations.length > 0 ? [`Sources: ${citations.join(", ")}`] : [],
        attribution: `Google Search Grounding (${model})`,
        photos: [],
        summary: parsed.summary ?? null,
        rating: null,
        ratingCount: null,
        websiteUrl: parsed.websiteUrl ?? firstWebUri,
        providerUrl: firstWebUri,
        phone: null,
        reviews: [],
      });

      const option = PlaceOption.parse({
        providerPlaceId,
        name: canonicalName,
        address: parsed.address ?? null,
        location: { lat, lng },
        details,
      });

      return [option];
    },
  };
}

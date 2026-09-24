import { describe, expect, it, vi } from "vitest";
import { createGeminiImageReader, createGeminiImageStopExtractor } from "./image";
import { createGeminiSearchPlaceLookup } from "./gemini-search-places";
import { extractAndMapImagePlaces, MAP_IMAGE_STOPS_PROMPT } from "./map-places";
import { IMAGE_EVIDENCE_PROMPT } from "../prompts/image-evidence-v1";
import { IMAGE_STOPS_PROMPT } from "../prompts/image-stops-v1";
import { ProviderError } from "./provider-request";
import type { PlaceLookup } from "./types";
import { PlaceDetails } from "@reel/contracts";

const sampleImage = {
  bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), // PNG magic header
  contentType: "image/png",
};

const mockGeminiSuccess = (data: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [{ text: JSON.stringify(data) }],
        },
      },
    ],
  });

const mockOpenAiSuccess = (data: unknown) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(data),
          },
        ],
      },
    ],
  });

describe("createGeminiImageReader", () => {
  it("processes image bytes and returns structured visual evidence", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      mockGeminiSuccess({
        status: "ok",
        visible_text: ["Tsukiji Outer Market", "築地場外市場"],
        landmarks_or_venues: ["Tsukiji Outer Market"],
        visual_description: "Bustling street food market with fresh seafood stalls and lanterns.",
        location_clues: ["Tsukiji", "Tokyo", "Japan"],
        uncertainties: [],
      }),
    );

    const reader = createGeminiImageReader({
      apiKey: "synthetic-gemini-key",
      fetch: fetcher,
    });

    const result = await reader.read(sampleImage);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected ok status");

    expect(result.evidence.visible_text).toContain("Tsukiji Outer Market");
    expect(result.evidence.landmarks_or_venues).toContain("Tsukiji Outer Market");
    expect(result.evidence.location_clues).toContain("Tokyo");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetcher.mock.calls[0];
    expect(String(calledUrl)).toContain("gemini-3.5-flash-lite:generateContent");

    const sentBody = JSON.parse(calledInit?.body as string);
    expect(sentBody.systemInstruction.parts[0].text).toBe(IMAGE_EVIDENCE_PROMPT);
    expect(sentBody.contents[0].parts[0].inlineData.mimeType).toBe("image/png");
    expect(sentBody.contents[0].parts[0].inlineData.data).toBe(Buffer.from(sampleImage.bytes).toString("base64"));
  });

  it("returns needs_input when image is unavailable or unreadable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      mockGeminiSuccess({
        status: "unavailable",
        visible_text: [],
        landmarks_or_venues: [],
        visual_description: "Completely corrupted or blurry image with no recognizable content.",
        location_clues: [],
        uncertainties: ["Image is illegible"],
      }),
    );

    const reader = createGeminiImageReader({
      apiKey: "synthetic-gemini-key",
      fetch: fetcher,
    });

    const result = await reader.read(sampleImage);
    expect(result.status).toBe("needs_input");
    if (result.status === "needs_input") {
      expect(result.failureCode).toBe("IMAGE_UNREADABLE");
    }
  });

  it("returns needs_input for empty image bytes", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const reader = createGeminiImageReader({ apiKey: "synthetic-gemini-key", fetch: fetcher });
    const result = await reader.read({ bytes: new Uint8Array([]), contentType: "image/png" });
    expect(result.status).toBe("needs_input");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("throws ProviderError when apiKey is missing", async () => {
    const reader = createGeminiImageReader({ apiKey: "" });
    await expect(reader.read(sampleImage)).rejects.toThrowError(ProviderError);
  });

  it("handles Gemini safety refusals cleanly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        candidates: [{ finishReason: "SAFETY" }],
      }),
    );

    const reader = createGeminiImageReader({ apiKey: "synthetic-gemini-key", fetch: fetcher });
    await expect(reader.read(sampleImage)).rejects.toThrow("Gemini declined observation");
  });
});

describe("extractAndMapImagePlaces", () => {
  it("runs the full 3-stage multimodal screenshot extraction & mapping pipeline", async () => {
    const fetcher = vi.fn<typeof fetch>()
      // Stage 1: Gemini image observation
      .mockResolvedValueOnce(
        mockGeminiSuccess({
          status: "ok",
          visible_text: ["SHIBUYA SKY", "渋谷スカイ"],
          landmarks_or_venues: ["Shibuya Sky"],
          visual_description: "Observation deck on rooftop overlooking Shibuya Crossing.",
          location_clues: ["Shibuya", "Tokyo"],
          uncertainties: [],
        }),
      )
      // Stage 2: OpenAI structured stop extraction
      .mockResolvedValueOnce(
        mockOpenAiSuccess({
          title: "Shibuya Sky Viewpoint",
          summary: "Panoramic rooftop observatory in Shibuya.",
          stops: [
            {
              name: "Shibuya Sky",
              area_hint: "Shibuya",
              category: "viewpoint",
              activity: "Panoramic views of Tokyo and Shibuya Crossing",
              tip: "Book sunset slot tickets in advance",
              recommended_dish: null,
              timestamp_seconds: null,
              excerpt: "SHIBUYA SKY rooftop observatory",
            },
          ],
        }),
      );

    const mockLookup: PlaceLookup = {
      search: vi.fn().mockResolvedValue([
        {
          providerPlaceId: "google:shibuya-sky-123",
          name: "SHIBUYA SKY",
          address: "2-24-12 Shibuya, Shibuya City, Tokyo 150-0002, Japan",
          location: { lat: 35.6585, lng: 139.7023 },
          details: PlaceDetails.parse({
            provider: "google",
            providerPlaceId: "google:shibuya-sky-123",
            fetchedAt: "2026-09-22T00:00:00.000Z",
            category: "viewpoint",
            openingHours: { status: "unknown" },
            typicalVisitMinutes: 60,
            priceLevel: null,
            unknownFields: [],
            attribution: "Google Maps",
          }),
        },
      ]),
    };

    const onProgress = vi.fn();
    const result = await extractAndMapImagePlaces(sampleImage, {
      destination: "Tokyo",
      geminiApiKey: "synthetic-gemini-key",
      openaiApiKey: "synthetic-openai-key",
      directExtraction: false,
      fetch: fetcher,
      lookup: mockLookup,
      onProgress,
    });

    expect(result.status).toBe("ok");
    expect(result.source.type).toBe("screenshot");
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].name).toBe("Shibuya Sky");
    expect(result.stops[0].status).toBe("pending");
    expect(result.stops[0].options).toHaveLength(1);
    expect(result.stops[0].options[0].name).toBe("SHIBUYA SKY");
    expect(result.mappedCount).toBe(1);

    expect(onProgress).toHaveBeenCalledWith("observation", expect.any(String));
    expect(onProgress).toHaveBeenCalledWith("extraction", expect.any(String));
    expect(onProgress).toHaveBeenCalledWith("mapping", expect.any(String));
    expect(onProgress).toHaveBeenCalledWith("completed", expect.any(String));

    // Verify OpenAI request payload
    const openaiCall = fetcher.mock.calls[1];
    expect(String(openaiCall[0])).toBe("https://api.openai.com/v1/responses");
    const openaiBody = JSON.parse(openaiCall[1]?.body as string);
    expect(openaiBody.input[0].content).toBe(MAP_IMAGE_STOPS_PROMPT);
    const parsedUserContent = JSON.parse(openaiBody.input[1].content);
    expect(parsedUserContent.destination).toBe("Tokyo");
    expect(parsedUserContent.landmarks_or_venues).toContain("Shibuya Sky");
  });

  it("runs direct 2-stage multimodal screenshot extraction & mapping (skipping OpenAI)", async () => {
    const fetcher = vi.fn<typeof fetch>()
      // Stage 1: Gemini direct stop extraction
      .mockResolvedValueOnce(
        mockGeminiSuccess({
          status: "ok",
          visual_description: "Observation deck on rooftop overlooking Shibuya Crossing.",
          stops: [
            {
              name: "Shibuya Sky",
              area_hint: "Shibuya",
              category: "attraction",
              activity: "Panoramic views of Tokyo and Shibuya Crossing",
              tip: "Book sunset slot tickets in advance",
              excerpt: "SHIBUYA SKY rooftop observatory",
            },
          ],
        }),
      );

    const mockLookup: PlaceLookup = {
      search: vi.fn().mockResolvedValue([
        {
          providerPlaceId: "google:shibuya-sky-123",
          name: "SHIBUYA SKY",
          address: "2-24-12 Shibuya, Shibuya City, Tokyo 150-0002, Japan",
          location: { lat: 35.6585, lng: 139.7023 },
          details: PlaceDetails.parse({
            provider: "google",
            providerPlaceId: "google:shibuya-sky-123",
            fetchedAt: "2026-09-22T00:00:00.000Z",
            category: "viewpoint",
            openingHours: { status: "unknown" },
            typicalVisitMinutes: 60,
            priceLevel: null,
            unknownFields: [],
            attribution: "Google Maps",
          }),
        },
      ]),
    };

    const onProgress = vi.fn();
    const result = await extractAndMapImagePlaces(sampleImage, {
      destination: "Tokyo",
      geminiApiKey: "synthetic-gemini-key",
      fetch: fetcher,
      lookup: mockLookup,
      onProgress,
    });

    expect(result.status).toBe("ok");
    expect(result.source.type).toBe("screenshot");
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].name).toBe("Shibuya Sky");
    expect(result.stops[0].status).toBe("pending");
    expect(result.stops[0].options).toHaveLength(1);
    expect(result.stops[0].options[0].name).toBe("SHIBUYA SKY");
    expect(result.mappedCount).toBe(1);

    expect(onProgress).toHaveBeenCalledWith("extraction", expect.any(String));
    expect(onProgress).toHaveBeenCalledWith("mapping", expect.any(String));
    expect(onProgress).toHaveBeenCalledWith("completed", expect.any(String));

    // Verify only Gemini was called, no OpenAI calls made!
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("gemini-3.5-flash-lite:generateContent");
    const reqBody = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(reqBody.systemInstruction.parts[0].text).toBe(IMAGE_STOPS_PROMPT);
  });

  it("requires destination and API keys", async () => {
    await expect(
      extractAndMapImagePlaces(sampleImage, {
        destination: "",
        geminiApiKey: "synthetic-gemini-key",
      }),
    ).rejects.toThrow("Destination is required");

    await expect(
      extractAndMapImagePlaces(sampleImage, {
        destination: "Tokyo",
        geminiApiKey: "",
      }),
    ).rejects.toThrowError(ProviderError);

    const mockFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      mockGeminiSuccess({
        status: "ok",
        visible_text: [],
        landmarks_or_venues: [],
        visual_description: "scenery",
        location_clues: [],
        uncertainties: [],
      }),
    );

    await expect(
      extractAndMapImagePlaces(sampleImage, {
        destination: "Tokyo",
        directExtraction: false,
        geminiApiKey: "synthetic-gemini-key",
        openaiApiKey: "",
        fetch: mockFetcher,
      }),
    ).rejects.toThrowError(ProviderError);
  });

  it("uses Gemini 3.5 Flash-Lite Google Search tool for Stage 3 when no custom lookup is provided", async () => {
    const fetcher = vi.fn<typeof fetch>()
      // 1. Direct Gemini stop extraction
      .mockResolvedValueOnce(
        mockGeminiSuccess({
          status: "ok",
          visual_description: "SHIBUYA SKY observation deck in Tokyo",
          stops: [
            {
              name: "SHIBUYA SKY",
              area_hint: "Shibuya",
              category: "attraction",
              activity: "Look at city skyline",
              tip: "Book sunset slot",
              excerpt: "SHIBUYA SKY observation deck",
            },
          ],
        }),
      )
      // 2. Gemini 3.5 Flash-Lite Google Search tool grounding
      .mockResolvedValueOnce(
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      found: true,
                      name: "SHIBUYA SKY",
                      address: "2 Chome-24-12 Shibuya, Shibuya City, Tokyo 150-0002",
                      location: { lat: 35.6585, lng: 139.7022 },
                      category: "attraction",
                      summary: "Observation deck atop Shibuya Scramble Square with panoramic views.",
                      websiteUrl: "https://www.shibuya-scramble-square.com/sky/",
                      placeId: "gemini_shibuya_sky",
                    }),
                  },
                ],
              },
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: "https://www.shibuya-scramble-square.com/sky/",
                      title: "SHIBUYA SKY Official",
                    },
                  },
                ],
              },
            },
          ],
        }),
      );

    const result = await extractAndMapImagePlaces(sampleImage, {
      destination: "Tokyo",
      geminiApiKey: "synthetic-gemini-key",
      fetch: fetcher,
    });

    expect(result.status).toBe("ok");
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].name).toBe("SHIBUYA SKY");
    expect(result.stops[0].options).toHaveLength(1);
    expect(result.stops[0].options[0].name).toBe("SHIBUYA SKY");
    expect(result.stops[0].options[0].address).toContain("Shibuya City");
    expect(result.stops[0].options[0].location.lat).toBeCloseTo(35.6585);
    expect(result.stops[0].options[0].details.provider).toBe("gemini-search");
    expect(result.stops[0].options[0].details.attribution).toContain("gemini-3.5-flash-lite");

    // Verify exactly 2 calls: 1. multimodal stop extraction, 2. search grounding
    expect(fetcher).toHaveBeenCalledTimes(2);
    const searchCall = fetcher.mock.calls[1];
    expect(String(searchCall[0])).toContain("gemini-3.5-flash-lite:generateContent");
    const searchBody = JSON.parse(searchCall[1]?.body as string);
    expect(searchBody.tools).toEqual([{ google_search: {} }]);
  });
});

describe("createGeminiSearchPlaceLookup", () => {
  it.each([undefined, null, {}, { lat: 35 }, { lat: "35", lng: 139 }, { lat: 0, lng: 0 },
    { lat: 91, lng: 139 }, { lat: 35, lng: -181 }, { lat: Infinity, lng: 139 }])(
    "keeps missing or invalid coordinates unresolved: %j", async (location) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ candidates: [{ content: {
        parts: [{ text: JSON.stringify({ found: true, name: "Synthetic venue", location }) }],
      } }] }));
      const lookup = createGeminiSearchPlaceLookup({ apiKey: "synthetic-key", fetch: fetcher });
      expect(await lookup.search({ query: "Synthetic venue", hint: null, excerpt: null }, { destination: "Synthetic city" })).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{ lat: 0, lng: 30 }, { lat: 51, lng: 0 }])("accepts a valid location with one zero coordinate: %j", async (location) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ candidates: [{ content: {
      parts: [{ text: JSON.stringify({ found: true, name: "Synthetic venue", location }) }],
    } }] }));
    const lookup = createGeminiSearchPlaceLookup({ apiKey: "synthetic-key", fetch: fetcher });
    const result = await lookup.search({ query: "Synthetic venue", hint: null, excerpt: null }, { destination: "Synthetic city" });
    expect(result[0]?.location).toEqual(location);
  });
  it("resolves a place using gemini-3.5-flash-lite and Google Search grounding tool", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: "```json\n{\n  \"found\": true,\n  \"name\": \"Tsukiji Outer Market\",\n  \"address\": \"4 Chome-16-2 Tsukiji, Chuo City, Tokyo 104-0045\",\n  \"location\": { \"lat\": 35.6654, \"lng\": 139.7706 },\n  \"category\": \"food\",\n  \"summary\": \"Historic market with numerous wholesale and retail shops and restaurants.\",\n  \"websiteUrl\": \"https://www.tsukiji.or.jp/\"\n}\n```",
                },
              ],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: "https://www.tsukiji.or.jp/",
                    title: "Tsukiji Outer Market Official",
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    const lookup = createGeminiSearchPlaceLookup({
      apiKey: "synthetic-gemini-key",
      fetch: fetcher,
    });

    const options = await lookup.search(
      {
        query: "Tsukiji Market",
        hint: "Chuo City",
        excerpt: "Seafood stalls and street food",
      },
      { destination: "Tokyo" },
    );

    expect(options).toHaveLength(1);
    expect(options[0].name).toBe("Tsukiji Outer Market");
    expect(options[0].address).toContain("Tsukiji, Chuo City");
    expect(options[0].location.lat).toBeCloseTo(35.6654);
    expect(options[0].location.lng).toBeCloseTo(139.7706);
    expect(options[0].details.provider).toBe("gemini-search");
    expect(options[0].details.websiteUrl).toBe("https://www.tsukiji.or.jp/");
    expect(options[0].details.unknownFields[0]).toContain("Tsukiji Outer Market Official");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetcher.mock.calls[0];
    expect(String(calledUrl)).toContain("gemini-3.5-flash-lite:generateContent");
    const parsedBody = JSON.parse(calledInit?.body as string);
    expect(parsedBody.tools).toEqual([{ google_search: {} }]);
  });

  it("returns empty array when place is not found by search grounding", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: JSON.stringify({ found: false, reason: "No matching venue found." }) }],
            },
          },
        ],
      }),
    );

    const lookup = createGeminiSearchPlaceLookup({
      apiKey: "synthetic-gemini-key",
      fetch: fetcher,
    });

    const options = await lookup.search(
      { query: "Imaginary Fictional Place", hint: null, excerpt: null },
      { destination: "Tokyo" },
    );

    expect(options).toHaveLength(0);
  });
});


import { expect, it, vi } from "vitest";
import type { PlaceOption } from "@reel/contracts";
import { PlaceDetails } from "@reel/contracts";
import { extractAndMapPlaces, MappedStopsExtractionSchema } from "./map-places";
import type { PlaceLookup } from "./types";

const geminiBody = (value: unknown, finishReason = "STOP") =>
  ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
const openaiBody = (value: unknown, status = "completed") =>
  ({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });

const mockEvidence = {
  status: "ok",
  audio: { transcript: "Start at Tsukiji Outer Market for sushi, then go to Butagumi for tonkatsu.", language: "en" },
  visual_observations: [
    { timestamp_seconds: 5, visible_text: ["Tsukiji Outer Market"], description: "Market stall", uncertainties: [] },
    { timestamp_seconds: 20, visible_text: ["Butagumi"], description: "Tonkatsu shop", uncertainties: [] },
  ],
  uncertainties: [],
};

const mockExtractedStops = {
  title: "Tokyo Food Tour",
  summary: "Top food spots in Tokyo.",
  stops: [
    {
      name: "Tsukiji Outer Market",
      area_hint: "Chuo City",
      category: "market",
      activity: "Eat fresh sushi",
      tip: "Go early in the morning",
      recommended_dish: "Sashimi",
      timestamp_seconds: 5,
      excerpt: "Start at Tsukiji Outer Market",
    },
    {
      name: "Butagumi",
      area_hint: "Nishi-Azabu",
      category: "restaurant",
      activity: "Lunch in renovated house",
      tip: "Get the premium pork cutlet",
      recommended_dish: "Tonkatsu",
      timestamp_seconds: 20,
      excerpt: "go to Butagumi for tonkatsu",
    },
  ],
};

const mockPlaceOption1: PlaceOption = {
  providerPlaceId: "tsukiji-id-1",
  name: "Tsukiji Outer Market",
  address: "4 Chome Tsukiji, Chuo City, Tokyo",
  location: { lat: 35.6655, lng: 139.7707 },
  details: PlaceDetails.parse({
    provider: "google",
    providerPlaceId: "tsukiji-id-1",
    fetchedAt: "2026-09-22T00:00:00.000Z",
    category: "market",
    openingHours: { status: "unknown" },
    typicalVisitMinutes: null,
    priceLevel: 2,
    unknownFields: [],
    attribution: "Google Maps",
  }),
};

const mockPlaceOption2A: PlaceOption = {
  providerPlaceId: "butagumi-id-1",
  name: "Butagumi Main Branch",
  address: "2 Chome Nishi-Azabu, Minato City, Tokyo",
  location: { lat: 35.6601, lng: 139.7246 },
  details: PlaceDetails.parse({
    provider: "google",
    providerPlaceId: "butagumi-id-1",
    fetchedAt: "2026-09-22T00:00:00.000Z",
    category: "restaurant",
    openingHours: { status: "unknown" },
    typicalVisitMinutes: null,
    priceLevel: 3,
    unknownFields: [],
    attribution: "Google Maps",
  }),
};

const mockPlaceOption2B: PlaceOption = {
  providerPlaceId: "butagumi-id-2",
  name: "Butagumi Shokudo",
  address: "Roppongi Hills, Tokyo",
  location: { lat: 35.6605, lng: 139.7292 },
  details: PlaceDetails.parse({
    provider: "google",
    providerPlaceId: "butagumi-id-2",
    fetchedAt: "2026-09-22T00:00:00.000Z",
    category: "restaurant",
    openingHours: { status: "unknown" },
    typicalVisitMinutes: null,
    priceLevel: 2,
    unknownFields: [],
    attribution: "Google Maps",
  }),
};

it("validates MappedStopsExtractionSchema correctly", () => {
  const parsed = MappedStopsExtractionSchema.parse(mockExtractedStops);
  expect(parsed.stops).toHaveLength(2);
  expect(parsed.stops[0]?.name).toBe("Tsukiji Outer Market");
  expect(parsed.stops[0]?.recommended_dish).toBe("Sashimi");

  // Rejects stop without name
  expect(() =>
    MappedStopsExtractionSchema.parse({
      title: null,
      summary: null,
      stops: [{ name: "" }],
    }),
  ).toThrow();
});

it("extracts account reel clues without guessing a destination or calling Places", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(geminiBody(mockEvidence)))
    .mockResolvedValueOnce(Response.json(openaiBody(mockExtractedStops)));
  const lookup = { search: vi.fn(async () => []) } as unknown as PlaceLookup;
  const result = await extractAndMapPlaces("https://www.youtube.com/shorts/ABCDEFGHIJK", {
    destination: "", skipMapping: true, geminiApiKey: "test-key", openaiApiKey: "test-key",
    fetch: fetcher, lookup,
  });
  expect(result.destination).toBe("");
  expect(result.stops.map((stop) => stop.status)).toEqual(["unverified", "unverified"]);
  expect(result.stops.every((stop) => stop.options.length === 0)).toBe(true);
  expect(lookup.search).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("extracts multimodal evidence and maps places to pending and ambiguous candidates", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(geminiBody(mockEvidence)))
    .mockResolvedValueOnce(Response.json(openaiBody(mockExtractedStops)));

  const mockLookup: PlaceLookup = {
    search: vi.fn().mockImplementation(async (clue) => {
      if (clue.query === "Tsukiji Outer Market") return [mockPlaceOption1];
      if (clue.query === "Butagumi") return [mockPlaceOption2A, mockPlaceOption2B];
      return [];
    }),
  };

  const progressEvents: string[] = [];
  const result = await extractAndMapPlaces("https://www.youtube.com/watch?v=jTOfOew316s", {
    destination: "Tokyo",
    geminiApiKey: "test-gemini-key",
    openaiApiKey: "test-openai-key",
    fetch: fetcher,
    lookup: mockLookup,
    onProgress: (stage) => progressEvents.push(stage),
  });

  expect(progressEvents).toEqual(["observation", "extraction", "mapping", "completed"]);
  expect(result.status).toBe("ok");
  expect(result.destination).toBe("Tokyo");
  expect(result.source.type).toBe("youtube");
  expect(result.stops).toHaveLength(2);

  // First stop has 1 match -> "pending"
  expect(result.stops[0]?.name).toBe("Tsukiji Outer Market");
  expect(result.stops[0]?.status).toBe("pending");
  expect(result.stops[0]?.options).toHaveLength(1);
  expect(result.stops[0]?.options[0]?.providerPlaceId).toBe("tsukiji-id-1");

  // Second stop has 2 matches -> "ambiguous"
  expect(result.stops[1]?.name).toBe("Butagumi");
  expect(result.stops[1]?.status).toBe("ambiguous");
  expect(result.stops[1]?.options).toHaveLength(2);
  expect(result.mappedCount).toBe(2);
  expect(result.totalStops).toBe(2);
});

it("fails when destination is missing", async () => {
  await expect(
    extractAndMapPlaces("https://www.youtube.com/watch?v=mockVideo123", {
      destination: "   ",
    }),
  ).rejects.toThrow("Destination is required");
});

it("looks up at most the provider's per-source cap and leaves later stops unverified", async () => {
  const many = { ...mockExtractedStops, stops: Array.from({ length: 21 }, (_, i) => ({ ...mockExtractedStops.stops[0]!, name: `Synthetic stop ${i + 1}` })) };
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(geminiBody(mockEvidence)))
    .mockResolvedValueOnce(Response.json(openaiBody(many)));
  const lookup: PlaceLookup = { maxClues: 20, search: vi.fn(async () => [mockPlaceOption1]) };
  const result = await extractAndMapPlaces("https://www.youtube.com/shorts/ABCDEFGHIJK", {
    destination: "Tokyo", geminiApiKey: "test-key", openaiApiKey: "test-key", fetch: fetcher, lookup,
  });
  expect(lookup.search).toHaveBeenCalledTimes(20);
  expect(result.stops.slice(0, 20).every((stop) => stop.status === "pending")).toBe(true);
  expect(result.stops[20]).toMatchObject({ name: "Synthetic stop 21", status: "unverified", options: [] });
  expect(result.mappedCount).toBe(20);
});

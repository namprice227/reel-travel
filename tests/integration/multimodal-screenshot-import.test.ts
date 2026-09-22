import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-screenshot-import-"));
vi.stubEnv("REEL_DATA_DIR", dataDir);
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("AI_PROVIDER", "openai");
vi.stubEnv("PLACES_PROVIDER", "google");
vi.stubEnv("EXTRACTION_WORKFLOW", "multimodal");
for (const name of ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_PLACES_API_KEY"]) {
  vi.stubEnv(name, "synthetic-test-key");
}

const { processImport } = await import("../../apps/web/src/server/jobs/import-inspiration");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const trips = await import("../../apps/web/src/server/services/trips");
const { repos, assetStorage } = await import("../../apps/web/src/server/db");

const user = (await devSignIn({ email: "synthetic-screenshot@example.test" })).user;
let tripId: string;
let geminiResponse: unknown;
let openAiResponse: unknown;

const calls = vi.fn<typeof fetch>(async (url, init) => {
  const urlStr = String(url);
  if (urlStr.startsWith("https://generativelanguage.googleapis.com/")) {
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify(geminiResponse),
              },
            ],
          },
        },
      ],
    });
  }
  if (url === "https://api.openai.com/v1/responses") {
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(openAiResponse),
            },
          ],
        },
      ],
    });
  }
  if (url === "https://places.googleapis.com/v1/places:searchText") {
    return Response.json({
      places: [
        {
          id: "places-shibuya-sky-id",
          displayName: { text: "SHIBUYA SKY" },
          formattedAddress: "2-24-12 Shibuya, Shibuya City, Tokyo 150-0002, Japan",
          location: { latitude: 35.6585, longitude: 139.7023 },
        },
      ],
    });
  }
  throw new Error(`Unexpected external request in offline test: ${urlStr}`);
});

vi.stubGlobal("fetch", calls);

beforeEach(async () => {
  calls.mockClear();
  geminiResponse = {
    status: "ok",
    visual_description: "Rooftop observation deck overlooking Shibuya crossing in Tokyo.",
    stops: [
      {
        name: "Shibuya Sky",
        area_hint: "Shibuya",
        category: "attraction",
        activity: "Enjoy panoramic 360-degree city views",
        tip: "Visit near sunset for incredible lighting",
        excerpt: "SHIBUYA SKY rooftop observatory",
      },
    ],
  };
  openAiResponse = null;
  tripId = (
    await trips.createTrip(user, {
      title: "Screenshot Import Test Trip",
      destination: "Tokyo",
      timezone: "Asia/Tokyo",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
    })
  ).id;
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

it("runs multimodal screenshot import: direct Gemini stop extraction + Places mapping -> persistence", async () => {
  // Create a synthetic image File
  const fileBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const blob = new Blob([fileBytes], { type: "image/png" });
  const fakeFile = Object.assign(blob, { name: "shibuya_sky.png", lastModified: Date.now() }) as File;

  const { inspiration } = await inspirations.createScreenshotInspiration(user, tripId, {
    file: fakeFile,
    note: "Must-visit viewpoint in Tokyo",
  });

  expect(inspiration.sourceType).toBe("screenshot");
  expect(inspiration.status).toBe("queued");
  expect(inspiration.assetId).toBeTruthy();
  const savedAssetId = inspiration.assetId!;

  // Run the import worker pipeline
  await processImport(inspiration.id);

  // Check updated inspiration: places found and screenshot asset preserved as thumbnail
  const updated = await repos().inspirations.get(inspiration.id);
  expect(updated?.status).toBe("needs_confirmation");
  expect(updated?.placeIds).toHaveLength(1);
  expect(updated?.assetId).toBe(savedAssetId);

  // Verify asset binary is preserved in storage for thumbnail display
  const persistedAssetBytes = await assetStorage().get(savedAssetId);
  expect(persistedAssetBytes).not.toBeNull();

  // Verify candidate place created and persisted
  const candidatePlaces = await places.listPlaces(user, tripId);
  expect(candidatePlaces).toHaveLength(1);
  const candidate = candidatePlaces[0];
  expect(candidate.name).toBe("SHIBUYA SKY");
  expect(candidate.status).toBe("pending");
  expect(candidate.evidence).toHaveLength(1);
  expect(candidate.evidence[0].sourceType).toBe("screenshot");
  expect(candidate.evidence[0].clue).toBe("Shibuya Sky (Shibuya)");
  expect(candidate.options).toHaveLength(1);
  expect(candidate.options[0].name).toBe("SHIBUYA SKY");

  // Verify Gemini received inlineData with image/png and base64, and used gemini-3.5-flash-lite
  const geminiCall = calls.mock.calls.find((call) =>
    String(call[0]).includes("generativelanguage.googleapis.com"),
  );
  expect(geminiCall).toBeDefined();
  expect(String(geminiCall![0])).toContain("gemini-3.5-flash-lite:generateContent");
  expect(String(geminiCall![0])).not.toContain("gemini-2.5-flash");
  const geminiBody = JSON.parse(geminiCall![1]?.body as string);
  expect(geminiBody.contents[0].parts[0].inlineData.mimeType).toBe("image/png");
  expect(geminiBody.contents[0].parts[0].inlineData.data).toBe(
    Buffer.from(fileBytes).toString("base64"),
  );

  // Confirm place and verify inspiration transitions to ready
  const confirmed = await places.confirmPlace(user, tripId, candidate.id, {
    providerPlaceId: "places-shibuya-sky-id",
  });
  expect(confirmed.place.status).toBe("confirmed");
  const finalized = await repos().inspirations.get(inspiration.id);
  expect(finalized?.status).toBe("ready");
});

it("sets status to needs_input when screenshot has no identifiable places", async () => {
  geminiResponse = {
    status: "ok",
    visual_description: "An abstract blue background with no text or travel places.",
    stops: [],
  };

  const fileBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const fakeFile = Object.assign(new Blob([fileBytes], { type: "image/png" }), {
    name: "abstract.png",
    lastModified: Date.now(),
  }) as File;

  const { inspiration } = await inspirations.createScreenshotInspiration(user, tripId, {
    file: fakeFile,
  });
  const savedAssetId = inspiration.assetId!;

  await processImport(inspiration.id);

  const updated = await repos().inspirations.get(inspiration.id);
  expect(updated?.status).toBe("needs_input");
  expect(updated?.failureCode).toBe("NO_PLACES_FOUND");
  expect(updated?.assetId).toBe(savedAssetId);

  // Verify asset is retained in storage for thumbnail display
  const persistedAssetBytes = await assetStorage().get(savedAssetId);
  expect(persistedAssetBytes).not.toBeNull();
});

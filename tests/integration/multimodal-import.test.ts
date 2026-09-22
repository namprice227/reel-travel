import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { toPlannablePlace } from "@reel/planner";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-multimodal-import-"));
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
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const { repos } = await import("../../apps/web/src/server/db");

const user = (await devSignIn({ email: "synthetic-multimodal@example.test" })).user;
let tripId: string;
let stops: unknown[];
let branches: number;

const calls = vi.fn<typeof fetch>(async (url, init) => {
  const urlStr = String(url);
  if (urlStr.startsWith("https://ytplaylistlength.one/")) {
    return Response.json({
      success: true,
      results: [
        {
          id: "jTOfOew316s",
          videoCount: 1,
          fetchedVideoCount: 1,
          consideredCount: 1,
          unavailableCount: 0,
          isTruncated: false,
          rangeStart: 1,
          rangeEnd: 1,
          totalSeconds: 60,
          videos: [{ id: "jTOfOew316s", durationSeconds: 60, considered: true }],
        },
      ],
    });
  }
  if (urlStr.startsWith("https://generativelanguage.googleapis.com/")) {
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  status: "ok",
                  audio: { transcript: "Sweeten things up with cream puffs at Shiro-Hige.", language: "en" },
                  visual_observations: [
                    {
                      timestamp_seconds: 13,
                      visible_text: ["Shiro-Hige's Cream Puff Factory"],
                      description: "Totoro puffs display",
                      uncertainties: [],
                    },
                  ],
                  uncertainties: [],
                }),
              },
            ],
          },
        },
      ],
    });
  }
  if (url === "https://api.openai.com/v1/responses") {
    const bodyText = typeof init?.body === "string" ? init.body : "";
    if (bodyText.includes("itinerary_proposal")) {
      const parsedBody = JSON.parse(bodyText);
      const userContent = JSON.parse(parsedBody.input[1].content);
      const placeId = userContent.places?.[0]?.placeId ?? "place-1";
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  days: [
                    {
                      date: "2026-10-01",
                      stops: [{ kind: "place", referenceId: placeId, start: "10:00" }],
                    },
                    {
                      date: "2026-10-02",
                      stops: [],
                    },
                    {
                      date: "2026-10-03",
                      stops: [],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      });
    }
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ title: "Tokyo Food Tour", summary: "Short foodie reel", stops }),
            },
          ],
        },
      ],
    });
  }
  if (url === "https://places.googleapis.com/v1/places:searchText") {
    return Response.json({
      places: Array.from({ length: branches }, (_, i) => ({
        id: `synthetic-place-${i}`,
        displayName: { text: branches === 1 ? "Shiro-Hige's Cream Puff Factory" : `Shiro-Hige's Cream Puff Factory branch ${i}` },
        formattedAddress: `Setagaya, Tokyo branch ${i}`,
        location: { latitude: 35.659 + i / 100, longitude: 139.664 },
      })),
    });
  }
  throw new Error(`Unexpected external request in offline test: ${urlStr}`);
});

vi.stubGlobal("fetch", calls);

beforeEach(async () => {
  calls.mockClear();
  branches = 1;
  stops = [
    {
      name: "Shiro-Hige's Cream Puff Factory",
      area_hint: "Setagaya",
      category: "bakery",
      activity: "Eat Totoro cream puffs",
      tip: "Arrive early",
      recommended_dish: "Totoro cream puff",
      timestamp_seconds: 13,
      excerpt: "cream puffs at Shiro-Hige",
    },
  ];
  tripId = (
    await trips.createTrip(user, {
      title: "Multimodal Reel Import Test",
      destination: "Tokyo",
      timezone: "Asia/Tokyo",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
    })
  ).id;
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

it("runs multimodal import: Gemini video frames + OpenAI stops + Google Places -> persistence", async () => {
  const { inspiration } = await inspirations.createInspiration(user, tripId, {
    sourceType: "link",
    url: "https://www.youtube.com/watch?v=jTOfOew316s",
  });

  await processImport(inspiration.id);

  const candidatePlaces = await places.listPlaces(user, tripId);
  expect(candidatePlaces).toHaveLength(1);
  const candidate = candidatePlaces[0]!;

  expect(candidate.name).toBe("Shiro-Hige's Cream Puff Factory");
  expect(candidate.status).toBe("pending");
  expect(candidate.options).toHaveLength(1);
  expect(candidate.options[0]!.providerPlaceId).toBe("synthetic-place-0");
  expect(candidate.evidence).toHaveLength(1);
  expect(candidate.evidence[0]!.clue).toBe("Shiro-Hige's Cream Puff Factory (Setagaya)");
  expect(candidate.evidence[0]!.excerpt).toBe("cream puffs at Shiro-Hige");

  // Verify that Gemini and OpenAI and Google Places were called
  expect(calls.mock.calls.some(([u]) => String(u).includes("generativelanguage"))).toBe(true);
  expect(calls.mock.calls.some(([u]) => String(u).includes("api.openai.com"))).toBe(true);
  expect(calls.mock.calls.some(([u]) => String(u).includes("places.googleapis.com"))).toBe(true);

  // Confirm place and generate itinerary
  const confirmed = await places.confirmPlace(user, tripId, candidate.id, {
    providerPlaceId: "synthetic-place-0",
  });
  expect(confirmed.place.status).toBe("confirmed");
  expect(toPlannablePlace(confirmed.place)).toMatchObject({
    location: { lat: 35.659, lng: 139.664 },
  });

  const plan = await itinerary.generateItinerary(user, tripId, { expectedVersion: null });
  expect(plan.days.flatMap((d) => d.stops).some((s) => s.placeId === confirmed.place.id)).toBe(true);
});

it("handles unsupported social links with SOURCE_INACCESSIBLE", async () => {
  const { inspiration } = await inspirations.createInspiration(user, tripId, {
    sourceType: "link",
    url: "https://www.instagram.com/reel/Cx123456789/",
  });

  await processImport(inspiration.id);

  const updated = await repos().inspirations.get(inspiration.id);
  expect(updated?.status).toBe("needs_input");
  expect(updated?.failureCode).toBe("SOURCE_INACCESSIBLE");
  expect(updated?.failureMessage).toBe("We only support YouTube Shorts currently. Add details or upload screenshot.");
  expect(await places.listPlaces(user, tripId)).toEqual([]);
});

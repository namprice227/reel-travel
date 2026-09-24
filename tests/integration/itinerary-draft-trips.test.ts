import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { Trip } from "@reel/contracts";

// Synthetic provider replies only; no network calls. Places and videos are fictional stand-ins.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "routelet-itinerary-drafts-"));
vi.stubEnv("REEL_DATA_DIR", dataDir);
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("AI_PROVIDER", "openai");
vi.stubEnv("PLACES_PROVIDER", "google");
vi.stubEnv("EXTRACTION_WORKFLOW", "multimodal");
for (const name of ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_PLACES_API_KEY"]) vi.stubEnv(name, "synthetic-test-key");

type Video = { transcript: string; extraction: Record<string, unknown> };
const itineraryVideo: Video = {
  transcript: "The best 3 day itinerary for first timers in Tokyo. Day 1 Synthetic Garden. Day 2 Synthetic Tower. Day 3 Synthetic Market.",
  extraction: {
    title: "3 Days in Tokyo", summary: "A synthetic three-day plan.",
    format: "itinerary", format_evidence: "3 day itinerary for first timers in Tokyo", trip_days: 3,
    destination_city: "Tokyo", destination_country: null,
    stops: [
      stop("Synthetic Garden", 1), stop("Synthetic Tower", 2), stop("Synthetic Market", 3),
    ],
  },
};
const placesVideo: Video = {
  transcript: "Top 3 must visit spots in Tokyo: Synthetic Garden, Synthetic Tower and Synthetic Market.",
  extraction: {
    title: "Top 3 spots", summary: null, format: "places", format_evidence: null, trip_days: null,
    destination_city: "Tokyo", destination_country: null,
    stops: [stop("Synthetic Garden", null), stop("Synthetic Tower", null), stop("Synthetic Market", null)],
  },
};
function stop(name: string, day: number | null) {
  return { name, area_hint: null, category: "attraction", activity: null, tip: null, recommended_dish: null,
    timestamp_seconds: null, excerpt: name, day_number: day };
}

let video: Video;
let placesFailOnce: boolean;
const itineraryBodies: string[] = [];
const completed = (text: string) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });

const calls = vi.fn<typeof fetch>(async (url, init) => {
  const target = String(url);
  const body = typeof init?.body === "string" ? init.body : "";
  if (target.startsWith("https://generativelanguage.googleapis.com/")) {
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
      status: "ok", audio: { transcript: video.transcript, language: "en" },
      visual_observations: [{ timestamp_seconds: 1, visible_text: ["DAY 1"], description: "Title card", uncertainties: [] }],
      uncertainties: [],
    }) }] } }] });
  }
  if (target === "https://api.openai.com/v1/responses") {
    if (body.includes("itinerary_proposal")) {
      itineraryBodies.push(body);
      const input = JSON.parse(JSON.parse(body).input[1].content);
      const dates: string[] = input.dates.map((d: { date: string }) => d.date);
      return completed(JSON.stringify({ seasonalAdvice: null, days: dates.map((date, index) => ({ date, stops:
        input.places.filter((p: { sourceDay: number | null }) => (p.sourceDay ?? 1) === index + 1)
          .map((p: { placeId: string }) => ({ kind: "place", referenceId: p.placeId, start: "10:00", durationMinutes: 90 })) })) }));
    }
    return completed(JSON.stringify(video.extraction));
  }
  if (target === "https://places.googleapis.com/v1/places:searchText") {
    if (placesFailOnce) { placesFailOnce = false; return new Response("synthetic bad request", { status: 400 }); }
    const query = String(JSON.parse(body).textQuery);
    const name = ["Synthetic Garden", "Synthetic Tower", "Synthetic Market"].find((known) => query.includes(known)) ?? query;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
    return Response.json({ places: [{ id: `synthetic-${slug}`, displayName: { text: name },
      formattedAddress: "Synthetic address, Tokyo", location: { latitude: 35.68, longitude: 139.76 } }] });
  }
  throw new Error(`Unexpected external request in offline test: ${target}`);
});
vi.stubGlobal("fetch", calls);

const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createAccountReel, keepReelAsIdeas } = await import("../../apps/web/src/server/services/account-reels");
const { runAccountReelJob } = await import("../../apps/web/src/server/jobs/account-reel");
const { runJob } = await import("../../apps/web/src/server/jobs/queue");
const trips = await import("../../apps/web/src/server/services/trips");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const shares = await import("../../apps/web/src/server/services/shares");

let user: Awaited<ReturnType<typeof devSignIn>>["user"];
let counter = 0;
const url = () => `https://www.youtube.com/shorts/synthetic${String(++counter).padStart(2, "0")}`;

beforeEach(async () => {
  user = (await devSignIn({ email: `synthetic-drafts-${++counter}@example.test` })).user;
  video = itineraryVideo;
  placesFailOnce = false;
  itineraryBodies.length = 0;
  calls.mockClear();
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

it("turns an itinerary reel into exactly one undated draft trip, even when the job retries", async () => {
  placesFailOnce = true;
  const { reel, job } = await createAccountReel(user, url());
  expect(await runAccountReelJob(job.id)).toBe("retrying");
  expect(await repos().trips.listByOwner(user.id)).toHaveLength(1);

  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(Date.now() + 15_000);
    expect(await runAccountReelJob(job.id)).toBe("succeeded");
  } finally { vi.useRealTimers(); }

  const owned = await repos().trips.listByOwner(user.id);
  expect(owned).toHaveLength(1);
  const draft = Trip.parse(owned[0]);
  expect(draft).toMatchObject({ status: "draft", startDate: null, endDate: null, timezone: "Asia/Tokyo",
    destination: "Tokyo", title: "3 Days in Tokyo", draft: { sourceReelId: reel.id, tripDays: 3 } });
  expect(await repos().accountReels.get(reel.id)).toMatchObject({ status: "ready", format: "itinerary", tripId: draft.id, placeIds: [] });
  expect((await repos().accountReels.listPlacesByOwner(user.id))).toEqual([]);

  const saved = await places.listPlaces(user, draft.id);
  expect(saved.map((p) => [p.name, p.status, p.evidence.map((e) => e.sourceDay)])).toEqual([
    ["Synthetic Garden", "pending", [1]], ["Synthetic Tower", "pending", [2]], ["Synthetic Market", "pending", [3]],
  ]);
  const [save] = await inspirations.listInspirations(user, draft.id);
  expect(save).toMatchObject({ sourceType: "link", url: reel.url, status: "needs_confirmation" });
});

it("keeps a list of places as account ideas without a trip", async () => {
  video = placesVideo;
  const { reel, job } = await createAccountReel(user, url());
  expect(await runAccountReelJob(job.id)).toBe("succeeded");
  expect(await repos().trips.listByOwner(user.id)).toEqual([]);
  expect(await repos().accountReels.get(reel.id)).toMatchObject({ status: "ready", tripId: null });
  // The source names only Tokyo; the supported-destination list files it under Japan, citing the city.
  expect((await repos().accountReels.listPlacesByOwner(user.id)).map((p) => [p.name, p.country, p.mappingStatus, p.options[0]?.address])).toEqual([
    ["Synthetic Garden", { code: "JP", excerpt: "Tokyo" }, "pending", "Synthetic address, Tokyo"],
    ["Synthetic Tower", { code: "JP", excerpt: "Tokyo" }, "pending", "Synthetic address, Tokyo"],
    ["Synthetic Market", { code: "JP", excerpt: "Tokyo" }, "pending", "Synthetic address, Tokyo"],
  ]);
});

it("leaves a city outside the supported list, with no named country, in Unknown country", async () => {
  video = { transcript: "Top 3 spots in Lisbon: Synthetic Garden, Synthetic Tower and Synthetic Market.",
    extraction: { ...placesVideo.extraction, destination_city: "Lisbon" } };
  const { job } = await createAccountReel(user, url());
  expect(await runAccountReelJob(job.id)).toBe("succeeded");
  expect((await repos().accountReels.listPlacesByOwner(user.id)).map((p) => p.country)).toEqual([null, null, null]);
  expect(calls.mock.calls.filter(([u]) => String(u).includes("places:searchText"))).toHaveLength(0);
});

it("plans a draft only after dates are added, using the video's days as hints", async () => {
  const { job } = await createAccountReel(user, url());
  await runAccountReelJob(job.id);
  const [draft] = await repos().trips.listByOwner(user.id);
  const tripId = draft!.id;

  await expect(itinerary.generateItinerary(user, tripId, { expectedVersion: null })).rejects.toMatchObject({ code: "INVALID_STATE" });
  await expect(shares.createShare(user, tripId, "http://localhost")).rejects.toMatchObject({ code: "INVALID_STATE" });
  await expect(trips.createReservation(user, tripId, { title: "Dinner", start: "2026-11-02T19:00", end: "2026-11-02T20:00", placeId: null, note: null } as never))
    .rejects.toMatchObject({ code: "INVALID_STATE" });
  await expect(trips.updateTrip(user, tripId, { startDate: "2026-11-02" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(await trips.updateTrip(user, tripId, { title: "Renamed draft" })).toMatchObject({ status: "draft", title: "Renamed draft" });

  const planned = await trips.updateTrip(user, tripId, { startDate: "2026-11-02", endDate: "2026-11-04" });
  expect(planned).toMatchObject({ status: "planned", startDate: "2026-11-02", endDate: "2026-11-04", timezone: "Asia/Tokyo" });

  for (const place of await places.listPlaces(user, tripId)) {
    await places.confirmPlace(user, tripId, place.id, { providerPlaceId: place.options[0]!.providerPlaceId });
  }
  const plan = await itinerary.generateItinerary(user, tripId, { expectedVersion: null });
  const sent = JSON.parse(JSON.parse(itineraryBodies[0]!).input[1].content);
  expect(sent.places.map((p: { title: string; sourceDay: number }) => [p.title, p.sourceDay]).sort())
    .toEqual([["Synthetic Garden", 1], ["Synthetic Market", 3], ["Synthetic Tower", 2]]);
  const names = new Map((await places.listPlaces(user, tripId)).map((p) => [p.id, p.name]));
  expect(plan.days.map((day) => day.stops.filter((s) => s.placeId).map((s) => names.get(s.placeId!))))
    .toEqual([["Synthetic Garden"], ["Synthetic Tower"], ["Synthetic Market"]]);

  await expect(keepReelAsIdeas(user, (await repos().accountReels.listByOwner(user.id))[0]!.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
});

it("undoes an automatic draft by keeping its places as account ideas", async () => {
  const { reel, job } = await createAccountReel(user, url());
  await runAccountReelJob(job.id);
  const result = await keepReelAsIdeas(user, reel.id);
  expect(result.reel).toMatchObject({ tripId: null, format: "places" });
  expect(result.places.map((p) => p.name)).toEqual(["Synthetic Garden", "Synthetic Tower", "Synthetic Market"]);
  expect(result.places.map((p) => p.country?.code)).toEqual(["JP", "JP", "JP"]);
  expect(await repos().trips.listByOwner(user.id)).toEqual([]);
  expect(await repos().accountReels.listPlacesByOwner(user.id)).toHaveLength(3);
});

it("never creates a trip for an itinerary reel saved inside an existing trip, but keeps day hints", async () => {
  const trip = await trips.createTrip(user, { title: "Existing", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-11-02", endDate: "2026-11-04" });
  const { job } = await inspirations.createInspiration(user, trip.id, { sourceType: "link", url: url() });
  expect(await runJob(job.id)).toBe("succeeded");
  expect(await repos().trips.listByOwner(user.id)).toHaveLength(1);
  expect((await places.listPlaces(user, trip.id)).map((p) => p.evidence[0]!.sourceDay)).toEqual([1, 2, 3]);
});

it("reads trips saved before drafts existed as planned", () => {
  const { status: _status, draft: _draft, ...legacy } = {
    id: "trip_legacy", ownerId: "user_legacy", title: "Legacy", destination: "Tokyo", status: "planned", draft: null,
    timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-02", coverAssetId: null,
    preferences: { pace: "balanced", dayStart: "09:00", dayEnd: "21:00", transport: "transit", breakMinutes: 60, budget: null,
      interests: [], mustVisitPlaceIds: [], accommodations: [] },
    currentItineraryVersion: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
  expect(Trip.parse(legacy)).toMatchObject({ status: "planned", draft: null });
  expect(Trip.safeParse({ ...legacy, startDate: null }).success).toBe(false);
  expect(Trip.safeParse({ ...legacy, status: "draft", startDate: null, endDate: null, timezone: null }).success).toBe(true);
});

it("caps Places lookups at 20 per saved video and keeps later stops unverified", async () => {
  const names = Array.from({ length: 22 }, (_, i) => `Synthetic Garden ${i + 1}`);
  video = { transcript: placesVideo.transcript, extraction: { ...placesVideo.extraction, stops: names.map((name) => stop(name, null)) } };
  const trip = await trips.createTrip(user, { title: "Capped", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-11-02", endDate: "2026-11-03" });
  const { job } = await inspirations.createInspiration(user, trip.id, { sourceType: "link", url: url() });
  expect(await runJob(job.id)).toBe("succeeded");
  expect(calls.mock.calls.filter(([u]) => String(u).includes("places:searchText"))).toHaveLength(20);
  const statuses = (await places.listPlaces(user, trip.id)).map((p) => p.status);
  expect(statuses.filter((s) => s === "unverified")).toHaveLength(2);
  expect(statuses).not.toContain("not_found");
});

it("keeps an itinerary for an unsupported country as place ideas, with the country for the library", async () => {
  video = {
    transcript: "My 3 day itinerary in Rome, Italy. Day 1 Synthetic Garden. Day 2 Synthetic Tower. Day 3 Synthetic Market.",
    extraction: { ...itineraryVideo.extraction, title: "3 Days in Rome", format_evidence: "3 day itinerary in Rome",
      destination_city: "Rome", destination_country: "Italy" },
  };
  const { reel, job } = await createAccountReel(user, url());
  expect(await runAccountReelJob(job.id)).toBe("succeeded");
  expect(await repos().trips.listByOwner(user.id)).toEqual([]);
  expect(await repos().accountReels.get(reel.id)).toMatchObject({ status: "ready", format: "itinerary", tripId: null });
  const ideas = await repos().accountReels.listPlacesByOwner(user.id);
  expect(ideas.map((p) => [p.name, p.country?.code, p.mappingStatus])).toEqual([
    ["Synthetic Garden", "IT", "pending"], ["Synthetic Tower", "IT", "pending"], ["Synthetic Market", "IT", "pending"],
  ]);
  expect(calls.mock.calls.filter(([u]) => String(u).includes("places:searchText"))).toHaveLength(3);
});

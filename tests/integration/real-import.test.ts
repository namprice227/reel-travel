import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { toPlannablePlace } from "@reel/planner";
import type { PlaceClue } from "@reel/ai";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-real-import-"));
vi.stubEnv("REEL_DATA_DIR", dataDir); vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("PLACES_PROVIDER", "none");
for (const name of ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_PLACES_API_KEY"]) vi.stubEnv(name, "synthetic-test-key");
const { processImport } = await import("../../apps/web/src/server/jobs/import-inspiration");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const trips = await import("../../apps/web/src/server/services/trips");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const { repos } = await import("../../apps/web/src/server/db");
let user = (await devSignIn({ email: "synthetic-google@example.test" })).user;
const transcript = "Visit Synthetic Cafe in Shibuya. Later visit Synthetic Cafe again. Another Synthetic Cafe in Ginza.";
let tripId: string;
let clues: unknown;
let googleResults: unknown[];
let lookupFails = false;
const googleMatch = (id = "synthetic-google-id") => ({ id, displayName: { text: "Synthetic Cafe Shibuya" },
  formattedAddress: "Synthetic address", location: { latitude: 35.66, longitude: 139.70 }, primaryType: "cafe" });
const calls = vi.fn<typeof fetch>(async (url, init) => {
  if (url === "https://ytplaylistlength.one/api/calculate") return Response.json({ success: true, results: [{
    id: "jTOfOew316s", videoCount: 1, fetchedVideoCount: 1, consideredCount: 1, unavailableCount: 0,
    isTruncated: false, rangeStart: 1, rangeEnd: 1, totalSeconds: 60,
    videos: [{ id: "jTOfOew316s", durationSeconds: 60, considered: true }],
  }] });
  if (String(url).startsWith("https://generativelanguage.googleapis.com/")) return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ status: "ok", transcript, language: "English" }) }] } }] });
  if (url === "https://api.openai.com/v1/responses") {
    const passages = JSON.parse(JSON.parse(init!.body as string).input[1].content).passages as { id: number; text: string }[];
    const referenced = (clues as PlaceClue[]).map(({excerpt, ...clue}) => ({ ...clue, sourcePassage: passages.find(p => excerpt && p.text.includes(excerpt))?.id ?? -1 }));
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ clues: referenced }) }] }] });
  }
  if (url === "https://places.googleapis.com/v1/places:searchText")
    return lookupFails ? new Response("Synthetic unavailable provider", { status: 503 }) : Response.json({ places: googleResults });
  throw new Error("Unexpected external request in offline test");
});
vi.stubGlobal("fetch", calls);
beforeEach(async () => {
  // Each extraction scenario has its own user quota; these tests call the pipeline directly.
  user = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  calls.mockClear();
  vi.stubEnv("PLACES_PROVIDER", "none");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "synthetic-test-key");
  googleResults = [googleMatch()]; lookupFails = false;
  clues = [{ query: "Synthetic Cafe", hint: "Shibuya", excerpt: "Visit Synthetic Cafe in Shibuya." }];
  tripId = (await trips.createTrip(user, { title: "Synthetic provider test", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" })).id;
});

it("restores transcript -> extraction -> Google matches -> explicit confirmation -> planning", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google");
  const saved = await save();
  const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate).toMatchObject({ status: "pending", selected: null, evidence: [{ inspirationId: saved.id, hint: "Shibuya", excerpt: "Visit Synthetic Cafe in Shibuya." }],
    options: [{ providerPlaceId: "synthetic-google-id", location: { lat: 35.66, lng: 139.70 }, details: { provider: "google", openingHours: { status: "unknown" } } }] });
  expect(toPlannablePlace(candidate!)).toBeNull();
  const googleCall = calls.mock.calls.find(([url]) => String(url).includes("places.googleapis.com"))!;
  expect(JSON.parse(googleCall[1]!.body as string).textQuery).toBe("Synthetic Cafe Shibuya Tokyo");
  const { place } = await places.confirmPlace(user, tripId, candidate!.id, { providerPlaceId: "synthetic-google-id" });
  expect(toPlannablePlace(place)).not.toBeNull();
  expect((await repos().inspirations.get(saved.id))?.status).toBe("ready");
  const plan = await itinerary.generateItinerary(user, tripId, { expectedVersion: null });
  expect(plan.days.flatMap(day => day.stops).some(stop => stop.placeId === place.id)).toBe(true);
  expect(plan.validationStatus).toBe("partially_checked");
});

it("keeps multiple Google branches ambiguous until a returned option is selected", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google");
  googleResults = [googleMatch("branch-one"), googleMatch("branch-two")];
  await save();
  const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate).toMatchObject({ status: "ambiguous", selected: null });
  expect(candidate!.options).toHaveLength(2);
  expect(toPlannablePlace(candidate!)).toBeNull();
  await expect(places.confirmPlace(user, tripId, candidate!.id, { providerPlaceId: "invented" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect((await places.confirmPlace(user, tripId, candidate!.id, { providerPlaceId: "branch-two" })).place.selected?.providerPlaceId).toBe("branch-two");
});

it("distinguishes an empty search from disabled lookup", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google"); googleResults = [];
  await save();
  expect((await places.listPlaces(user, tripId))[0]).toMatchObject({ status: "not_found", options: [], selected: null });
});

it("upgrades an existing extraction when the source is submitted again, preserving both sources", async () => {
  const first = await save();
  const [before] = await places.listPlaces(user, tripId);
  vi.stubEnv("PLACES_PROVIDER", "google");
  const second = await save();
  const candidates = await places.listPlaces(user, tripId);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({ id: before!.id, status: "pending", selected: null });
  expect(candidates[0]!.evidence.map(e => e.inspirationId)).toEqual([first.id, second.id]);
});

it("upgrades no-match recovery and never replaces a confirmed selection on another import attempt", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google"); googleResults = [];
  const saved = await save();
  googleResults = [googleMatch()];
  await processImport(saved.id);
  const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate!.status).toBe("pending");
  const { place } = await places.confirmPlace(user, tripId, candidate!.id, { providerPlaceId: "synthetic-google-id" });
  googleResults = [googleMatch("changed-result")];
  await processImport(saved.id);
  expect((await places.listPlaces(user, tripId))[0]!.selected).toEqual(place.selected);
});

it("looks up repeated query/hints once while preserving distinct evidence passages", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google");
  clues = [...clues as PlaceClue[], { query: "Synthetic Cafe", hint: "Shibuya", excerpt: "Later visit Synthetic Cafe again." }];
  await save();
  expect(calls.mock.calls.filter(([url]) => String(url).includes("places.googleapis.com"))).toHaveLength(1);
  const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate!.evidence[0]!.excerpt).toContain("Later visit Synthetic Cafe again.");
});

it("a Places failure is retryable and never becomes a guessed match or an empty successful search", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google"); lookupFails = true;
  await expect(save()).rejects.toMatchObject({ code: "LOOKUP_ERROR" });
  expect(await places.listPlaces(user, tripId)).toEqual([]);
});

it("missing Places credentials do not send a Places request", async () => {
  vi.stubEnv("PLACES_PROVIDER", "google"); vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  await expect(save()).rejects.toMatchObject({ code: "API_KEY_MISSING" });
  expect(calls.mock.calls.some(([url]) => String(url).includes("places.googleapis.com"))).toBe(false);
});

it("real extraction cannot silently use fictional or misspelled lookup providers", async () => {
  for (const provider of ["fake", "gooogle"]) {
    vi.stubEnv("PLACES_PROVIDER", provider);
    await expect(save()).rejects.toThrow(/PLACES_PROVIDER/);
  }
  expect(calls).not.toHaveBeenCalled();
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(dataDir, { recursive: true, force: true }); });
async function save() {
  const { inspiration } = await inspirations.createInspiration(user, tripId, { sourceType: "link", url: "https://www.youtube.com/watch?v=jTOfOew316s" });
  await processImport(inspiration.id);
  return inspiration;
}
it("runs YouTube -> OpenAI -> persisted unverified candidates without Google or invented facts", async () => {
  const saved = await save();
  const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate).toMatchObject({ status: "unverified", name: "Synthetic Cafe", options: [], selected: null,
    evidence: [{ inspirationId: saved.id, sourceType: "link", hint: "Shibuya", excerpt: "Visit Synthetic Cafe in Shibuya." }] });
  expect(toPlannablePlace(candidate!)).toBeNull();
  await processImport(saved.id);
  expect(await places.listPlaces(user, tripId)).toHaveLength(1);
  await expect(places.confirmPlace(user, tripId, candidate!.id, { providerPlaceId: "invented-id" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  expect((await repos().inspirations.get(saved.id))?.status).toBe("needs_confirmation");
  expect(calls.mock.calls.some(([url]) => String(url).includes("generativelanguage"))).toBe(true);
  expect(calls.mock.calls.some(([url]) => String(url).includes("places.googleapis.com"))).toBe(false);
});
it("merges matching extracted names and hints across saves and retains both sources", async () => {
  const first = await save(); const second = await save();
  const result = await places.listPlaces(user, tripId);
  expect(result).toHaveLength(1);
  expect(result[0]!.status).toBe("unverified");
  expect(result[0]!.evidence.map(e => e.inspirationId)).toEqual([first.id, second.id]);
});
it("retains repeated evidence excerpts without creating another candidate", async () => {
  clues = [...clues as PlaceClue[], { query: "Synthetic Cafe", hint: "Shibuya", excerpt: "Later visit Synthetic Cafe again." }];
  await save(); const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate!.evidence).toHaveLength(1);
  expect(candidate!.evidence[0]!.excerpt).toContain("Later visit Synthetic Cafe again.");
});
it("rejecting an unverified candidate resolves the save without making it plannable", async () => {
  const saved = await save();
  const [candidate] = await places.listPlaces(user, tripId);
  const rejected = await places.rejectPlace(user, tripId, candidate!.id);
  expect(toPlannablePlace(rejected)).toBeNull();
  expect((await repos().inspirations.get(saved.id))?.status).toBe("ready");
});
it("different source hints across saves remain separate", async () => {
  await save();
  clues = [{ query: "Synthetic Cafe", hint: "Ginza", excerpt: "Another Synthetic Cafe in Ginza." }];
  await save();
  expect(await places.listPlaces(user, tripId)).toHaveLength(2);
});
it("empty clues ask for more input and never look up places", async () => {
  clues = []; const saved = await save();
  expect(await places.listPlaces(user, tripId)).toEqual([]);
  expect((await repos().inspirations.get(saved.id))?.failureCode).toBe("NO_PLACES_FOUND");
  expect(calls.mock.calls.some(([url]) => String(url).includes("places.googleapis.com"))).toBe(false);
});
it("malformed extraction cannot persist candidates", async () => {
  clues = [{ query: "Bad output" }];
  await expect(save()).rejects.toMatchObject({ code: "MALFORMED_OUTPUT" });
  expect(await places.listPlaces(user, tripId)).toEqual([]);
});

it("keeps explicit distinct areas separate even when neither has a match", async () => {
  clues = [...clues as PlaceClue[], { query: "Synthetic Cafe", hint: "Ginza", excerpt: "Another Synthetic Cafe in Ginza." }];
  await save();
  const candidates = await places.listPlaces(user, tripId);
  expect(candidates).toHaveLength(2);
  expect(candidates.map(p => p.evidence[0]!.clue).sort()).toEqual(["Synthetic Cafe (Ginza)", "Synthetic Cafe (Shibuya)"]);
});

it("missing location context stays null and forged evidence is rejected", async () => {
  clues = [{ query: "Synthetic Cafe", hint: null, excerpt: "Synthetic Cafe" }];
  await save();
  expect((await places.listPlaces(user, tripId))[0]!.evidence[0]!.hint).toBeNull();
  clues = [{ query: "Invented Cafe", hint: "Tokyo", excerpt: "A quote absent from the transcript" }];
  await expect(save()).rejects.toMatchObject({ code: "MALFORMED_OUTPUT" });
  expect(await places.listPlaces(user, tripId)).toHaveLength(1);
});

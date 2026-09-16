import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { toPlannablePlace } from "@reel/planner";
import type { PlaceClue } from "@reel/ai";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-real-import-"));
vi.stubEnv("REEL_DATA_DIR", dataDir); vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("PLACES_PROVIDER", "google");
for (const name of ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_PLACES_API_KEY"]) vi.stubEnv(name, "synthetic-test-key");
const { processImport } = await import("../../apps/web/src/server/jobs/import-inspiration");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const trips = await import("../../apps/web/src/server/services/trips");
const itinerary = await import("../../apps/web/src/server/services/itinerary");
const shares = await import("../../apps/web/src/server/services/shares");
const { repos } = await import("../../apps/web/src/server/db");
const user = (await devSignIn({ email: "synthetic-google@example.test" })).user;
const transcript = "Visit Synthetic Cafe in Shibuya. Later visit Synthetic Cafe again. Another Synthetic Cafe in Ginza.";
let tripId: string;
let clues: unknown;
let branches: number;
const calls = vi.fn<typeof fetch>(async url => {
  if (String(url).startsWith("https://generativelanguage.googleapis.com/")) return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ status: "ok", transcript, language: "English" }) }] } }] });
  if (url === "https://api.openai.com/v1/responses") return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ clues }) }] }] });
  if (url === "https://places.googleapis.com/v1/places:searchText") return Response.json({ places: Array.from({ length: branches }, (_, i) => ({ id: `synthetic-provider-${i}`, displayName: { text: `Synthetic Cafe branch ${i}` }, location: { latitude: 35 + i / 100, longitude: 139 } })) });
  throw new Error("Unexpected external request in offline test");
});
vi.stubGlobal("fetch", calls);
beforeEach(async () => {
  calls.mockClear(); branches = 2;
  clues = [{ query: "Synthetic Cafe", hint: "Shibuya", excerpt: "Visit Synthetic Cafe in Shibuya." }];
  tripId = (await trips.createTrip(user, { title: "Synthetic provider test", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" })).id;
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(dataDir, { recursive: true, force: true }); });
async function save() {
  const { inspiration } = await inspirations.createInspiration(user, tripId, { sourceType: "link", url: "https://www.youtube.com/watch?v=jTOfOew316s" });
  await processImport(inspiration.id);
  return inspiration;
}
it("runs mocked YouTube -> OpenAI -> Google -> persistence -> explicit confirmation -> planner", async () => {
  const save1 = await save();
  const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate).toMatchObject({ status: "ambiguous", selected: null, evidence: [{ inspirationId: save1.id, sourceType: "link", excerpt: "Visit Synthetic Cafe in Shibuya." }] });
  expect(candidate!.options).toHaveLength(2);
  expect(toPlannablePlace(candidate!)).toBeNull();
  await processImport(save1.id);
  expect(await places.listPlaces(user, tripId)).toHaveLength(1);
  const confirmed = await places.confirmPlace(user, tripId, candidate!.id, { providerPlaceId: "synthetic-provider-1" });
  expect(toPlannablePlace(confirmed.place)).toMatchObject({ location: { lat: 35.01, lng: 139 }, sourceInspirationIds: [save1.id], openingHours: { status: "unknown" } });
  expect((await repos().inspirations.get(save1.id))?.status).toBe("ready");
  expect(calls.mock.calls.some(([url]) => String(url).includes("generativelanguage"))).toBe(true);
  const plan = await itinerary.generateItinerary(user, tripId, { expectedVersion: null });
  expect(plan.days.flatMap(d => d.stops).some(stop => stop.placeId === confirmed.place.id)).toBe(true);
  const { token } = await shares.createShare(user, tripId, "http://localhost:3000");
  const shared = await shares.getSharedView(token);
  expect(shared.places[0]).toMatchObject({ provider: "google", attribution: "Google Maps" });
  expect(JSON.stringify(shared)).not.toContain("Visit Synthetic Cafe in Shibuya.");
});
it("merges matching provider IDs across saves and retains both sources", async () => {
  branches = 1; const first = await save(); const second = await save();
  const result = await places.listPlaces(user, tripId);
  expect(result).toHaveLength(1);
  expect(result[0]!.status).toBe("pending");
  expect(result[0]!.evidence.map(e => e.inspirationId)).toEqual([first.id, second.id]);
});
it("retains repeated evidence excerpts without creating another candidate", async () => {
  branches = 1;
  clues = [...clues as PlaceClue[], { query: "Synthetic Cafe", hint: "Shibuya", excerpt: "Later visit Synthetic Cafe again." }];
  await save(); const [candidate] = await places.listPlaces(user, tripId);
  expect(candidate!.evidence).toHaveLength(1);
  expect(candidate!.evidence[0]!.excerpt).toContain("Later visit Synthetic Cafe again.");
});
it("keeps zero matches unresolved", async () => {
  branches = 0; await save();
  expect((await places.listPlaces(user, tripId))[0]).toMatchObject({ status: "not_found", options: [], selected: null });
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
  branches = 0;
  clues = [...clues as PlaceClue[], { query: "Synthetic Cafe", hint: "Ginza", excerpt: "Another Synthetic Cafe in Ginza." }];
  await save();
  const candidates = await places.listPlaces(user, tripId);
  expect(candidates).toHaveLength(2);
  expect(candidates.map(p => p.evidence[0]!.clue).sort()).toEqual(["Synthetic Cafe (Ginza)", "Synthetic Cafe (Shibuya)"]);
});

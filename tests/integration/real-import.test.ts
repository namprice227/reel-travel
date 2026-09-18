import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { toPlannablePlace } from "@reel/planner";
import type { PlaceClue } from "@reel/ai";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-real-import-"));
vi.stubEnv("REEL_DATA_DIR", dataDir); vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("PLACES_PROVIDER", "google");
for (const name of ["OPENAI_API_KEY", "GOOGLE_AI_API_KEY"]) vi.stubEnv(name, "synthetic-test-key");
const { processImport } = await import("../../apps/web/src/server/jobs/import-inspiration");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const inspirations = await import("../../apps/web/src/server/services/inspirations");
const places = await import("../../apps/web/src/server/services/places");
const trips = await import("../../apps/web/src/server/services/trips");
const { repos } = await import("../../apps/web/src/server/db");
const user = (await devSignIn({ email: "synthetic-google@example.test" })).user;
const transcript = "Visit Synthetic Cafe in Shibuya. Later visit Synthetic Cafe again. Another Synthetic Cafe in Ginza.";
let tripId: string;
let clues: unknown;
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
  throw new Error("Unexpected external request in offline test");
});
vi.stubGlobal("fetch", calls);
beforeEach(async () => {
  calls.mockClear();
  clues = [{ query: "Synthetic Cafe", hint: "Shibuya", excerpt: "Visit Synthetic Cafe in Shibuya." }];
  tripId = (await trips.createTrip(user, { title: "Synthetic provider test", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" })).id;
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

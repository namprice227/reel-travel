import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { placeFixtures } from "@reel/contracts/fixtures";
import type { User } from "@reel/contracts";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../../apps/web/src/server/itinerary-provider", () => ({ itineraryProvider: () => ({ id: "synthetic-provider", generate }) }));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-itinerary-ai-"));
vi.stubEnv("REEL_DATA_DIR", dir); vi.stubEnv("DATA_BACKEND", "file");
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip, updateTrip } = await import("../../apps/web/src/server/services/trips");
const { generateItinerary, getItinerary } = await import("../../apps/web/src/server/services/itinerary");
let user: User, tripId: string;
vi.mock("../../apps/web/src/server/auth/session", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../apps/web/src/server/auth/session")>(), requireUser: async () => user,
}));
const { dispatch } = await import("../../apps/web/src/server/http/router");
const { createApiClient } = await import("../../apps/web/src/lib/api-client");
beforeEach(async () => {
  generate.mockReset();
  user = (await devSignIn({ email: `ai-plan-${crypto.randomUUID()}@example.test` })).user;
  const trip = await createTrip(user, { title: "Synthetic AI trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-01" });
  tripId = trip.id;
  await updateTrip(user, tripId, { preferences: { dayStart: "10:00", dayEnd: "18:00", interests: ["museum"], breakMinutes: 0 } });
  await repos().places.insert({ ...placeFixtures.confirmed, tripId });
  await repos().places.insert({ ...placeFixtures.confirmed, status: "pending", selected: null, id: "pending-other", tripId });
  generate.mockImplementation(async () => ({ model: "fixture", usage: { inputTokens: 10, outputTokens: 5 },
    proposal: { days: [{ date: "2026-10-01", stops: [{ kind: "place", referenceId: placeFixtures.confirmed.id, start: "10:00" }] }] } }));
});
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }); });
it("loads saved input, excludes unconfirmed places and persists a checked immutable version", async () => {
  const plan = await generateItinerary(user, tripId, { expectedVersion: null });
  const request = generate.mock.calls[0]![0];
  expect(request.input.preferences).toMatchObject({ dayStart: "10:00", dayEnd: "18:00", interests: ["museum"] });
  expect(request.input.places.map((p: { placeId: string }) => p.placeId)).toEqual([placeFixtures.confirmed.id]);
  expect(plan.generation?.provider).toBe("synthetic-provider");
  expect((await getItinerary(user, tripId)).itinerary).toEqual(plan);
});
it("does not change the saved version after provider failure or invalid output", async () => {
  const plan = await generateItinerary(user, tripId, { expectedVersion: null });
  generate.mockRejectedValueOnce(Error("PRIVATE_KEY"));
  await expect(generateItinerary(user, tripId, { expectedVersion: 1 })).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  generate.mockResolvedValue({ model: "test", usage: { inputTokens: null, outputTokens: null }, proposal: { days: [] } });
  await expect(generateItinerary(user, tripId, { expectedVersion: 1 })).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  expect((await getItinerary(user, tripId)).itinerary).toEqual(plan);
});
it("rejects changed trip input during a model call without saving", async () => {
  const original = generate.getMockImplementation()!;
  generate.mockImplementationOnce(async () => { await updateTrip(user, tripId, { preferences: { dayStart: "11:00" } }); return original(); });
  await expect(generateItinerary(user, tripId, { expectedVersion: null })).rejects.toMatchObject({ code: "STALE_TRIP" });
  expect((await getItinerary(user, tripId)).itinerary).toBeNull();
});
it("checks ownership and stale versions before paid work", async () => {
  const other = (await devSignIn({ email: `other-${crypto.randomUUID()}@example.test` })).user;
  await expect(generateItinerary(other, tripId, { expectedVersion: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(generateItinerary(user, tripId, { expectedVersion: 1 })).rejects.toMatchObject({ code: "STALE_VERSION" });
  expect(generate).not.toHaveBeenCalled();
});
it.each([["minute", 3, 60_000], ["day", 20, 86_400_000]] as const)("enforces shared %s quota before calling the provider", async (period, limit, windowMs) => {
  for (let i = 0; i < limit; i++) await repos().rateLimits.consume(`itinerary-${period}:${user.id}`, { limit, windowMs, now: Date.now() });
  await expect(generateItinerary(user, tripId, { expectedVersion: null })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(generate).not.toHaveBeenCalled();
});

it("repairs an invalid first proposal before saving one version", async () => {
  generate.mockResolvedValueOnce({ model: "fixture", usage: { inputTokens: 20, outputTokens: 10 },
    proposal: { days: [{ date: "2026-10-01", stops: [{ kind: "place", referenceId: placeFixtures.confirmed.id, start: "09:00" }] }] } });
  const plan = await generateItinerary(user, tripId, { expectedVersion: null });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(plan.version).toBe(1);
  expect(plan.generation).toMatchObject({ attempts: 2, inputTokens: 30, outputTokens: 15 });
  expect((await getItinerary(user, tripId)).itinerary).toEqual(plan);
});
it("checks changed inputs after repair and keeps the previous itinerary", async () => {
  const saved = await generateItinerary(user, tripId, { expectedVersion: null });
  const original = generate.getMockImplementation()!;
  generate.mockResolvedValueOnce({ model: "test", usage: { inputTokens: 1, outputTokens: 1 }, proposal: { days: [] } });
  generate.mockImplementationOnce(async () => { await updateTrip(user, tripId, { preferences: { dayEnd: "17:00" } }); return original(); });
  await expect(generateItinerary(user, tripId, { expectedVersion: 1 })).rejects.toMatchObject({ code: "STALE_TRIP" });
  expect((await getItinerary(user, tripId)).itinerary).toEqual(saved);
});
it("generates a destination-only trip with labeled suggestions and no automatic place confirmation", async () => {
  const trip = await createTrip(user, { title: "Synthetic sparse trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-01" });
  generate.mockResolvedValue({ model: "fixture", usage: { inputTokens: 10, outputTokens: 5 }, proposal: {
    days: [{ date: "2026-10-01", stops: [{ kind: "suggestion", referenceId: null, start: "10:00", durationMinutes: 120,
      title: "Explore the neighbourhood", area: "Tokyo", reason: "A gentle first outing." }] }], seasonalAdvice: null,
  } });
  const plan = await generateItinerary(user, trip.id, { expectedVersion: null });
  expect(plan.validationStatus).toBe("partially_checked");
  expect(plan.days[0]!.stops[0]?.kind).toBe("suggestion");
  expect(await repos().places.listByTrip(trip.id)).toEqual([]);
});

it("passes the frontend generation request through HTTP validation and repairs a duplicate without resending places", async () => {
  const valid = generate.getMockImplementation()!;
  generate.mockImplementationOnce(async () => {
    const response = await valid();
    response.proposal.days[0].stops.push({ kind: "place", referenceId: placeFixtures.confirmed.id, start: "12:00" });
    return response;
  });
  const transport = vi.fn<typeof fetch>(async (url, init) => dispatch(new Request(String(url), init)));
  const client = createApiClient({ baseUrl: "http://localhost:3000", fetch: transport });
  const response = await client("itinerary.generate", { params: { tripId }, body: { expectedVersion: null } });
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0]!;
  expect(url).toBe(`http://localhost:3000/api/trips/${tripId}/itinerary/generate`);
  expect(init).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
  expect(JSON.parse(init!.body as string)).toEqual({ expectedVersion: null });
  expect(generate).toHaveBeenCalledTimes(2);
  const repair = generate.mock.calls[1]![0].repair;
  expect(repair.issues.join()).toContain(`PLACE_DUPLICATE (${placeFixtures.confirmed.id})`);
  expect(repair.issues.join()).toContain("2026-10-01 at 10:00");
  expect(repair.issues.join()).toContain("2026-10-01 at 12:00");
  expect(response.itinerary).toMatchObject({ version: 1, generation: { attempts: 2 } });
});
it("returns precise repeated-place errors to the frontend and preserves the saved version", async () => {
  const saved = await generateItinerary(user, tripId, { expectedVersion: null });
  const valid = generate.getMockImplementation()!;
  generate.mockImplementation(async () => {
    const response = await valid();
    response.proposal.days[0].stops.push({ kind: "place", referenceId: placeFixtures.confirmed.id, start: "12:00" });
    return response;
  });
  const client = createApiClient({ baseUrl: "http://localhost:3000", fetch: async (url, init) => dispatch(new Request(String(url), init)) });
  await expect(client("itinerary.generate", { params: { tripId }, body: { expectedVersion: 1 } })).rejects.toMatchObject({
    status: 502, code: "GENERATION_FAILED", message: expect.stringContaining("appears twice"),
    details: { issues: expect.arrayContaining([expect.stringContaining("PLACE_DUPLICATE")]) },
  });
  expect((await getItinerary(user, tripId)).itinerary).toEqual(saved);
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import type { CandidatePlace, User } from "@reel/contracts";
import { placeFixtures } from "@reel/contracts/fixtures";
const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../../apps/web/src/server/providers", () => ({ getPlaceLookup: () => ({ search }) }));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-verify-"));
vi.stubEnv("REEL_DATA_DIR", dataDir); vi.stubEnv("DATA_BACKEND", "file"); vi.stubEnv("PLACES_PROVIDER", "openstreetmap");
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip } = await import("../../apps/web/src/server/services/trips");
const { verifyPlace, listVerificationJobs } = await import("../../apps/web/src/server/services/place-verification");
const { rejectPlace, confirmPlace } = await import("../../apps/web/src/server/services/places");
const { runJob } = await import("../../apps/web/src/server/jobs/queue");
let user: User, place: CandidatePlace;
const option = placeFixtures.confirmed.selected!;
beforeEach(async () => {
  search.mockReset().mockResolvedValue([option]);
  user = (await devSignIn({ email: `verify-${crypto.randomUUID()}@example.test` })).user;
  const trip = await createTrip(user, { title: "Synthetic verification", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  place = { ...placeFixtures.confirmed, id: `place_${crypto.randomUUID().replaceAll("-", "")}`, tripId: trip.id,
    name: "Synthetic clue", status: "unverified", options: [], selected: null };
  await repos().places.insert(place);
});
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(dataDir, { recursive: true, force: true }); });

it.each([0, 1, 2])("searches only the saved clue; %i results keep confirmation explicit", async count => {
  const options = Array.from({ length: count }, (_, i) => ({ ...option, providerPlaceId: `synthetic-${i}` }));
  search.mockResolvedValue(options);
  const { job } = await verifyPlace(user, place.tripId, place.id);
  expect(job).toMatchObject({ kind: "verify_place", status: "queued", maxAttempts: 1 });
  expect(await runJob(job.id)).toBe("succeeded");
  expect(search).toHaveBeenCalledExactlyOnceWith({ query: place.evidence[0]!.clue, hint: place.evidence[0]!.hint ?? null, excerpt: null }, { destination: "Tokyo" });
  expect(await repos().places.get(place.id)).toMatchObject({ id: place.id, evidence: place.evidence, selected: null,
    status: count === 0 ? "not_found" : count === 1 ? "pending" : "ambiguous", options });
  expect((await listVerificationJobs(user, place.tripId))[0]?.status).toBe("succeeded");
  if (count === 1) expect((await confirmPlace(user, place.tripId, place.id, { providerPlaceId: options[0]!.providerPlaceId })).place.status).toBe("confirmed");
});

it("reuses one job for concurrent/double submissions and claims once", async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => verifyPlace(user, place.tripId, place.id)));
  expect(new Set(results.map(r => r.job.id)).size).toBe(1);
  await Promise.all(results.map(r => runJob(r.job.id)));
  expect(search).toHaveBeenCalledOnce();
});

it("denies another owner and wrong trip before queueing or lookup", async () => {
  const other = (await devSignIn({ email: "verification-other@example.test" })).user;
  await expect(verifyPlace(other, place.tripId, place.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(listVerificationJobs(other, place.tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(verifyPlace(user, place.tripId, "place_missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await repos().jobs.listByTrip(place.tripId)).toEqual([]);
  expect(search).not.toHaveBeenCalled();
});

it("keeps failures unverified with evidence, sanitized errors and explicit retry", async () => {
  search.mockRejectedValueOnce(Error("PRIVATE_PROVIDER_PAYLOAD"));
  const first = await verifyPlace(user, place.tripId, place.id);
  expect(await runJob(first.job.id)).toBe("failed");
  expect(await repos().places.get(place.id)).toEqual(place);
  expect((await repos().jobs.get(first.job.id))?.lastError).not.toContain("PRIVATE_PROVIDER");
  expect(await runJob(first.job.id)).toBe("not_run");
  const retry = await verifyPlace(user, place.tripId, place.id);
  expect(retry.job.id).not.toBe(first.job.id);
  expect(await runJob(retry.job.id)).toBe("succeeded");
});

it("does not revive a rejection made while lookup is in flight", async () => {
  search.mockImplementationOnce(async () => { await rejectPlace(user, place.tripId, place.id); return [option]; });
  const { job } = await verifyPlace(user, place.tripId, place.id);
  await runJob(job.id);
  expect(await repos().places.get(place.id)).toMatchObject({ status: "rejected", options: [], evidence: place.evidence });
});

it("does not overwrite evidence appended while lookup is in flight", async () => {
  search.mockImplementationOnce(async () => {
    await repos().places.update({ ...place, evidence: [...place.evidence, { ...place.evidence[0]!, clue: "Additional synthetic clue" }] });
    return [option];
  });
  const { job } = await verifyPlace(user, place.tripId, place.id); await runJob(job.id);
  expect(await repos().places.get(place.id)).toMatchObject({ status: "unverified", evidence: [...place.evidence, { ...place.evidence[0]!, clue: "Additional synthetic clue" }] });
});

it("discards a result from an obsolete attempt", async () => {
  const { job } = await verifyPlace(user, place.tripId, place.id);
  search.mockImplementationOnce(async () => {
    await repos().jobs.update({ ...job, status: "running", attempt: 2 }); return [option];
  });
  expect(await runJob(job.id)).toBe("not_run");
  expect(await repos().places.get(place.id)).toEqual(place);
});

it("does not look up candidates rejected while waiting in the queue", async () => {
  const { job } = await verifyPlace(user, place.tripId, place.id);
  await rejectPlace(user, place.tripId, place.id);
  await runJob(job.id); expect(search).not.toHaveBeenCalled();
  await expect(verifyPlace(user, place.tripId, place.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
});

it.each([["minute", 10, 60_000], ["day", 30, 86_400_000]] as const)("enforces the shared account %s limit before inserting work", async (period, limit, windowMs) => {
  for (let i = 0; i < limit; i++) await repos().rateLimits.consume(`verify-${period}:${user.id}`, { now: Date.now(), limit, windowMs });
  await expect(verifyPlace(user, place.tripId, place.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(await repos().jobs.listByTrip(place.tripId)).toEqual([]);
});

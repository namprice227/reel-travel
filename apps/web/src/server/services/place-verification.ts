import type { Job, User } from "@reel/contracts";
import { config } from "../config";
import { repos } from "../db";
import { invalidState } from "../errors";
import { newId } from "../ids";
import { belongsTo, getOwnedTrip } from "./access";
import { enforceRateLimit } from "./rate-limits";

export async function listVerificationJobs(user: User, tripId: string): Promise<Job[]> {
  await getOwnedTrip(user, tripId);
  const latest = new Map<string, Job>();
  for (const job of await repos().jobs.listByTrip(tripId)) {
    if (job.kind !== "verify_place") continue;
    const previous = latest.get(job.targetId);
    if (!previous || previous.createdAt < job.createdAt || ["queued", "running"].includes(job.status)) latest.set(job.targetId, job);
  }
  return [...latest.values()];
}

export async function verifyPlace(user: User, tripId: string, placeId: string): Promise<{ job: Job }> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const place = belongsTo(await r.places.get(placeId), trip, "Place");
  if (place.status !== "unverified") throw invalidState("Only unverified places need this search. Reload to review current matches.");
  if (config.placesProvider === "none") throw invalidState("Location search is not enabled. Contact the trip app administrator.");
  const active = await r.jobs.latestForTarget(place.id);
  if (active && active.kind === "verify_place" && ["queued", "running"].includes(active.status)) return { job: active };
  await enforceRateLimit(`verify-minute:${user.id}`, { limit: 10, windowMs: 60_000 });
  await enforceRateLimit(`verify-day:${user.id}`, { limit: 30, windowMs: 86_400_000 });
  const now = new Date(Math.max(Date.now(), active ? Date.parse(active.createdAt) + 1 : 0)).toISOString();
  const job = await r.jobs.enqueueVerification({ id: newId("job"), tripId, targetId: place.id, kind: "verify_place",
    status: "queued", attempt: 0, maxAttempts: 1, runAfter: now, lastError: null, createdAt: now, updatedAt: now });
  return { job };
}

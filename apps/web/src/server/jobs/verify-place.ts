import type { Job } from "@reel/contracts";
import { repos } from "../db";
import { nowIso } from "../ids";
import { getPlaceLookup } from "../providers";

/** Location lookup only: no source re-download, transcription, extraction or automatic confirmation. */
export async function processPlaceVerification(job: Job): Promise<void> {
  const r = repos();
  const place = await r.places.get(job.targetId);
  if (!place || place.tripId !== job.tripId || place.status !== "unverified") return;
  const trip = await r.trips.get(job.tripId);
  if (!trip) return;
  const lookup = getPlaceLookup();
  if (!lookup) throw Error("Location search is disabled.");
  const evidence = place.evidence[0]!;
  const options = await lookup.search({ query: evidence.clue, hint: evidence.hint ?? null, excerpt: null }, { destination: trip.destination });
  const currentJob = await r.jobs.get(job.id);
  const currentTrip = await r.trips.get(job.tripId);
  if (currentJob?.status !== "running" || currentJob.attempt !== job.attempt) return;
  if (currentTrip?.destination !== trip.destination) throw Error("Trip destination changed during lookup.");
  // One conditional DB write preserves evidence and never revives a rejected/deleted/updated candidate.
  await r.places.updateIfUnchanged({ ...place, options, selected: null,
    status: options.length === 0 ? "not_found" : options.length === 1 ? "pending" : "ambiguous",
    name: options.length === 1 ? options[0]!.name : place.name, updatedAt: nowIso() }, place);
}

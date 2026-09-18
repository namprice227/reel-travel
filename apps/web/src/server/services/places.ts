import type {
  CandidatePlace,
  EndpointBody,
  Evidence,
  InspirationStatus,
  PlaceOption,
  PlaceStatus,
  Trip,
  User,
} from "@reel/contracts";
import { trackServer } from "../analytics";
import { repos } from "../db";
import { invalidState, validationFailed } from "../errors";
import { newId, nowIso } from "../ids";
import { belongsTo, getOwnedTrip } from "./access";

// Candidate places (F2, owner: Member 3). Only confirmPlace() makes a place usable by the planner.

const UNRESOLVED: PlaceStatus[] = ["unverified", "pending", "ambiguous", "not_found"];

export async function listPlaces(user: User, tripId: string, status?: PlaceStatus): Promise<CandidatePlace[]> {
  const trip = await getOwnedTrip(user, tripId);
  const places = await repos().places.listByTrip(trip.id);
  return places.filter((p) => !status || p.status === status).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function confirmPlace(
  user: User,
  tripId: string,
  placeId: string,
  input: EndpointBody<"places.confirm">,
): Promise<{ place: CandidatePlace; mergedPlaceIds: string[] }> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const place = belongsTo(await r.places.get(placeId), trip, "Place");
  if (place.status === "unverified") {
    throw invalidState("This place was extracted from the source and has not been verified. Verification is required before planning.");
  }
  if (place.status === "not_found") {
    throw invalidState("No match was found for this place. Add details to the save, or reject it.");
  }
  const option = place.options.find((o) => o.providerPlaceId === input.providerPlaceId);
  if (!option) {
    throw validationFailed("That option is not one of this place's matches.", [
      { path: "providerPlaceId", message: "Unknown option" },
    ]);
  }

  // Other places that resolve to the same real-world place merge into this one, keeping all evidence.
  const duplicates = (await r.places.listByTrip(trip.id)).filter(
    (p) => p.id !== place.id && p.status !== "rejected" && resolvedProviderId(p) === option.providerPlaceId,
  );
  const evidence = [...place.evidence];
  for (const duplicate of duplicates) {
    for (const item of duplicate.evidence) if (!evidence.some((e) => sameEvidence(e, item))) evidence.push(item);
  }

  const confirmed: CandidatePlace = {
    ...place,
    status: "confirmed",
    name: option.name,
    selected: option,
    evidence,
    updatedAt: nowIso(),
  };
  await r.places.update(confirmed);

  const mergedPlaceIds = duplicates.map((d) => d.id);
  for (const id of mergedPlaceIds) await r.places.delete(id);
  if (mergedPlaceIds.length > 0) await repointPlaceReferences(trip, mergedPlaceIds, confirmed.id);
  await refreshInspirationStatuses(trip.id);

  trackServer("place_confirmed", { options: place.options.length, merged: mergedPlaceIds.length });
  return { place: confirmed, mergedPlaceIds };
}

export async function rejectPlace(user: User, tripId: string, placeId: string): Promise<CandidatePlace> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const place = belongsTo(await r.places.get(placeId), trip, "Place");
  const rejected: CandidatePlace = { ...place, status: "rejected", updatedAt: nowIso() };
  await r.places.update(rejected);
  await refreshInspirationStatuses(trip.id);
  return rejected;
}

/**
 * Called by the import job for each clue. Idempotent: re-running the same save adds nothing,
 * and a clue that resolves to an existing place adds evidence instead of a duplicate.
 * Null options means lookup was not performed; an empty array means lookup found no matches.
 */
export async function upsertCandidate(
  tripId: string,
  query: string,
  options: PlaceOption[] | null,
  evidence: Evidence,
): Promise<string> {
  const r = repos();
  const places = (await r.places.listByTrip(tripId)).filter((p) => p.status !== "rejected");
  const singleId = options?.length === 1 ? options[0]!.providerPlaceId : null;

  const existing =
    places.find((p) => p.evidence.some((e) => sameEvidence(e, evidence))) ??
    (singleId ? places.find((p) => resolvedProviderId(p) === singleId) : undefined) ??
    places.find(
      (p) => p.status !== "confirmed" && p.name.toLowerCase() === query.toLowerCase()
        && (options === null ? p.status === "unverified" && p.evidence.some(e => (e.hint ?? null) === (evidence.hint ?? null)) : sameOptions(p.options, options)),
    );

  if (existing) {
    const prior = existing.evidence.find(e => sameEvidence(e, evidence));
    if (!prior) {
      await r.places.update({ ...existing, evidence: [...existing.evidence, evidence], updatedAt: nowIso() });
    } else if (evidence.excerpt && !(prior.excerpt ?? "").includes(evidence.excerpt)) {
      const excerpt = [prior.excerpt, evidence.excerpt].filter(Boolean).join("\n");
      await r.places.update({ ...existing, evidence: existing.evidence.map(e => e === prior ? { ...e, excerpt } : e), updatedAt: nowIso() });
    }
    return existing.id;
  }

  const now = nowIso();
  const place: CandidatePlace = {
    id: newId("place"),
    tripId,
    status: options === null ? "unverified" : options.length === 0 ? "not_found" : options.length === 1 ? "pending" : "ambiguous",
    name: options?.length === 1 ? options[0]!.name : query,
    evidence: [evidence],
    options: options ?? [],
    selected: null,
    createdAt: now,
    updatedAt: now,
  };
  await r.places.insert(place);
  return place.id;
}

export async function statusFromPlaces(placeIds: string[]): Promise<InspirationStatus> {
  const r = repos();
  for (const id of placeIds) {
    const place = await r.places.get(id);
    if (place && UNRESOLVED.includes(place.status)) return "needs_confirmation";
  }
  return "ready";
}

/** A save is "ready" once every place it produced is confirmed or rejected. */
export async function refreshInspirationStatuses(tripId: string): Promise<void> {
  const r = repos();
  for (const inspiration of await r.inspirations.listByTrip(tripId)) {
    if (inspiration.status !== "needs_confirmation" && inspiration.status !== "ready") continue;
    const status = await statusFromPlaces(inspiration.placeIds);
    if (status !== inspiration.status) await r.inspirations.update({ ...inspiration, status, updatedAt: nowIso() });
  }
}

async function repointPlaceReferences(trip: Trip, fromIds: string[], toId: string): Promise<void> {
  const r = repos();
  const swap = (ids: string[]) => [...new Set(ids.map((id) => (fromIds.includes(id) ? toId : id)))];

  for (const inspiration of await r.inspirations.listByTrip(trip.id)) {
    if (inspiration.placeIds.some((id) => fromIds.includes(id))) {
      await r.inspirations.update({ ...inspiration, placeIds: swap(inspiration.placeIds), updatedAt: nowIso() });
    }
  }
  for (const reservation of await r.reservations.listByTrip(trip.id)) {
    if (reservation.placeId && fromIds.includes(reservation.placeId)) {
      await r.reservations.update({ ...reservation, placeId: toId, updatedAt: nowIso() });
    }
  }
  const latestTrip = await r.trips.get(trip.id);
  if (latestTrip && latestTrip.preferences.mustVisitPlaceIds.some((id) => fromIds.includes(id))) {
    await r.trips.update({
      ...latestTrip,
      preferences: { ...latestTrip.preferences, mustVisitPlaceIds: swap(latestTrip.preferences.mustVisitPlaceIds) },
      updatedAt: nowIso(),
    }, latestTrip);
  }
}

const resolvedProviderId = (p: CandidatePlace) =>
  p.selected?.providerPlaceId ?? (p.options.length === 1 ? p.options[0]!.providerPlaceId : null);

const sameEvidence = (a: Evidence, b: Evidence) =>
  a.inspirationId === b.inspirationId && a.clue.toLowerCase() === b.clue.toLowerCase() && (a.hint ?? null) === (b.hint ?? null);

const sameOptions = (a: PlaceOption[], b: PlaceOption[]) =>
  a.map((o) => o.providerPlaceId).sort().join("|") === b.map((o) => o.providerPlaceId).sort().join("|");

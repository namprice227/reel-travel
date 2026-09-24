import type {
  AccountPlace,
  AccountReel,
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
import { AppError, invalidState, notFound, validationFailed } from "../errors";
import { newId, nowIso } from "../ids";
import { belongsTo, getOwnedTrip } from "./access";
import { newInspiration } from "./inspirations";
import { enforceRateLimit } from "./rate-limits";
import { getPlaceLookup } from "../providers";

// Candidate places (F2, owner: Member 3). Route selection can use provider options without confirming a branch.

const UNRESOLVED: PlaceStatus[] = ["unverified", "pending", "ambiguous", "not_found"];

export async function listPlaces(user: User, tripId: string, status?: PlaceStatus): Promise<CandidatePlace[]> {
  const trip = await getOwnedTrip(user, tripId);
  const places = await repos().places.listByTrip(trip.id);
  return places.filter((p) => !status || p.status === status).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** One owner-scoped update records intent; provider options are chosen later for routing. */
export async function selectPlaces(user: User, tripId: string, input: EndpointBody<"places.select">): Promise<Trip> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== trip.updatedAt) {
    throw new AppError("STALE_TRIP", "Trip details changed. Reload your places and try again.");
  }
  const ids = [...new Set(input.placeIds)];
  const places = new Map((await r.places.listByTrip(trip.id)).map((place) => [place.id, place]));
  const issues = ids.flatMap((id, index) => {
    const place = places.get(id);
    return place && place.status !== "rejected" ? [] : [{ path: `placeIds.${index}`, message: "Place is unavailable in this trip" }];
  });
  if (issues.length) throw validationFailed("Choose places from this trip.", issues);
  if (JSON.stringify(ids) === JSON.stringify(trip.selectedPlaceIds)) return trip;
  const updated = await r.trips.update({ ...trip, selectedPlaceIds: ids, updatedAt: nowIso() }, trip);
  trackServer("places_selected", { placeCount: ids.length });
  return updated;
}

/** Saved place ideas the traveler can reuse, across every trip they own. */
export async function listSavedPlaces(user: User): Promise<CandidatePlace[]> {
  const r = repos();
  const [trips, accountPlaces] = await Promise.all([
    r.trips.listByOwner(user.id),
    r.accountReels.listPlacesByOwner(user.id),
  ]);
  const accountPlaceIds = new Set(accountPlaces.map((place) => place.id));
  const groups = await Promise.all(trips.map((trip) => r.places.listByTrip(trip.id)));
  const byOrigin = new Map<string, CandidatePlace>();
  for (const place of groups.flat()) {
    if (place.status === "rejected") continue;
    // The account-level original is loaded separately by the picker. Keep a surviving trip copy reusable
    // only after its original account reel has been deleted.
    if (place.copiedFromAccountPlaceId && accountPlaceIds.has(place.copiedFromAccountPlaceId)) continue;
    const originId = place.copiedFromAccountPlaceId ?? place.copiedFromPlaceId ?? place.id;
    const prior = byOrigin.get(originId);
    // If an original trip was deleted, a surviving copy still represents this saved idea.
    if (!prior || (prior.copiedFromPlaceId && !place.copiedFromPlaceId)) byOrigin.set(originId, place);
  }
  return [...byOrigin.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePlace(user: User, tripId: string, placeId: string): Promise<void> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  belongsTo(await r.places.get(placeId), trip, "Place");
  const now = nowIso();
  const selected = trip.selectedPlaceIds?.filter((id) => id !== placeId);
  const mustVisit = trip.preferences.mustVisitPlaceIds.filter((id) => id !== placeId);
  if (selected?.length !== trip.selectedPlaceIds?.length || mustVisit.length !== trip.preferences.mustVisitPlaceIds.length) {
    await r.trips.update({
      ...trip,
      ...(selected ? { selectedPlaceIds: selected } : {}),
      preferences: { ...trip.preferences, mustVisitPlaceIds: mustVisit },
      updatedAt: now,
    }, trip);
  }
  for (const booking of await r.reservations.listByTrip(trip.id)) {
    if (booking.placeId === placeId) await r.reservations.update({ ...booking, placeId: null, updatedAt: now });
  }
  const remaining = new Map((await r.places.listByTrip(trip.id)).filter((item) => item.id !== placeId).map((item) => [item.id, item]));
  for (const source of await r.inspirations.listByTrip(trip.id)) {
    if (source.placeIds.includes(placeId)) {
      const placeIds = source.placeIds.filter((id) => id !== placeId);
      const status = source.status === "needs_confirmation" || source.status === "ready"
        ? placeIds.some((id) => { const match = remaining.get(id); return match && UNRESOLVED.includes(match.status); })
          ? "needs_confirmation" : "ready"
        : source.status;
      await r.inspirations.update({ ...source, placeIds, status, updatedAt: now });
    }
  }
  await r.places.delete(placeId);
}

/**
 * Reuse saved candidates or account-reel ideas in a trip. Account places gain a trip-owned source record
 * so their evidence remains openable even if the account reel is later deleted.
 */
export async function copyPlacesToTrip(
  user: User,
  tripId: string,
  input: EndpointBody<"places.copy">,
): Promise<CandidatePlace[]> {
  const r = repos();
  const target = await getOwnedTrip(user, tripId);
  const ownedTripIds = new Set((await r.trips.listByOwner(user.id)).map((trip) => trip.id));
  const sourceIds = [...new Set(input.placeIds ?? [])];
  const accountSourceIds = [...new Set(input.accountPlaceIds ?? [])];
  const sources: CandidatePlace[] = [];
  const accountSources: Array<{ place: AccountPlace; reel: AccountReel }> = [];

  // Authorize and validate every source before writing any copies.
  for (const placeId of sourceIds) {
    const source = await r.places.get(placeId);
    if (!source) throw notFound("Place");
    if (!ownedTripIds.has(source.tripId)) throw notFound("Place");
    if (source.status === "rejected") {
      throw invalidState("Rejected places cannot be added to another trip.");
    }
    sources.push(source);
  }
  const ownedAccountPlaces = new Map((await r.accountReels.listPlacesByOwner(user.id)).map((place) => [place.id, place]));
  const reels = new Map<string, AccountReel>();
  for (const placeId of accountSourceIds) {
    const place = ownedAccountPlaces.get(placeId);
    if (!place) throw notFound("Place");
    let reel = reels.get(place.reelId);
    if (!reel) {
      const stored = await r.accountReels.get(place.reelId);
      if (!stored || stored.ownerId !== user.id) throw notFound("Reel");
      reel = stored;
      reels.set(reel.id, reel);
    }
    if (reel.tripId) throw invalidState("Places from an itinerary reel already belong to its draft trip.");
    accountSources.push({ place, reel });
  }

  const targetPlaces = await r.places.listByTrip(target.id);
  const copied: CandidatePlace[] = [];
  for (const source of sources) {
    const selected = source.selected;
    if (source.tripId === target.id) { copied.push(source); continue; }
    const originalId = source.copiedFromPlaceId ?? source.id;
    const providerPlaceId = selected?.providerPlaceId ?? null;
    const existing = targetPlaces.find((place) =>
      place.status !== "rejected" && (place.copiedFromPlaceId === originalId ||
        (providerPlaceId !== null && resolvedProviderId(place) === providerPlaceId)),
    );
    if (existing?.id === source.id) {
      copied.push(existing);
      continue;
    }

    const now = nowIso();
    if (existing) {
      const evidence = [...existing.evidence];
      for (const item of source.evidence) if (!evidence.some((prior) => sameEvidence(prior, item))) evidence.push(item);
      const options = [...existing.options];
      for (const option of source.options) {
        if (!options.some((prior) => prior.providerPlaceId === option.providerPlaceId)) options.push(option);
      }
      const merged: CandidatePlace = {
        ...existing,
        status: selected ? "confirmed" : existing.status,
        name: selected?.name ?? existing.name,
        evidence,
        options,
        selected: selected ?? existing.selected,
        copiedFromPlaceId: existing.copiedFromPlaceId ?? originalId,
        updatedAt: now,
      };
      await r.places.update(merged);
      targetPlaces[targetPlaces.indexOf(existing)] = merged;
      copied.push(merged);
      continue;
    }

    const clone: CandidatePlace = {
      ...source,
      id: newId("place"),
      tripId: target.id,
      copiedFromPlaceId: originalId,
      createdAt: now,
      updatedAt: now,
    };
    await r.places.insert(clone);
    targetPlaces.push(clone);
    copied.push(clone);
  }

  const targetInspirations = await r.inspirations.listByTrip(target.id);
  for (const { place: source, reel } of accountSources) {
    const existingCopy = targetPlaces.find((place) =>
      place.status !== "rejected" && place.copiedFromAccountPlaceId === source.id,
    );
    if (existingCopy) {
      copied.push(existingCopy);
      continue;
    }

    let inspiration = targetInspirations.find((item) => item.sourceAccountReelId === reel.id);
    if (!inspiration) {
      inspiration = {
        ...newInspiration(target.id, "link", { url: reel.url }),
        sourceAccountReelId: reel.id,
        details: reel.details,
        status: "needs_confirmation",
        attempts: reel.attempts,
      };
      await r.inspirations.insert(inspiration);
      targetInspirations.push(inspiration);
    }

    const evidence: Evidence = {
      inspirationId: inspiration.id,
      sourceType: "link",
      clue: source.name,
      hint: source.area,
      classification: {
        source: "ai",
        country: source.country,
        category: accountSourceCategory(source),
      },
      excerpt: source.excerpt,
      extractedAt: source.createdAt,
    };
    const copiedId = await upsertCandidate(
      target.id,
      source.name,
      source.mappingStatus === "unverified" ? null : source.options,
      evidence,
    );
    let candidate = await r.places.get(copiedId);
    if (!candidate) throw notFound("Place");
    if (!candidate.copiedFromAccountPlaceId) {
      candidate = { ...candidate, copiedFromAccountPlaceId: source.id, updatedAt: nowIso() };
      await r.places.update(candidate);
    }
    targetPlaces.push(candidate);
    copied.push(candidate);

    if (!inspiration.placeIds.includes(candidate.id)) {
      inspiration = {
        ...inspiration,
        placeIds: [...inspiration.placeIds, candidate.id],
        updatedAt: nowIso(),
      };
      await r.inspirations.update(inspiration);
      targetInspirations[targetInspirations.findIndex((item) => item.id === inspiration!.id)] = inspiration;
    }
  }

  await refreshInspirationStatuses(target.id);
  return [...new Map(copied.map((place) => [place.id, place])).values()];
}

/** Provider candidates for a typed name near the trip's destination. Nothing is saved. */
export async function searchTripPlaces(user: User, tripId: string, query: string): Promise<PlaceOption[]> {
  const trip = await getOwnedTrip(user, tripId);
  const lookup = getPlaceLookup();
  if (!lookup) throw invalidState("Place search isn't set up here. Add places from your saves instead.");
  await enforceRateLimit(`place-search-minute:${user.id}`, { limit: 20, windowMs: 60_000 });
  await enforceRateLimit(`place-search-day:${user.id}`, { limit: 200, windowMs: 86_400_000 });
  const results = await lookup.search({ query: query.trim(), hint: null, excerpt: null }, { destination: trip.destination });
  return results.slice(0, 10);
}

/**
 * Save a search result the traveler picked as a confirmed trip place. The search is repeated so the client
 * cannot supply provider facts, and the query is kept as a text save so the place has source evidence.
 */
export async function addPlaceFromSearch(user: User, tripId: string, query: string, providerPlaceId: string): Promise<CandidatePlace> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const option = (await searchTripPlaces(user, trip.id, query)).find((result) => result.providerPlaceId === providerPlaceId);
  if (!option) throw new AppError("NOT_FOUND", "That search result is no longer available. Search again.");
  const text = query.trim();
  const inspiration = { ...newInspiration(trip.id, "text", { text: `Place search: ${text}` }), status: "ready" as const };
  await r.inspirations.insert(inspiration);
  const evidence: Evidence = { inspirationId: inspiration.id, sourceType: "text", clue: text, hint: null, excerpt: text, extractedAt: nowIso() };
  const placeId = await upsertCandidate(trip.id, text, [option], evidence);
  await r.inspirations.update({ ...inspiration, placeIds: [placeId], updatedAt: nowIso() });
  const { place } = await confirmPlace(user, trip.id, placeId, { providerPlaceId });
  return place;
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
    name: place.customName ?? option.name,
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

/** The traveler's own name for a place, or null to go back to the provider's (or the clue's) name. */
export async function renamePlace(user: User, tripId: string, placeId: string, customName: string | null): Promise<CandidatePlace> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const place = belongsTo(await r.places.get(placeId), trip, "Place");
  const label = customName?.trim() || null;
  const { customName: _previous, ...rest } = place;
  const renamed: CandidatePlace = {
    ...rest,
    ...(label ? { customName: label } : {}),
    name: label ?? place.selected?.name ?? (place.options.length === 1 ? place.options[0]!.name : place.evidence[0]!.clue),
    updatedAt: nowIso(),
  };
  await r.places.update(renamed);
  return renamed;
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
        && (options === null || p.status === "unverified"
          ? p.status === "unverified" && p.evidence.some(e => (e.hint ?? null) === (evidence.hint ?? null))
          : sameOptions(p.options, options)),
    );

  if (existing) {
    // A repeated save or recovered import may now have provider results. Upgrade only unresolved
    // extractions/no-match records; never replace a user's confirmed selection or downgrade to no lookup.
    const verified = options !== null && (existing.status === "unverified" || existing.status === "not_found")
      ? { ...existing, options, status: options.length === 0 ? "not_found" as const : options.length === 1 ? "pending" as const : "ambiguous" as const,
        name: options.length === 1 ? options[0]!.name : query, selected: null }
      : existing;
    const prior = existing.evidence.find(e => sameEvidence(e, evidence));
    if (!prior) {
      await r.places.update({ ...verified, evidence: [...existing.evidence, evidence], updatedAt: nowIso() });
    } else if ((evidence.excerpt && !(prior.excerpt ?? "").includes(evidence.excerpt))
      || (evidence.classification && JSON.stringify(evidence.classification) !== JSON.stringify(prior.classification))) {
      const excerpt = evidence.excerpt && !(prior.excerpt ?? "").includes(evidence.excerpt)
        ? [prior.excerpt, evidence.excerpt].filter(Boolean).join("\n") : prior.excerpt;
      await r.places.update({ ...verified, evidence: existing.evidence.map(e => e === prior
        ? { ...e, excerpt, ...(evidence.classification ? { classification: evidence.classification } : {}) } : e), updatedAt: nowIso() });
    } else if (verified !== existing) {
      await r.places.update({ ...verified, updatedAt: nowIso() });
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
  if (latestTrip && (latestTrip.preferences.mustVisitPlaceIds.some((id) => fromIds.includes(id)) || latestTrip.selectedPlaceIds?.some((id) => fromIds.includes(id)))) {
    await r.trips.update({
      ...latestTrip,
      preferences: { ...latestTrip.preferences, mustVisitPlaceIds: swap(latestTrip.preferences.mustVisitPlaceIds) },
      ...(latestTrip.selectedPlaceIds ? { selectedPlaceIds: swap(latestTrip.selectedPlaceIds) } : {}),
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

function accountSourceCategory(place: AccountPlace): NonNullable<Evidence["classification"]>["category"] {
  const raw = place.category?.trim();
  if (!raw) return null;
  const value = /cafe|coffee|restaurant|food|bar|bakery|dessert|ramen|noodle|market/i.test(raw)
    ? "food" as const
    : /museum|temple|shrine|attraction|viewpoint|landmark|park|garden|beach|mountain|trail/i.test(raw)
      ? "attraction" as const
      : "other" as const;
  return { value, excerpt: place.excerpt ?? raw };
}

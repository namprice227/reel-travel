import type { PlaceLookup } from "@reel/ai";
import { AccountPlace, countryCodeFromName, countryName, supportedCountry, type AccountReel, type AccountReelJob, type User } from "@reel/contracts";
import { assetStorage, repos } from "../db";
import { invalidState, notFound } from "../errors";
import { newId, nowIso } from "../ids";
import { IMPORT_REQUEST_LIMIT } from "../jobs/import-limits";
import { getProviders } from "../providers";
import { enforceRateLimit } from "./rate-limits";

export async function listAccountReels(user: User) {
  const r = repos();
  const [reels, places] = await Promise.all([
    r.accountReels.listByOwner(user.id),
    r.accountReels.listPlacesByOwner(user.id),
  ]);
  return {
    reels: reels.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // File-backed development data may predate provider mapping; contract defaults keep it readable.
    places: places.map((place) => AccountPlace.parse(place)),
  };
}

export async function createAccountReel(user: User, url: string): Promise<{ reel: AccountReel; job: AccountReelJob }> {
  await enforceRateLimit(`import-request:${user.id}`, IMPORT_REQUEST_LIMIT);
  const now = nowIso();
  // Keep unsupported social URLs as recoverable sources. The worker sets SOURCE_INACCESSIBLE.
  const reel: AccountReel = {
    id: newId("reel"), ownerId: user.id, url, details: null,
    status: "queued", failureCode: null, failureMessage: null, attempts: 0,
    placeIds: [], format: null, tripId: null, createdAt: now, updatedAt: now,
  };
  const job: AccountReelJob = {
    id: newId("reeljob"), ownerId: user.id, targetId: reel.id,
    status: "queued", attempt: 0, maxAttempts: 3, runAfter: now,
    lastError: null, createdAt: now, updatedAt: now,
  };
  return repos().accountReels.submit(reel, job);
}

export async function addAccountReelDetails(user: User, reelId: string, text: string) {
  await enforceRateLimit(`import-request:${user.id}`, IMPORT_REQUEST_LIMIT);
  const now = nowIso();
  const job: AccountReelJob = {
    id: newId("reeljob"), ownerId: user.id, targetId: reelId,
    status: "queued", attempt: 0, maxAttempts: 3, runAfter: now,
    lastError: null, createdAt: now, updatedAt: now,
  };
  return repos().accountReels.recover(reelId, user.id, text, job);
}

/** One-time repair for account places extracted before automatic provider mapping was enabled. */
export async function mapAccountReelPlaces(user: User, reelId: string): Promise<AccountPlace[]> {
  const r = repos();
  const reel = await r.accountReels.get(reelId);
  if (!reel || reel.ownerId !== user.id) throw notFound("Reel");
  if (reel.tripId) throw invalidState("Places attached to a draft trip are mapped through the trip workflow.");
  const places = (await r.accountReels.listPlacesByOwner(user.id))
    .filter((place) => place.reelId === reel.id)
    .map((place) => AccountPlace.parse(place));
  const eligible = places.filter((place) =>
    place.country && place.mappingStatus === "unverified" && place.options.length === 0,
  );
  if (!eligible.length) return places;
  const lookup = getProviders().lookup;
  if (!lookup) throw invalidState("Place mapping is not configured.");
  const mapped = await mapAccountPlaceStops(eligible.map((place) => ({
    name: place.name,
    area_hint: place.area,
    category: place.category,
    excerpt: place.excerpt,
    country: place.country,
  })), lookup);
  const changedAt = nowIso();
  const updates = eligible.map((place, index) => ({
    ...place,
    mappingStatus: mapped[index]!.mappingStatus ?? "unverified",
    options: mapped[index]!.options ?? [],
    updatedAt: changedAt,
  }));
  await r.accountReels.updatePlaces(reel.id, user.id, updates);
  const byId = new Map(updates.map((place) => [place.id, place]));
  return places.map((place) => byId.get(place.id) ?? place);
}

/**
 * Undo an automatic draft: the traveler wanted ideas, not a trip. Only a still-draft trip converts; its
 * candidate places become account ideas and retain their automatic provider matches.
 */
export async function keepReelAsIdeas(user: User, reelId: string): Promise<{ reel: AccountReel; places: AccountPlace[] }> {
  const r = repos();
  const reel = await r.accountReels.get(reelId);
  if (!reel || reel.ownerId !== user.id) throw notFound("Reel");
  const trip = reel.tripId ? await r.trips.get(reel.tripId) : null;
  if (!trip || trip.ownerId !== user.id || trip.status !== "draft") {
    throw invalidState("Only a draft trip that has not been planned can become place ideas.");
  }
  const candidates = (await r.places.listByTrip(trip.id)).filter((place) => place.status !== "rejected");
  const places = accountPlacesFromStops(reel, candidates.map((place) => {
    const evidence = place.evidence[0];
    return {
      name: place.name,
      area_hint: evidence?.hint ?? /\(([^()]+)\)$/.exec(evidence?.clue ?? "")?.[1] ?? null,
      category: null,
      excerpt: evidence?.excerpt ?? null,
      // Draft trips exist only for supported destinations, so the trip's destination names its country.
      country: evidence?.classification?.country ?? reelCountry({ city: trip.destination, country: trip.destination }),
      mappingStatus: place.status === "pending" || place.status === "ambiguous" || place.status === "not_found"
        ? place.status : "unverified",
      options: place.options,
    };
  }));
  const assets = await r.assets.listByTrip(trip.id);
  const updated = await r.accountReels.convertDraftToIdeas(reel.id, user.id, places, nowIso());
  const cleanup = await Promise.allSettled(assets.map((asset) => assetStorage().remove(asset.id)));
  if (cleanup.some((result) => result.status === "rejected")) console.warn("[draft-to-ideas] Some private upload bytes require orphan cleanup.");
  return { reel: updated, places };
}

export async function deleteAccountReel(user: User, reelId: string) {
  await repos().accountReels.deleteByOwner(reelId, user.id);
}

export type AccountPlaceStop = {
  name: string;
  area_hint: string | null;
  category: string | null;
  excerpt: string | null;
  country?: AccountPlace["country"];
  mappingStatus?: AccountPlace["mappingStatus"];
  options?: AccountPlace["options"];
};

/**
 * Look up account ideas only when the source supports a country. The returned provider options are candidates,
 * not a selected branch; missing country evidence stays unverified instead of making a global guess.
 */
export async function mapAccountPlaceStops(stops: AccountPlaceStop[], lookup: PlaceLookup | null): Promise<AccountPlaceStop[]> {
  let searches = 0;
  const matches = new Map<string, AccountPlace["options"]>();
  const mapped: AccountPlaceStop[] = [];
  for (const stop of stops) {
    if (!lookup || !stop.country) {
      mapped.push({ ...stop, mappingStatus: "unverified", options: [] });
      continue;
    }
    const key = JSON.stringify([
      stop.name.trim().toLocaleLowerCase("en"),
      stop.area_hint?.trim().toLocaleLowerCase("en") ?? null,
      stop.country.code,
    ]);
    let options = matches.get(key);
    if (!options) {
      if (lookup.maxClues !== undefined && searches >= lookup.maxClues) {
        mapped.push({ ...stop, mappingStatus: "unverified", options: [] });
        continue;
      }
      searches += 1;
      options = await lookup.search(
        { query: stop.name, hint: stop.area_hint, excerpt: stop.excerpt },
        { destination: countryName(stop.country.code) },
      );
      matches.set(key, options);
    }
    mapped.push({
      ...stop,
      mappingStatus: options.length === 0 ? "not_found" : options.length === 1 ? "pending" : "ambiguous",
      options,
    });
  }
  return mapped;
}

/** Account ideas never carry trip IDs or a provider-selected branch. */
export function accountPlacesFromStops(reel: AccountReel, stops: Array<{
  name: string; area_hint: string | null; category: string | null; excerpt: string | null;
  country?: AccountPlace["country"];
  mappingStatus?: AccountPlace["mappingStatus"];
  options?: AccountPlace["options"];
}>): AccountPlace[] {
  const now = nowIso();
  const seen = new Set<string>();
  return stops.flatMap((stop) => {
    const key = JSON.stringify([
      stop.name.toLocaleLowerCase("en"),
      stop.area_hint?.toLocaleLowerCase("en") ?? null,
      stop.country?.code ?? null,
    ]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: newId("accountplace"), ownerId: reel.ownerId, reelId: reel.id,
      name: stop.name, area: stop.area_hint, category: stop.category, excerpt: stop.excerpt,
      country: stop.country ?? null,
      mappingStatus: stop.mappingStatus ?? "unverified",
      options: stop.options ?? [],
      createdAt: now, updatedAt: now,
    }];
  });
}

/**
 * Library country for a whole reel from its source-checked destination: the named country, or else the supported
 * country whose curated city list contains the named city (e.g. "Osaka" -> Japan). The city is the evidence.
 * Other cities stay unknown; nothing is inferred from model knowledge.
 */
export function reelCountry(destination: { city: string | null; country: string | null }): AccountPlace["country"] {
  const named = destination.country ? sourceCountry(destination.country) : null;
  if (named) return named;
  const supported = supportedCountry(destination.city, null);
  const code = supported ? countryCodeFromName(supported.name) : null;
  return code && destination.city ? { code, excerpt: destination.city.trim() } : null;
}

/** A model proposal becomes a Library country only after the extraction path proved the name occurs in the source. */
export function sourceCountry(sourceName: string): AccountPlace["country"] {
  const code = countryCodeFromName(sourceName);
  return code ? { code, excerpt: sourceName.trim() } : null;
}

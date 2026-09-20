import { SharedTripView, type Share, type User } from "@reel/contracts";
import { planFingerprint } from "@reel/planner";
import { trackServer } from "../analytics";
import { repos, type ShareRecord } from "../db";
import { AppError, notFound } from "../errors";
import { hashToken, newId, newToken, nowIso } from "../ids";
import { belongsTo, getOwnedTrip } from "./access";
import { currentItinerary, plannerContextFor } from "./itinerary";
import { enforceRateLimit, SHARE_CREATE_LIMIT, SHARE_VIEW_LIMIT } from "./rate-limits";

// Read-only viewing links (F6, owner: Member 4). Viewers get a projection built here,
// never owner rows: no saves, uploads, evidence or edit handles.

export async function listShares(user: User, tripId: string): Promise<Share[]> {
  const trip = await getOwnedTrip(user, tripId);
  const records = await repos().shares.listByTrip(trip.id);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toShare);
}

export async function createShare(user: User, tripId: string, origin: string) {
  const trip = await getOwnedTrip(user, tripId);
  await enforceRateLimit(`share-create:${user.id}`, SHARE_CREATE_LIMIT);
  const token = newToken();
  const record: ShareRecord = {
    id: newId("share"),
    tripId: trip.id,
    createdAt: nowIso(),
    revokedAt: null,
    lastViewedAt: null,
    tokenHash: hashToken(token),
  };
  await repos().shares.insert(record);
  trackServer("share_created");
  return { share: toShare(record), token, url: `${origin}/s/${token}` };
}

export async function revokeShare(user: User, tripId: string, shareId: string): Promise<Share> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  let record = belongsTo(await r.shares.get(shareId), trip, "Viewing link");
  if (!record.revokedAt) {
    const revoked = await r.shares.revoke(record.id, nowIso());
    if (!revoked) throw notFound("Viewing link");
    record = revoked;
    trackServer("share_revoked");
  }
  return toShare(record);
}

export async function getSharedView(token: string): Promise<SharedTripView> {
  const r = repos();
  const record = await r.shares.getByTokenHash(hashToken(token));
  if (!record) throw notFound("Viewing link");
  if (record.revokedAt) throw new AppError("SHARE_REVOKED", "This viewing link was revoked by the trip owner.");
  await enforceRateLimit(`share-view:${record.id}`, SHARE_VIEW_LIMIT);
  const trip = await r.trips.get(record.tripId);
  if (!trip) throw notFound("Viewing link");

  const saved = await currentItinerary(trip);
  const candidates = saved ? await r.places.listByTrip(trip.id) : [];
  const stale = saved !== null && saved.inputFingerprint !== planFingerprint(await plannerContextFor(trip, candidates));
  const itinerary = stale ? null : saved;
  const scheduled = new Set(itinerary?.days.flatMap((d) => d.stops.flatMap((s) => (s.placeId ? [s.placeId] : []))) ?? []);
  const places = candidates.flatMap((p) =>
    p.status === "confirmed" && p.selected && scheduled.has(p.id)
      ? [
          {
            id: p.id,
            name: p.selected.name,
            address: p.selected.address,
            location: p.selected.location,
            category: p.selected.details.category,
            provider: p.selected.details.provider,
            attribution: p.selected.details.attribution,
          },
        ]
      : [],
  );
  const viewed = await r.shares.markViewed(record.id, nowIso());
  if (!viewed) throw notFound("Viewing link");
  if (viewed.revokedAt) throw new AppError("SHARE_REVOKED", "This viewing link was revoked by the trip owner.");

  // Apply the allowlist here as well as at the HTTP boundary: server callers receive only public fields.
  return SharedTripView.parse({
    stale,
    trip: {
      title: trip.title,
      destination: trip.destination,
      timezone: trip.timezone,
      startDate: trip.startDate,
      endDate: trip.endDate,
    },
    itinerary: itinerary && {
      version: itinerary.version,
      createdAt: itinerary.createdAt,
      days: itinerary.days.map((day) => ({
        date: day.date,
        stops: day.stops.map(({ sourceInspirationIds: _private, ...stop }) => stop),
      })),
      conflicts: itinerary.conflicts,
      validationStatus: itinerary.validationStatus,
      assumptions: itinerary.assumptions,
    },
    places,
  });
}

const toShare = ({ tokenHash: _secret, ...share }: ShareRecord): Share => share;

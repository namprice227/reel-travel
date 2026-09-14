import type { Share, SharedTripView, User } from "@reel/contracts";
import { trackServer } from "../analytics";
import { repos, type ShareRecord } from "../db";
import { AppError, notFound } from "../errors";
import { hashToken, newId, newToken, nowIso } from "../ids";
import { belongsTo, getOwnedTrip } from "./access";
import { currentItinerary } from "./itinerary";

// Read-only viewing links (F6, owner: Member 4). Viewers get a projection built here,
// never owner rows: no saves, uploads, evidence or edit handles.

export async function listShares(user: User, tripId: string): Promise<Share[]> {
  const trip = await getOwnedTrip(user, tripId);
  const records = await repos().shares.listByTrip(trip.id);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toShare);
}

export async function createShare(user: User, tripId: string, origin: string) {
  const trip = await getOwnedTrip(user, tripId);
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
    record = { ...record, revokedAt: nowIso() };
    await r.shares.update(record);
    trackServer("share_revoked");
  }
  return toShare(record);
}

export async function getSharedView(token: string): Promise<SharedTripView> {
  const r = repos();
  const record = await r.shares.getByTokenHash(hashToken(token));
  if (!record) throw notFound("Viewing link");
  if (record.revokedAt) throw new AppError("SHARE_REVOKED", "This viewing link was revoked by the trip owner.");
  const trip = await r.trips.get(record.tripId);
  if (!trip) throw notFound("Viewing link");

  const itinerary = await currentItinerary(trip);
  const scheduled = new Set(itinerary?.days.flatMap((d) => d.stops.flatMap((s) => (s.placeId ? [s.placeId] : []))) ?? []);
  const places = (await r.places.listByTrip(trip.id)).flatMap((p) =>
    p.status === "confirmed" && p.selected && scheduled.has(p.id)
      ? [
          {
            id: p.id,
            name: p.selected.name,
            address: p.selected.address,
            location: p.selected.location,
            category: p.selected.details.category,
          },
        ]
      : [],
  );
  await r.shares.update({ ...record, lastViewedAt: nowIso() });

  return {
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
  };
}

const toShare = ({ tokenHash: _secret, ...share }: ShareRecord): Share => share;

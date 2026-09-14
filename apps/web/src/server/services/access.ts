import type { Trip, User } from "@reel/contracts";
import { repos } from "../db";
import { notFound } from "../errors";

/** Every trip-scoped operation starts here. Another account's trip is reported as missing. */
export async function getOwnedTrip(user: User, tripId: string): Promise<Trip> {
  const trip = await repos().trips.get(tripId);
  if (!trip || trip.ownerId !== user.id) throw notFound("Trip");
  return trip;
}

/** A child row (place, save, booking...) must belong to the trip that was authorized. */
export function belongsTo<T extends { tripId: string }>(row: T | null, trip: Trip, what: string): T {
  if (!row || row.tripId !== trip.id) throw notFound(what);
  return row;
}

import {
  defaultTripPreferences,
  MAX_TRIP_DAYS,
  type EndpointBody,
  type Reservation,
  type Trip,
  type User,
} from "@reel/contracts";
import { datesBetween } from "@reel/planner";
import { repos } from "../db";
import { validationFailed } from "../errors";
import { newId, nowIso } from "../ids";
import { belongsTo, getOwnedTrip } from "./access";

// ------------------------------------------------------------------ trips (F3, owner: Member 4)

export async function listTrips(user: User): Promise<Trip[]> {
  const trips = await repos().trips.listByOwner(user.id);
  return trips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTrip(user: User, input: EndpointBody<"trips.create">): Promise<Trip> {
  assertTripDates(input.startDate, input.endDate);
  const now = nowIso();
  const trip: Trip = {
    id: newId("trip"),
    ownerId: user.id,
    ...input,
    preferences: { ...defaultTripPreferences },
    currentItineraryVersion: null,
    createdAt: now,
    updatedAt: now,
  };
  await repos().trips.insert(trip);
  return trip;
}

export const getTrip = getOwnedTrip;

export async function updateTrip(user: User, tripId: string, input: EndpointBody<"trips.update">): Promise<Trip> {
  const trip = await getOwnedTrip(user, tripId);
  const { preferences, ...details } = input;
  const next: Trip = {
    ...trip,
    ...withoutUndefined(details),
    preferences: { ...trip.preferences, ...withoutUndefined(preferences ?? {}) },
    updatedAt: nowIso(),
  };
  assertTripDates(next.startDate, next.endDate);
  if (next.preferences.dayEnd <= next.preferences.dayStart) {
    throw validationFailed("Day end must be after day start.", [{ path: "preferences.dayEnd", message: "Must be after dayStart" }]);
  }
  if (preferences?.mustVisitPlaceIds !== undefined) {
    const confirmed = new Set((await repos().places.listByTrip(trip.id))
      .filter((place) => place.status === "confirmed" && place.selected !== null).map((place) => place.id));
    const issues = preferences.mustVisitPlaceIds.flatMap((id, index) => confirmed.has(id) ? [] : [{
      path: `preferences.mustVisitPlaceIds.${index}`, message: "Must be a confirmed place in this trip",
    }]);
    if (issues.length) throw validationFailed("Must-visit places must be confirmed in this trip.", issues);
    next.preferences.mustVisitPlaceIds = [...new Set(preferences.mustVisitPlaceIds)];
  }
  return repos().trips.update(next);
}

function assertTripDates(startDate: string, endDate: string) {
  if (endDate < startDate) {
    throw validationFailed("The trip must end on or after its start date.", [{ path: "endDate", message: "Before startDate" }]);
  }
  if (datesBetween(startDate, endDate).length > MAX_TRIP_DAYS) {
    throw validationFailed(`Trips can be at most ${MAX_TRIP_DAYS} days.`, [{ path: "endDate", message: `More than ${MAX_TRIP_DAYS} days` }]);
  }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

// ------------------------------------------------------------------ reservations (F3, owner: Member 4)

export async function listReservations(user: User, tripId: string): Promise<Reservation[]> {
  const trip = await getOwnedTrip(user, tripId);
  const reservations = await repos().reservations.listByTrip(trip.id);
  return reservations.sort((a, b) => a.start.localeCompare(b.start));
}

export async function createReservation(
  user: User,
  tripId: string,
  input: EndpointBody<"reservations.create">,
): Promise<Reservation> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  if (input.start.slice(0, 10) !== input.end.slice(0, 10) || input.end <= input.start) {
    throw validationFailed("A booking must end after it starts, on the same day.", [
      { path: "end", message: "Must be later on the same date as start" },
    ]);
  }
  if (input.placeId) {
    const place = await r.places.get(input.placeId);
    if (!place || place.tripId !== trip.id || place.status !== "confirmed") {
      throw validationFailed("placeId must be a confirmed place in this trip.", [
        { path: "placeId", message: "Not a confirmed place in this trip" },
      ]);
    }
  }
  const now = nowIso();
  const reservation: Reservation = {
    id: newId("res"),
    tripId: trip.id,
    title: input.title,
    placeId: input.placeId ?? null,
    start: input.start,
    end: input.end,
    locked: input.locked,
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await r.reservations.insert(reservation);
  return reservation;
}

export async function deleteReservation(user: User, tripId: string, reservationId: string): Promise<void> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  belongsTo(await r.reservations.get(reservationId), trip, "Reservation");
  await r.reservations.delete(reservationId);
}

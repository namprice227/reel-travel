import type { EndpointBody, Itinerary, Trip, User } from "@reel/contracts";
import {
  applyEdit,
  generatePlan,
  planFingerprint,
  PlannerError,
  toPlannablePlace,
  type PlannablePlace,
  type PlannerContext,
  type PlanResult,
} from "@reel/planner";
import { trackServer } from "../analytics";
import { repos } from "../db";
import { AppError, invalidState, notFound, validationFailed } from "../errors";
import { newId, nowIso } from "../ids";
import { getOwnedTrip } from "./access";

// Itinerary versions (F4/F5, owner: Member 4). Scheduling rules live in packages/planner;
// this file loads inputs, enforces expectedVersion and saves immutable versions.

export async function plannerContextFor(trip: Trip): Promise<PlannerContext> {
  const r = repos();
  const places = (await r.places.listByTrip(trip.id))
    .map(toPlannablePlace)
    .filter((p): p is PlannablePlace => p !== null);
  const reservations = (await r.reservations.listByTrip(trip.id)).sort((a, b) => a.start.localeCompare(b.start));
  return { startDate: trip.startDate, endDate: trip.endDate, preferences: trip.preferences, places, reservations };
}

export async function currentItinerary(trip: Trip): Promise<Itinerary | null> {
  if (!trip.currentItineraryVersion) return null;
  return repos().itineraries.getVersion(trip.id, trip.currentItineraryVersion);
}

export async function getItinerary(user: User, tripId: string): Promise<{ itinerary: Itinerary | null; stale: boolean }> {
  const trip = await getOwnedTrip(user, tripId);
  const itinerary = await currentItinerary(trip);
  if (!itinerary) return { itinerary: null, stale: false };
  const stale = itinerary.inputFingerprint !== planFingerprint(await plannerContextFor(trip));
  return { itinerary, stale };
}

export async function generateItinerary(
  user: User,
  tripId: string,
  input: EndpointBody<"itinerary.generate">,
): Promise<Itinerary> {
  const trip = await getOwnedTrip(user, tripId);
  assertExpectedVersion(trip, input.expectedVersion);
  const ctx = await plannerContextFor(trip);
  if (ctx.places.length === 0 && ctx.reservations.length === 0) {
    throw invalidState("Confirm at least one place or add a booking before generating an itinerary.");
  }
  const itinerary = await saveVersion(trip, generatePlan(ctx), "generated", planFingerprint(ctx));
  trackServer("plan_generated", {
    version: itinerary.version,
    days: itinerary.days.length,
    conflicts: itinerary.conflicts.length,
  });
  return itinerary;
}

export async function editItinerary(
  user: User,
  tripId: string,
  input: EndpointBody<"itinerary.edit">,
): Promise<{ itinerary: Itinerary; saved: boolean }> {
  const trip = await getOwnedTrip(user, tripId);
  if (!trip.currentItineraryVersion) throw invalidState("Generate an itinerary before editing it.");
  assertExpectedVersion(trip, input.expectedVersion);
  const current = await currentItinerary(trip);
  if (!current) throw notFound("Itinerary");

  const ctx = await plannerContextFor(trip);
  let outcome: ReturnType<typeof applyEdit>;
  try {
    outcome = applyEdit(current, input.edit, ctx);
  } catch (error) {
    throw toAppError(error);
  }
  if (!outcome.ok) {
    throw new AppError("EDIT_REJECTED", outcome.conflicts[0]?.message ?? "That edit was rejected.", {
      conflicts: outcome.conflicts,
    });
  }
  if (input.dryRun) {
    return { itinerary: { ...current, ...outcome.plan, change: input.edit.type }, saved: false };
  }

  // Edits keep the generation fingerprint: a stale itinerary stays stale until regenerated.
  const itinerary = await saveVersion(trip, outcome.plan, input.edit.type, current.inputFingerprint);
  if (input.edit.type === "move_stop") trackServer("stop_moved", { version: itinerary.version });
  return { itinerary, saved: true };
}

function assertExpectedVersion(trip: Trip, expectedVersion: number | null) {
  if (trip.currentItineraryVersion !== expectedVersion) {
    throw new AppError("STALE_VERSION", "The itinerary changed since you loaded it. Reload and try again.", {
      currentVersion: trip.currentItineraryVersion,
    });
  }
}

async function saveVersion(trip: Trip, plan: PlanResult, change: string, inputFingerprint: string): Promise<Itinerary> {
  const r = repos();
  const itinerary: Itinerary = {
    id: newId("itin"),
    tripId: trip.id,
    version: (trip.currentItineraryVersion ?? 0) + 1,
    createdAt: nowIso(),
    change,
    ...plan,
    inputFingerprint,
  };
  await r.itineraries.insert(itinerary);
  const latest = (await r.trips.get(trip.id)) ?? trip;
  await r.trips.update({ ...latest, currentItineraryVersion: itinerary.version, updatedAt: nowIso() });
  return itinerary;
}

function toAppError(error: unknown): unknown {
  if (!(error instanceof PlannerError)) return error;
  switch (error.code) {
    case "STOP_NOT_FOUND":
      return new AppError("NOT_FOUND", error.message);
    case "DATE_OUTSIDE_TRIP":
      return validationFailed(error.message, [{ path: "edit", message: error.message }]);
    default:
      return invalidState(error.message);
  }
}

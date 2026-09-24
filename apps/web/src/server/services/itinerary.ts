import type { CandidatePlace, EndpointBody, GenerationInfo, Itinerary, ItineraryEdit, Trip, User } from "@reel/contracts";
import { generateWithProvider } from "@reel/ai/itinerary";
import {
  applyEdit,
  assessQuality,
  generatePlan,
  planFingerprint,
  PlannerError,
  ProposalError,
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
import { itineraryProvider } from "../itinerary-provider";
import { prepareDiscovery } from "../itinerary-discovery";
import { enforceRateLimit } from "./rate-limits";
import { routeMatches, selectedPlaceIds } from "./route-matches";
import { requireDatedTrip, tripDateIssues } from "./trip-date-integrity";

// Itinerary versions (F4/F5, owner: Member 4). Scheduling rules live in packages/planner;
// this file loads inputs, enforces expectedVersion and saves immutable versions.

type RoutingContext = PlannerContext & Pick<Itinerary, "resolvedPlaces" | "unresolvedPlaceIds" | "duplicatePlaceIds">;

export async function plannerContextFor(source: Trip, candidates?: CandidatePlace[]): Promise<RoutingContext> {
  const trip = requireDatedTrip(source);
  const r = repos();
  const all = candidates ?? await r.places.listByTrip(trip.id);
  const ids = selectedPlaceIds(trip, all);
  const { matches, unresolvedPlaceIds } = routeMatches(trip, all);
  const byId = new Map(all.map((place) => [place.id, place]));
  const providerIds = new Map<string, PlannablePlace>();
  const duplicatePlaceIds: string[] = [];
  for (const id of ids) {
    const place = byId.get(id);
    const option = matches.get(id);
    if (!place || !option) continue;
    const plannable = toPlannablePlace(place, option);
    if (!plannable) continue;
    const prior = providerIds.get(option.providerPlaceId);
    if (prior) {
      duplicatePlaceIds.push(id);
      prior.sourceInspirationIds = [...new Set([...prior.sourceInspirationIds, ...plannable.sourceInspirationIds])];
    } else providerIds.set(option.providerPlaceId, plannable);
  }
  const places = [...providerIds.values()];
  const reservations = (await r.reservations.listByTrip(trip.id)).sort((a, b) => a.start.localeCompare(b.start));
  return {
    destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, timezone: trip.timezone,
    preferences: trip.preferences, places, reservations,
    ...(trip.selectedPlaceIds === undefined ? {} : { selectionIds: ids }),
    resolvedPlaces: [...matches].map(([placeId, option]) => ({ placeId, providerPlaceId: option.providerPlaceId })),
    unresolvedPlaceIds, duplicatePlaceIds,
  };
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
  const trip = requireDatedTrip(await getOwnedTrip(user, tripId));
  assertExpectedVersion(trip, input.expectedVersion);
  const ctx = await plannerContextFor(trip);
  const dateIssues = tripDateIssues(trip, ctx.reservations);
  if (dateIssues.length) throw invalidState(`${dateIssues[0]!.message} Open Trip setup to fix it, then generate again.`);
  if (trip.selectedPlaceIds?.length === 0 && ctx.reservations.length === 0) {
    throw invalidState("Choose at least one place before building your route.");
  }
  if (ctx.selectionIds?.length && ctx.places.length === 0 && ctx.reservations.length === 0) {
    throw invalidState("None of the selected places has a location yet. Add details or retry location lookup before planning.");
  }
  const provider = itineraryProvider();
  if (!provider && ctx.places.length === 0 && ctx.reservations.length === 0) {
    throw invalidState("Choose at least one place or add a booking before generating an itinerary.");
  }
  const fingerprint = planFingerprint(ctx);
  let plan: PlanResult;
  let generation: GenerationInfo | undefined;
  try {
    if (provider) {
      await enforceRateLimit(`itinerary-minute:${user.id}`, { limit: 3, windowMs: 60_000 });
      await enforceRateLimit(`itinerary-day:${user.id}`, { limit: 20, windowMs: 86_400_000 });
      const discovery = await prepareDiscovery(ctx);
      ({ plan, generation } = await generateWithProvider(discovery.ctx, provider));
      plan = assessQuality(await discovery.enrich(plan), discovery.ctx, plan.quality?.repairApplied);
    } else plan = assessQuality(generatePlan(ctx), ctx);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const reason = error instanceof ProposalError ? error.issues[0]?.split(": ").slice(1).join(": ") : null;
    throw new AppError("GENERATION_FAILED", `${reason || "Could not generate a checked itinerary."} Your saved itinerary is unchanged. The generator could not produce a valid schedule. Retry, or review the reported constraint.`,
      error instanceof ProposalError ? { issues: error.issues } : undefined);
  }
  // A model call can take seconds. Do not publish a plan for preferences/places changed meanwhile.
  const latest = await getOwnedTrip(user, tripId);
  assertExpectedVersion(latest, input.expectedVersion);
  if (fingerprint !== planFingerprint(await plannerContextFor(latest))) {
    throw new AppError("STALE_TRIP", "Trip dates, preferences, places or bookings changed during generation. Review them and generate again.");
  }
  const itinerary = await saveVersion(latest, plan, "generated", fingerprint, generation, ctx);
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

  const candidates = await repos().places.listByTrip(trip.id);
  const before = await plannerContextFor(trip, candidates);
  // Adding or swapping in a trip place that isn't selected yet selects it as part of the same edit.
  const selecting = placeToSelect(input.edit, trip, candidates);
  const planned = selecting ? { ...trip, selectedPlaceIds: [...selectedPlaceIds(trip, candidates), selecting] } : trip;
  const ctx = selecting ? await plannerContextFor(planned, candidates) : before;
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
    return { itinerary: { ...current, ...assessQuality(outcome.plan, ctx), change: input.edit.type }, saved: false };
  }

  const saved = selecting ? await repos().trips.update({ ...planned, updatedAt: nowIso() }, trip) : trip;
  const fingerprint = absorbedFingerprint(current, before, ctx);
  const itinerary = await saveVersion(saved, assessQuality(outcome.plan, ctx), input.edit.type, fingerprint, undefined, selecting ? ctx : current);
  if (input.edit.type === "move_stop") trackServer("stop_moved", { version: itinerary.version });
  return { itinerary, saved: true };
}

/** An owned, usable trip place the edit brings in that planning doesn't include yet; null when nothing to select. */
function placeToSelect(edit: ItineraryEdit, trip: Trip, candidates: CandidatePlace[]): string | null {
  if (edit.type !== "add_place" && edit.type !== "replace_stop") return null;
  const place = candidates.find((candidate) => candidate.id === edit.placeId);
  if (!place || place.status === "rejected") return null;
  return selectedPlaceIds(trip, candidates).includes(place.id) ? null : place.id;
}

/**
 * Edits normally keep the generation fingerprint, so a stale itinerary stays stale until regenerated.
 * When the edit itself changed a planning input (e.g. selected a new place), an itinerary that was
 * current before stays current: the traveler's edit already accounts for the change.
 */
function absorbedFingerprint(current: Itinerary, before: RoutingContext, after: RoutingContext): string {
  if (before === after) return current.inputFingerprint;
  return current.inputFingerprint === planFingerprint(before) ? planFingerprint(after) : current.inputFingerprint;
}

function assertExpectedVersion(trip: Trip, expectedVersion: number | null) {
  if (trip.currentItineraryVersion !== expectedVersion) {
    throw new AppError("STALE_VERSION", "The itinerary changed since you loaded it. Reload and try again.", {
      currentVersion: trip.currentItineraryVersion,
    });
  }
}

async function saveVersion(trip: Trip, plan: PlanResult, change: string, inputFingerprint: string, generation?: GenerationInfo,
  routing?: Pick<Itinerary, "resolvedPlaces" | "unresolvedPlaceIds" | "duplicatePlaceIds">): Promise<Itinerary> {
  const r = repos();
  const itinerary: Itinerary = {
    id: newId("itin"),
    tripId: trip.id,
    version: (trip.currentItineraryVersion ?? 0) + 1,
    createdAt: nowIso(),
    change,
    ...plan,
    ...(routing ? { resolvedPlaces: routing.resolvedPlaces, unresolvedPlaceIds: routing.unresolvedPlaceIds, duplicatePlaceIds: routing.duplicatePlaceIds } : {}),
    inputFingerprint,
    ...(generation ? { generation } : {}),
  };
  await r.itineraries.saveVersion(itinerary, trip.currentItineraryVersion);
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

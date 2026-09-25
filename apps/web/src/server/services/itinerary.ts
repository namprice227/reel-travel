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
import { addPlaceFromSearch, confirmPlace, copyPlacesToTrip, renamePlace } from "./places";
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
  const { trip, current } = await editableItinerary(user, tripId, input.expectedVersion);
  const candidates = await repos().places.listByTrip(trip.id);
  const wasCurrent = current.inputFingerprint === planFingerprint(await plannerContextFor(trip, candidates));
  return saveEdit(trip, current, candidates, input.edit, { wasCurrent, dryRun: input.dryRun ?? false });
}

/**
 * Add a place to a day (or swap a stop for it) from this trip, another trip's saves, the account library or a search.
 * Copies and a chosen branch are saved first, then the same edit path as itinerary.edit runs; freshness is
 * judged against the inputs before this request, so the traveler's own addition never makes the plan stale.
 */
export async function addItineraryPlace(
  user: User,
  tripId: string,
  input: EndpointBody<"itinerary.addPlace">,
): Promise<{ itinerary: Itinerary; place: CandidatePlace }> {
  const { trip, current } = await editableItinerary(user, tripId, input.expectedVersion);
  const r = repos();
  const wasCurrent = current.inputFingerprint === planFingerprint(await plannerContextFor(trip));

  let placeId: string;
  const { source } = input;
  if (source.kind === "trip") {
    const place = await r.places.get(source.placeId);
    if (!place || place.tripId !== trip.id) throw notFound("Place");
    placeId = place.id;
  } else if (source.kind === "search") {
    placeId = (await addPlaceFromSearch(user, trip.id, source.query, source.providerPlaceId)).id;
  } else {
    const [copy] = await copyPlacesToTrip(user, trip.id, source.kind === "saved" ? { placeIds: [source.placeId] } : { accountPlaceIds: [source.accountPlaceId] });
    if (!copy) throw notFound("Place");
    placeId = copy.id;
  }
  let place = (await r.places.get(placeId))!;
  if (place.status === "rejected") throw invalidState(`"${place.name}" was rejected for this trip. Restore it on the Places page first.`);
  if (input.providerPlaceId && place.selected?.providerPlaceId !== input.providerPlaceId) {
    ({ place } = await confirmPlace(user, trip.id, place.id, { providerPlaceId: input.providerPlaceId }));
  }

  // The intake above may have changed the trip (selection references); plan against what is stored now.
  const latest = await getOwnedTrip(user, tripId);
  const edit: ItineraryEdit = input.at.type === "day"
    ? { type: "add_place", placeId: place.id, date: input.at.date, index: input.at.index ?? Number.MAX_SAFE_INTEGER }
    : { type: "replace_stop", stopId: input.at.stopId, placeId: place.id };
  const { itinerary } = await saveEdit(latest, current, await r.places.listByTrip(trip.id), edit, { wasCurrent, dryRun: false });
  return { itinerary, place };
}

/**
 * Change a trip place's branch and/or the traveler's name for it, then refresh its stops. Freshness is judged
 * against the inputs before the request, as for addItineraryPlace.
 */
export async function updateItineraryPlace(
  user: User,
  tripId: string,
  placeId: string,
  input: EndpointBody<"itinerary.updatePlace">,
): Promise<{ itinerary: Itinerary; place: CandidatePlace }> {
  const { trip, current } = await editableItinerary(user, tripId, input.expectedVersion);
  const r = repos();
  const wasCurrent = current.inputFingerprint === planFingerprint(await plannerContextFor(trip));
  let place = await r.places.get(placeId);
  if (!place || place.tripId !== trip.id) throw notFound("Place");
  if (place.status === "rejected") throw invalidState(`"${place.name}" was rejected for this trip. Restore it on the Places page first.`);
  if (input.providerPlaceId && input.providerPlaceId !== place.selected?.providerPlaceId) {
    ({ place } = await confirmPlace(user, trip.id, place.id, { providerPlaceId: input.providerPlaceId }));
  }
  if (input.customName !== undefined) place = await renamePlace(user, trip.id, place.id, input.customName);
  const latest = await getOwnedTrip(user, tripId);
  const { itinerary } = await saveEdit(latest, current, await r.places.listByTrip(trip.id), { type: "refresh_place", placeId: place.id }, { wasCurrent, dryRun: false });
  return { itinerary, place };
}

async function editableItinerary(user: User, tripId: string, expectedVersion: number): Promise<{ trip: Trip; current: Itinerary }> {
  const trip = await getOwnedTrip(user, tripId);
  if (!trip.currentItineraryVersion) throw invalidState("Generate an itinerary before editing it.");
  assertExpectedVersion(trip, expectedVersion);
  const current = await currentItinerary(trip);
  if (!current) throw notFound("Itinerary");
  return { trip, current };
}

/**
 * Apply one planner edit and save it as a new version. Edits normally keep the generation fingerprint,
 * so a stale itinerary stays stale until regenerated. When the edit (or the request around it) changed a
 * planning input, e.g. selected a new place, an itinerary that was current before stays current: the
 * traveler's edit already accounts for the change.
 */
async function saveEdit(
  trip: Trip,
  current: Itinerary,
  candidates: CandidatePlace[],
  edit: ItineraryEdit,
  { wasCurrent, dryRun }: { wasCurrent: boolean; dryRun: boolean },
): Promise<{ itinerary: Itinerary; saved: boolean }> {
  // Adding or swapping in a trip place that isn't selected yet selects it as part of the same edit.
  const selecting = placeToSelect(edit, trip, candidates);
  let planned = selecting ? { ...trip, selectedPlaceIds: [...selectedPlaceIds(trip, candidates), selecting] } : trip;
  let ctx = await plannerContextFor(planned, candidates);
  let outcome: ReturnType<typeof applyEdit>;
  try {
    outcome = applyEdit(current, edit, ctx);
  } catch (error) {
    throw toAppError(error);
  }
  if (!outcome.ok) {
    throw new AppError("EDIT_REJECTED", outcome.conflicts[0]?.message ?? "That edit was rejected.", {
      conflicts: outcome.conflicts,
    });
  }
  const removedStop = edit.type === "remove_stop"
    ? current.days.flatMap((day) => day.stops).find((stop) => stop.id === edit.stopId) : undefined;
  const deselecting = removedStop?.kind === "place" && removedStop.placeId
    && !outcome.plan.days.some((day) => day.stops.some((stop) => stop.placeId === removedStop.placeId))
    ? removedStop.placeId : null;
  if (deselecting) {
    planned = { ...planned, selectedPlaceIds: selectedPlaceIds(planned, candidates).filter((id) => id !== deselecting) };
    ctx = await plannerContextFor(planned, candidates);
    outcome.plan.unscheduledPlaceIds = outcome.plan.unscheduledPlaceIds.filter((id) => id !== deselecting);
  }
  if (dryRun) {
    return { itinerary: { ...current, ...assessQuality(outcome.plan, ctx), change: edit.type }, saved: false };
  }

  const saved = selecting || deselecting ? await repos().trips.update({ ...planned, updatedAt: nowIso() }, trip) : trip;
  const fingerprint = wasCurrent ? planFingerprint(ctx) : current.inputFingerprint;
  const inputsChanged = fingerprint !== current.inputFingerprint;
  const itinerary = await saveVersion(saved, assessQuality(outcome.plan, ctx), edit.type, fingerprint, undefined, inputsChanged || selecting || deselecting ? ctx : current);
  if (edit.type === "move_stop") trackServer("stop_moved", { version: itinerary.version });
  return { itinerary, saved: true };
}

/** An owned, usable trip place the edit brings in that planning doesn't include yet; null when nothing to select. */
function placeToSelect(edit: ItineraryEdit, trip: Trip, candidates: CandidatePlace[]): string | null {
  if (edit.type !== "add_place" && edit.type !== "replace_stop") return null;
  const place = candidates.find((candidate) => candidate.id === edit.placeId);
  if (!place || place.status === "rejected") return null;
  return selectedPlaceIds(trip, candidates).includes(place.id) ? null : place.id;
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

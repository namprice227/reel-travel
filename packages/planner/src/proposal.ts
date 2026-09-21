import { ItineraryProposal, stayOn, type Day, type Stop } from "@reel/contracts";
import { PACE_CAPACITY, planAssumptions } from "./generate";
import { breakStop, placeStop, reservationStop } from "./stops";
import { datePart, datesBetween, timePart, toMinutes } from "./time";
import { travelMinutes } from "./travel";
import { defaultStopId, type PlannerContext, type PlanResult } from "./types";
import { validatePlan } from "./validate";

export class ProposalError extends Error {
  constructor(public readonly issues: string[]) { super("Itinerary proposal failed validation."); }
}

/** Accept no model-authored facts. Derive durations, identities, travel and validation ourselves. */
export function compileProposal(raw: unknown, ctx: PlannerContext): PlanResult {
  const parsed = ItineraryProposal.safeParse(raw);
  if (!parsed.success) throw new ProposalError(["SCHEMA: Invalid itinerary JSON."]);
  const dates = datesBetween(ctx.startDate, ctx.endDate);
  const proposal = parsed.data;
  if (JSON.stringify(proposal.days.map(d => d.date)) !== JSON.stringify(dates))
    throw new ProposalError(["DATES: Include every trip date exactly once in order."]);
  const places = new Map(ctx.places.map(p => [p.placeId, p]));
  const reservations = new Map(ctx.reservations.map(r => [r.id, r]));
  const booked = new Set(ctx.reservations.flatMap(r => r.placeId ? [r.placeId] : []));
  const usedPlaces = new Set<string>(), usedBookings = new Set<string>();
  const issues: string[] = [];
  const newId = ctx.newId ?? defaultStopId;
  const days: Day[] = proposal.days.map(day => {
    let here = stayOn(ctx.preferences.accommodations, day.date)?.location ?? null;
    let breaks = 0, visits = 0;
    const stops: Stop[] = [];
    for (const item of day.stops) {
      const start = toMinutes(item.start);
      let stop: Stop;
      if (item.kind === "place") {
        const place = item.referenceId ? places.get(item.referenceId) : undefined;
        if (!place || usedPlaces.has(place.placeId) || booked.has(place.placeId)) {
          issues.push("PLACE_ID: Only unique confirmed, unbooked place IDs may be visited."); continue;
        }
        usedPlaces.add(place.placeId); visits++;
        if (start + place.visitMinutes >= 1440) issues.push("DURATION: A visit cannot cross midnight.");
        stop = placeStop(place, newId(), day.date, start);
      } else if (item.kind === "reservation") {
        const booking = item.referenceId ? reservations.get(item.referenceId) : undefined;
        if (!booking || usedBookings.has(booking.id)) {
          issues.push("BOOKING_ID: Include each supplied booking once."); continue;
        }
        usedBookings.add(booking.id);
        if (datePart(booking.start) !== day.date || timePart(booking.start) !== item.start)
          issues.push("BOOKING_TIME: Booking dates and times cannot move.");
        stop = reservationStop(booking, booking.placeId ? places.get(booking.placeId) : undefined, newId());
      } else {
        breaks++;
        if (item.referenceId !== null || ctx.preferences.breakMinutes === 0 || start + ctx.preferences.breakMinutes >= 1440)
          issues.push("BREAK: Break must have no ID and use the requested duration within the day.");
        stop = breakStop(newId(), start, ctx.preferences.breakMinutes);
      }
      if (toMinutes(stop.start) < toMinutes(ctx.preferences.dayStart) || toMinutes(stop.end) > toMinutes(ctx.preferences.dayEnd))
        issues.push("DAY_WINDOW: Stops must fit the requested daily start/end times.");
      stop.travelMinutesBefore = stop.kind === "break" ? 0 : travelMinutes(here, stop.location, ctx.preferences.transport);
      if (stop.kind !== "break") here = stop.location;
      stops.push(stop);
    }
    if (visits > PACE_CAPACITY[ctx.preferences.pace]) issues.push("PACE: Too many place visits for the selected pace.");
    // On days with multiple activities, reserve the exact requested break. Empty/single-activity days may omit it.
    if (breaks > 1 || (stops.filter(s => s.kind !== "break").length >= 2 && ctx.preferences.breakMinutes > 0 && breaks !== 1))
      issues.push("BREAK: Include one requested break on days with two or more activities.");
    return { date: day.date, stops };
  });
  if (usedBookings.size !== reservations.size) issues.push("BOOKING_MISSING: Every booking must remain in the itinerary.");
  const unscheduledPlaceIds = ctx.places.filter(p => !usedPlaces.has(p.placeId) && !booked.has(p.placeId)).map(p => p.placeId);
  const validation = validatePlan(days, unscheduledPlaceIds, ctx);
  // Generation preserves all supplied bookings, including unlocked ones; known late arrival is never acceptable.
  issues.push(...validation.conflicts.filter(c => c.severity === "error" || c.code === "LOCKED_RESERVATION_UNREACHABLE")
    .map(c => `${c.code}: ${c.message}`));
  if (issues.length) throw new ProposalError([...new Set(issues)].slice(0, 20));
  return { days, unscheduledPlaceIds, ...validation, assumptions: planAssumptions(ctx) };
}

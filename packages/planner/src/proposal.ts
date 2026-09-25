import { ItineraryProposal, type Day, type Stop } from "@reel/contracts";
import { dayStartLocation } from "./stay-fit";
import { planAssumptions } from "./generate";
import { breakStop, placeStop, reservationStop } from "./stops";
import { datePart, datesBetween, timePart, toMinutes, toLocalTime } from "./time";
import { travelMinutes } from "./travel";
import { defaultStopId, type PlannerContext, type PlanResult } from "./types";
import { validatePlan } from "./validate";

export class ProposalError extends Error {
  constructor(public readonly issues: string[]) { super("Itinerary proposal failed validation."); }
}

/** Hydrate saved-place facts; keep flexible durations and unverified suggestions distinct. */
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
  const usedPlaces = new Map<string, string>(), usedBookings = new Set<string>();
  const issues: string[] = [];
  const newId = ctx.newId ?? defaultStopId;
  const days: Day[] = proposal.days.map(day => {
    let here = dayStartLocation(ctx.preferences.accommodations, day.date);
    const stops: Stop[] = [];
    for (const item of day.stops) {
      const start = toMinutes(item.start);
      if (!["meal", "suggestion"].includes(item.kind) && (item.title || item.area || item.reason))
        issues.push("FACTS: Saved-place and booking facts must come from the trip, not model text.");
      let stop: Stop;
      if (item.kind === "place") {
        const place = item.referenceId ? places.get(item.referenceId) : undefined;
        if (!place) {
          issues.push(`PLACE_UNKNOWN (${item.referenceId ?? "null"}): The model used a place outside the confirmed list on ${day.date} at ${item.start}. Use a supplied eligible place ID or a separate unverified suggestion.`); continue;
        }
        if (booked.has(place.placeId)) {
          issues.push(`PLACE_BOOKED (${place.placeId}): "${place.title}" is already covered by a booking. Keep the booking entry and remove this extra visit on ${day.date} at ${item.start}.`); continue;
        }
        const firstVisit = usedPlaces.get(place.placeId);
        if (firstVisit) {
          issues.push(`PLACE_DUPLICATE (${place.placeId}): "${place.title}" appears twice: ${firstVisit} and ${day.date} at ${item.start}. Keep one visit across the whole trip and use other activities or free time for the remaining slot.`); continue;
        }
        usedPlaces.set(place.placeId, `${day.date} at ${item.start}`);
        const duration = item.durationMinutes ?? place.visitMinutes;
        if (start + duration >= 1440) issues.push("DURATION: A visit cannot cross midnight.");
        stop = placeStop({ ...place, visitMinutes: duration }, newId(), day.date, start);
        if (item.durationMinutes != null) stop.plannedDurationMinutes = duration;
      } else if (item.kind === "reservation") {
        const booking = item.referenceId ? reservations.get(item.referenceId) : undefined;
        if (!booking || usedBookings.has(booking.id)) {
          issues.push("BOOKING_ID: Include each supplied booking once."); continue;
        }
        usedBookings.add(booking.id);
        if (datePart(booking.start) !== day.date || timePart(booking.start) !== item.start)
          issues.push("BOOKING_TIME: Booking dates and times cannot move.");
        stop = reservationStop(booking, booking.placeId ? places.get(booking.placeId) : undefined, newId());
      } else if (item.kind === "break") {
        const duration = item.durationMinutes ?? ctx.preferences.breakMinutes;
        if (item.referenceId !== null || duration <= 0 || start + duration >= 1440)
          issues.push("BREAK: Break must have no ID and a positive duration within the day.");
        stop = breakStop(newId(), start, duration);
      } else {
        const duration = item.durationMinutes;
        if (item.referenceId !== null || duration == null || !item.title || !item.area || !item.reason) {
          issues.push("SUGGESTION: Meals and suggestions need a title, area, reason, duration and no saved-place ID."); continue;
        }
        if (start + duration >= 1440) issues.push("DURATION: An activity cannot cross midnight.");
        stop = { id: newId(), kind: item.kind, title: item.title, placeId: null, reservationId: null,
          location: null, start: item.start, end: toLocalTime(start + duration), locked: false,
          travelMinutesBefore: null, hoursCheck: "unknown", sourceInspirationIds: [],
          suggestedArea: item.area, planningNote: item.reason, plannedDurationMinutes: duration };
      }
      if (toMinutes(stop.start) < toMinutes(ctx.preferences.dayStart) || toMinutes(stop.end) > toMinutes(ctx.preferences.dayEnd))
        issues.push("DAY_WINDOW: Stops must fit the requested daily start/end times.");
      stop.travelMinutesBefore = stop.kind === "break" ? 0 : travelMinutes(here, stop.location, ctx.preferences.transport);
      if (stop.kind !== "break") here = stop.location;
      stops.push(stop);
    }
    return { date: day.date, stops };
  });
  if (usedBookings.size !== reservations.size) issues.push("BOOKING_MISSING: Every booking must remain in the itinerary.");
  const unscheduledPlaceIds = ctx.places.filter(p => !usedPlaces.has(p.placeId) && !booked.has(p.placeId)).map(p => p.placeId);
  const validation = validatePlan(days, unscheduledPlaceIds, ctx);
  // Generation preserves all supplied bookings, including unlocked ones; known late arrival is never acceptable.
  issues.push(...validation.conflicts.filter(c => c.severity === "error" || c.code === "LOCKED_RESERVATION_UNREACHABLE")
    .map(c => `${c.code}: ${c.message}`));
  if (issues.length) throw new ProposalError([...new Set(issues)].slice(0, 20));
  return { days, unscheduledPlaceIds, ...validation, assumptions: [...planAssumptions(ctx),
    "Visit durations and meal times are planning estimates. Activities without provider-listed venue details are unverified; check locations, special opening hours and travel before going.",
    ...(proposal.seasonalAdvice ? ["Seasonal guidance (AI suggestion, not a forecast): " + proposal.seasonalAdvice] : [])] };
}

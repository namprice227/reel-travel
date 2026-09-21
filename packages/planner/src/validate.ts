import { stayOn, type Conflict, type Day, type Stop, type ValidationStatus } from "@reel/contracts";
import { checkHours } from "./hours";
import { datePart, datesBetween, toLocalTime, toMinutes } from "./time";
import type { PlannerContext } from "./types";

/** Deterministic checks over a saved or proposed plan. Model output is never validation. */
export function validatePlan(
  days: Day[],
  unscheduledPlaceIds: string[],
  ctx: PlannerContext,
): { conflicts: Conflict[]; validationStatus: ValidationStatus } {
  const dayEnd = toMinutes(ctx.preferences.dayEnd);
  const placesById = new Map(ctx.places.map((p) => [p.placeId, p]));
  const conflicts: Conflict[] = [];

  for (const day of days) {
    let previous: Stop | null = null;
    let cursor = toMinutes(ctx.preferences.dayStart);
    let here = stayOn(ctx.preferences.accommodations, day.date)?.location ?? null;
    const overflow: Stop[] = [];

    for (const stop of day.stops) {
      const start = toMinutes(stop.start);
      const end = toMinutes(stop.end);

      if (stop.kind !== "break" && (!here || !stop.location || stop.travelMinutesBefore === null)) {
        conflicts.push({
          code: "TRAVEL_UNKNOWN", severity: "info", date: day.date,
          stopIds: [stop.id], placeIds: stop.placeId ? [stop.placeId] : [],
          message: `Travel to "${stop.title}" is unknown, so arrival at ${stop.start} has not been checked.`,
          suggestion: "Add the missing accommodation or booking location and regenerate; check travel before relying on these times.",
        });
      }
      const arrival = cursor + (stop.travelMinutesBefore ?? 0);
      if (start < arrival) {
        conflicts.push(
          stop.kind === "reservation"
            ? unreachable(stop, previous, day.date, arrival)
            : overlap(stop, previous, day.date, arrival),
        );
      }

      if (stop.kind === "suggestion" || stop.kind === "meal") {
        conflicts.push(hoursUnknown(stop, day.date));
        if (stop.plannedDurationMinutes && end - start < stop.plannedDurationMinutes) conflicts.push({
          code: "VISIT_DURATION_TRUNCATED", severity: "error", date: day.date, stopIds: [stop.id], placeIds: [],
          message: `The planned duration for "${stop.title}" does not fit before midnight.`, suggestion: "Move this activity earlier or to another day.",
        });
      }
      if (stop.kind === "place") {
        const place = stop.placeId ? placesById.get(stop.placeId) : undefined;
        if (place && end - start < (stop.plannedDurationMinutes ?? place.visitMinutes)) {
          conflicts.push({
            code: "VISIT_DURATION_TRUNCATED", severity: "error", date: day.date,
            stopIds: [stop.id], placeIds: [place.placeId],
            message: `"${stop.title}" needs ${stop.plannedDurationMinutes ?? place.visitMinutes} minutes, which does not fit before midnight.`,
            suggestion: "Move it earlier or to another day. Visits cannot be shortened to fit.",
          });
        }
        const check = place ? checkHours(place.openingHours, day.date, start, end) : "unknown";
        if (check === "closed") conflicts.push(outsideHours(stop, day.date));
        if (check === "unknown") conflicts.push(hoursUnknown(stop, day.date));
      }

      if (stop.kind !== "reservation" && end > dayEnd) overflow.push(stop);
      previous = stop;
      if (stop.kind !== "break") here = stop.location;
      cursor = Math.max(cursor, end);
    }

    if (overflow.length > 0) {
      conflicts.push({
        code: "DAY_OVERFLOW",
        severity: "warning",
        date: day.date,
        stopIds: overflow.map((s) => s.id),
        placeIds: overflow.flatMap((s) => (s.placeId ? [s.placeId] : [])),
        message: `This day runs past your ${ctx.preferences.dayEnd} end time.`,
        suggestion: "Move a stop to another day or remove one.",
      });
    }
  }

  if (unscheduledPlaceIds.length > 0) {
    conflicts.push({
      code: "PLACE_UNSCHEDULED",
      severity: "warning",
      date: null,
      stopIds: [],
      placeIds: unscheduledPlaceIds,
      message: `${unscheduledPlaceIds.length} confirmed place(s) did not fit into the trip.`,
      suggestion: "Add them to a day manually, choose a faster pace, or extend the trip.",
    });
  }

  const tripDates = new Set(datesBetween(ctx.startDate, ctx.endDate));
  for (const reservation of ctx.reservations) {
    if (!tripDates.has(datePart(reservation.start))) {
      conflicts.push({
        code: "RESERVATION_OUTSIDE_TRIP",
        severity: "warning",
        date: datePart(reservation.start),
        stopIds: [],
        placeIds: reservation.placeId ? [reservation.placeId] : [],
        message: `Booking "${reservation.title}" is outside the trip dates.`,
        suggestion: "Change the booking or the trip dates.",
      });
    }
  }

  const validationStatus: ValidationStatus = conflicts.some((c) => c.severity === "error")
    ? "has_conflicts"
    : conflicts.some((c) => c.code === "HOURS_UNKNOWN" || c.code === "TRAVEL_UNKNOWN")
      ? "partially_checked"
      : "valid";

  return { conflicts, validationStatus };
}

const placeIdsOf = (...stops: Stop[]) => stops.flatMap((s) => (s.placeId ? [s.placeId] : []));

function unreachable(stop: Stop, previous: Stop | null, date: string, arrival: number): Conflict {
  return {
    code: "LOCKED_RESERVATION_UNREACHABLE",
    // Only locked bookings block edits; unlocked ones are a warning.
    severity: stop.locked ? "error" : "warning",
    date,
    stopIds: [stop.id, ...(previous ? [previous.id] : [])],
    placeIds: placeIdsOf(stop, ...(previous ? [previous] : [])),
    message: `You'd reach "${stop.title}" at ${toLocalTime(arrival)}, after its ${stop.start} start, given ${previous ? `the preceding stops and travel` : `your day start and travel from accommodation`}.`,
    suggestion: "Move a stop to another day or after the booking.",
  };
}

function overlap(stop: Stop, previous: Stop | null, date: string, arrival: number): Conflict {
  return {
    code: "OVERLAP",
    severity: "error",
    date,
    stopIds: [stop.id, ...(previous ? [previous.id] : [])],
    placeIds: placeIdsOf(stop, ...(previous ? [previous] : [])),
    message: `"${stop.title}" starts at ${stop.start}, but ${previous ? "the preceding stops plus travel" : "your day start plus travel from accommodation"} runs until ${toLocalTime(arrival)}.`,
    suggestion: "Regenerate the day or move one of the stops.",
  };
}

function outsideHours(stop: Stop, date: string): Conflict {
  return {
    code: "OUTSIDE_OPENING_HOURS",
    severity: "error",
    date,
    stopIds: [stop.id],
    placeIds: placeIdsOf(stop),
    message: `"${stop.title}" is not open ${stop.start}–${stop.end} on this day.`,
    suggestion: "Move it to a day or time when it is open.",
  };
}

function hoursUnknown(stop: Stop, date: string): Conflict {
  return {
    code: "HOURS_UNKNOWN",
    severity: "info",
    date,
    stopIds: [stop.id],
    placeIds: placeIdsOf(stop),
    message: `Opening hours for "${stop.title}" are unknown, so this time was not checked.`,
    suggestion: "Check the venue's hours before you go.",
  };
}

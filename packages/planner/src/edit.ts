import type { Conflict, Day, ItineraryEdit, Stop } from "@reel/contracts";
import { planAssumptions } from "./generate";
import { retimeDay } from "./retime";
import { placeStop } from "./stops";
import { toMinutes } from "./time";
import { defaultStopId, PlannerError, type EditOutcome, type PlannerContext } from "./types";
import { validatePlan } from "./validate";

/**
 * Apply one traveler edit, re-time the affected days and re-validate everything.
 * Rejected (ok:false) when it touches a booking or makes a locked booking unreachable that was
 * reachable before, or truncates a visit at midnight. Other conflicts are returned for the UI.
 * Throws PlannerError for input that doesn't match the itinerary (unknown stop, unconfirmed place...).
 */
export function applyEdit(
  current: { days: Day[]; unscheduledPlaceIds: string[]; assumptions?: string[] },
  edit: ItineraryEdit,
  ctx: PlannerContext,
): EditOutcome {
  const newId = ctx.newId ?? defaultStopId;
  const placesById = new Map(ctx.places.map((p) => [p.placeId, p]));
  let days = current.days.map((day) => ({ ...day, stops: [...day.stops] }));
  let unscheduled = [...current.unscheduledPlaceIds];
  const affected = new Set<string>();

  const locate = (stopId: string) => {
    for (const day of days) {
      const index = day.stops.findIndex((s) => s.id === stopId);
      if (index !== -1) return { day, index, stop: day.stops[index]! };
    }
    throw new PlannerError("STOP_NOT_FOUND", `Stop ${stopId} is not in this itinerary version.`);
  };
  const dayFor = (date: string) => {
    const day = days.find((d) => d.date === date);
    if (!day) throw new PlannerError("DATE_OUTSIDE_TRIP", `${date} is not a day of this trip.`);
    return day;
  };
  const freePlace = (placeId: string) => {
    const place = placesById.get(placeId);
    if (!place) throw new PlannerError("PLACE_NOT_AVAILABLE", `Place ${placeId} is not a confirmed place in this trip.`);
    if (days.some((d) => d.stops.some((s) => s.placeId === placeId))) {
      throw new PlannerError("PLACE_ALREADY_SCHEDULED", `"${place.title}" is already in the itinerary.`);
    }
    return place;
  };

  switch (edit.type) {
    case "move_stop": {
      const { day, index, stop } = locate(edit.stopId);
      if (stop.kind === "reservation") return bookingChanged(stop, day.date);
      day.stops.splice(index, 1);
      const target = dayFor(edit.toDate);
      target.stops.splice(Math.min(edit.toIndex, target.stops.length), 0, stop);
      affected.add(day.date).add(target.date);
      break;
    }
    case "remove_stop": {
      const { day, index, stop } = locate(edit.stopId);
      if (stop.kind === "reservation") return bookingChanged(stop, day.date);
      day.stops.splice(index, 1);
      if (stop.kind === "place" && stop.placeId) unscheduled = [...new Set([...unscheduled, stop.placeId])];
      affected.add(day.date);
      break;
    }
    case "add_place": {
      const place = freePlace(edit.placeId);
      const target = dayFor(edit.date);
      target.stops.splice(Math.min(edit.index, target.stops.length), 0, placeStop(place, newId(), target.date, 0));
      unscheduled = unscheduled.filter((id) => id !== place.placeId);
      affected.add(target.date);
      break;
    }
    case "replace_stop": {
      const { day, index, stop } = locate(edit.stopId);
      if (stop.kind === "reservation") return bookingChanged(stop, day.date);
      const place = freePlace(edit.placeId);
      day.stops[index] = placeStop(place, newId(), day.date, toMinutes(stop.start));
      if (stop.kind === "place" && stop.placeId) unscheduled = [...new Set([...unscheduled, stop.placeId])];
      unscheduled = unscheduled.filter((id) => id !== place.placeId);
      affected.add(day.date);
      break;
    }
    case "set_stop_time": {
      const { day, index, stop } = locate(edit.stopId);
      if (stop.kind === "reservation") return bookingChanged(stop, day.date);
      const { notBefore: _previous, ...rest } = stop;
      day.stops[index] = { ...rest, plannedDurationMinutes: edit.durationMinutes, ...(edit.notBefore ? { notBefore: edit.notBefore } : {}) };
      affected.add(day.date);
      break;
    }
  }

  days = days.map((day) => (affected.has(day.date) ? retimeDay(day, ctx) : day));
  const { conflicts, validationStatus } = validatePlan(days, unscheduled, ctx);

  const blockingBefore = new Set(
    validatePlan(current.days, current.unscheduledPlaceIds, ctx).conflicts.filter(isBlocking).map((c) => c.stopIds[0]),
  );
  const introduced = conflicts.filter((c) => isBlocking(c) && !blockingBefore.has(c.stopIds[0]));
  if (introduced.length > 0) return { ok: false, conflicts: introduced };

  return {
    ok: true,
    plan: { days, unscheduledPlaceIds: unscheduled, conflicts, validationStatus, assumptions: current.assumptions ?? planAssumptions(ctx) },
  };
}

const isBlocking = (c: Conflict) => (c.code === "LOCKED_RESERVATION_UNREACHABLE" || c.code === "VISIT_DURATION_TRUNCATED")
  && c.severity === "error";

function bookingChanged(stop: Stop, date: string): EditOutcome {
  return {
    ok: false,
    conflicts: [
      {
        code: "LOCKED_RESERVATION_CHANGED",
        severity: "error",
        date,
        stopIds: [stop.id],
        placeIds: stop.placeId ? [stop.placeId] : [],
        message: `"${stop.title}" is a booking at ${stop.start}, so it can't be moved, retimed or removed in the itinerary.`,
        suggestion: "Change or delete the booking in Trip setup, then regenerate.",
      },
    ],
  };
}

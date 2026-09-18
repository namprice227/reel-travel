import type { Day, LatLng } from "@reel/contracts";
import { checkHours, earliestOpenStart } from "./hours";
import { toLocalTime, toMinutes } from "./time";
import { travelMinutes } from "./travel";
import type { PlannerContext } from "./types";

/**
 * Recompute times for one day, keeping stop order.
 * - Bookings keep their times.
 * - Every other stop starts at the later of (previous end + travel) and its opening time that day.
 * Conflicts are not decided here; validatePlan() reads the result.
 */
export function retimeDay(day: Day, ctx: PlannerContext): Day {
  const prefs = ctx.preferences;
  const placesById = new Map(ctx.places.map((p) => [p.placeId, p]));
  let cursor = toMinutes(prefs.dayStart);
  let here: LatLng | null = prefs.accommodation?.location ?? null;

  const stops = day.stops.map((stop) => {
    const travel = stop.kind === "break" ? 0 : travelMinutes(here, stop.location, prefs.transport);
    const place = stop.kind === "place" && stop.placeId ? placesById.get(stop.placeId) : undefined;
    let start: number;
    let end: number;

    if (stop.kind === "reservation") {
      start = toMinutes(stop.start);
      end = toMinutes(stop.end);
      cursor = Math.max(cursor, end);
    } else {
      const duration = place?.visitMinutes ?? Math.max(5, toMinutes(stop.end) - toMinutes(stop.start));
      // Schedule a lower bound when travel is unknown; validation must expose that uncertainty.
      const arrival = cursor + (travel ?? 0);
      start = place ? (earliestOpenStart(place.openingHours, day.date, arrival, duration) ?? arrival) : arrival;
      end = start + duration;
      cursor = end;
    }
    if (stop.kind !== "break") here = stop.location;

    return {
      ...stop,
      start: toLocalTime(start),
      end: toLocalTime(end),
      travelMinutesBefore: travel,
      hoursCheck: place
        ? checkHours(place.openingHours, day.date, start, end)
        : stop.kind === "place"
          ? ("unknown" as const)
          : ("not_applicable" as const),
    };
  });

  return { date: day.date, stops };
}

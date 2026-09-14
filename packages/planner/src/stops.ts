import type { Reservation, Stop } from "@reel/contracts";
import { checkHours } from "./hours";
import { timePart, toLocalTime } from "./time";
import type { PlannablePlace } from "./types";

export function placeStop(place: PlannablePlace, id: string, date: string, start: number): Stop {
  const end = start + place.visitMinutes;
  return {
    id,
    kind: "place",
    title: place.title,
    placeId: place.placeId,
    reservationId: null,
    location: place.location,
    start: toLocalTime(start),
    end: toLocalTime(end),
    travelMinutesBefore: 0,
    locked: false,
    hoursCheck: checkHours(place.openingHours, date, start, end),
    sourceInspirationIds: place.sourceInspirationIds,
  };
}

export function reservationStop(reservation: Reservation, place: PlannablePlace | undefined, id: string): Stop {
  return {
    id,
    kind: "reservation",
    title: reservation.title,
    placeId: reservation.placeId,
    reservationId: reservation.id,
    location: place?.location ?? null,
    start: timePart(reservation.start),
    end: timePart(reservation.end),
    travelMinutesBefore: 0,
    locked: reservation.locked,
    hoursCheck: "not_applicable",
    sourceInspirationIds: place?.sourceInspirationIds ?? [],
  };
}

export function breakStop(id: string, start: number, minutes: number): Stop {
  return {
    id,
    kind: "break",
    title: "Break",
    placeId: null,
    reservationId: null,
    location: null,
    start: toLocalTime(start),
    end: toLocalTime(start + minutes),
    travelMinutesBefore: 0,
    locked: false,
    hoursCheck: "not_applicable",
    sourceInspirationIds: [],
  };
}

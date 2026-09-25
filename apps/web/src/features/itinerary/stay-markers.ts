import { dayStays, type Accommodation, type LatLng } from "@reel/contracts";
import { travelMinutes } from "@reel/planner";
import type { MapMarker } from "@/components/PlaceMap";

export interface DayStayEnds {
  /** Where the day starts (last night's stay) and ends (tonight's); null when unknown or unnamed. */
  start: Accommodation | null;
  end: Accommodation | null;
  /** Map bookends for located stays, so the day's route runs hotel → stops → hotel. */
  startMarker: MapMarker | null;
  endMarker: MapMarker | null;
}

const marker = (id: string, stay: Accommodation, hideChip: boolean): MapMarker | null =>
  stay.location ? { id, position: stay.location, label: stay.name, icon: "bed", hideChip } : null;

/**
 * The owner's hotel for one day, as map bookends. Owner views only: a shared link never shows where the
 * traveler sleeps. When the day starts and ends at the same hotel, only the start gets a map button.
 */
export function dayStayEnds(stays: readonly Accommodation[], date: string): DayStayEnds {
  const { start, end } = dayStays(stays, date);
  return {
    start,
    end,
    startMarker: start ? marker(`stay-start:${date}`, start, false) : null,
    endMarker: end ? marker(`stay-end:${date}`, end, end === start) : null,
  };
}

/** Stop markers with the day's hotel bookends around them. A day with nothing mapped stays empty. */
export const withStayEnds = (ends: DayStayEnds | null, markers: MapMarker[]): MapMarker[] =>
  ends && markers.length ? [...(ends.startMarker ? [ends.startMarker] : []), ...markers, ...(ends.endMarker ? [ends.endMarker] : [])] : markers;

/** Estimated travel from the day's last located stop back to where the traveler sleeps. */
export function returnMinutes(ends: DayStayEnds | null, lastLocation: LatLng | null, transport: string): number | null {
  if (!ends?.end?.location || !lastLocation) return null;
  const mode = transport === "walk" || transport === "car" ? transport : "transit";
  return travelMinutes(lastLocation, ends.end.location, mode);
}

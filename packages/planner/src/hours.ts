import type { HoursCheck, OpeningHours } from "@reel/contracts";
import { toMinutes, weekday } from "./time";

/** Opening windows on a date as [open, close] minutes, or null when hours are unknown. */
export function openingWindowsOn(hours: OpeningHours, date: string): Array<[number, number]> | null {
  if (hours.status === "unknown") return null;
  const day = weekday(date);
  const windows = hours.windows
    .flatMap((w): Array<[number, number]> => {
      const open = toMinutes(w.open);
      const close = toMinutes(w.close);
      if (w.day === day) return [[open, close <= open ? close + 1440 : close]];
      // An overnight window belongs to its opening weekday, including Saturday -> Sunday.
      if (w.day === (day + 6) % 7 && close <= open && close > 0) return [[0, close]];
      return [];
    }).sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [open, close] of windows) {
    const previous = merged.at(-1);
    if (previous && open <= previous[1]) previous[1] = Math.max(previous[1], close);
    else merged.push([open, close]);
  }
  return merged;
}

export function checkHours(hours: OpeningHours, date: string, start: number, end: number): Exclude<HoursCheck, "not_applicable"> {
  const windows = openingWindowsOn(hours, date);
  if (!windows) return "unknown";
  return windows.some(([open, close]) => open <= start && end <= close) ? "open" : "closed";
}

/**
 * Earliest start >= `earliest` where the whole visit fits an opening window that day.
 * Unknown hours: `earliest` (not checked). Closed all day or no fit: null.
 */
export function earliestOpenStart(hours: OpeningHours, date: string, earliest: number, duration: number): number | null {
  const windows = openingWindowsOn(hours, date);
  if (!windows) return earliest;
  let best: number | null = null;
  for (const [open, close] of windows) {
    const start = Math.max(earliest, open);
    if (start + duration <= close && (best === null || start < best)) best = start;
  }
  return best;
}

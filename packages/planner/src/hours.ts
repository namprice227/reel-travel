import type { HoursCheck, OpeningHours } from "@reel/contracts";
import { toMinutes, weekday } from "./time";

/** Opening windows on a date as [open, close] minutes, or null when hours are unknown. */
function windowsOn(hours: OpeningHours, date: string): Array<[number, number]> | null {
  if (hours.status === "unknown") return null;
  const day = weekday(date);
  return hours.windows
    .filter((w) => w.day === day)
    .map((w) => {
      const open = toMinutes(w.open);
      const close = toMinutes(w.close);
      return [open, close <= open ? close + 24 * 60 : close];
    });
}

export function checkHours(hours: OpeningHours, date: string, start: number, end: number): Exclude<HoursCheck, "not_applicable"> {
  const windows = windowsOn(hours, date);
  if (!windows) return "unknown";
  return windows.some(([open, close]) => open <= start && end <= close) ? "open" : "closed";
}

/**
 * Earliest start >= `earliest` where the whole visit fits an opening window that day.
 * Unknown hours: `earliest` (not checked). Closed all day or no fit: null.
 */
export function earliestOpenStart(hours: OpeningHours, date: string, earliest: number, duration: number): number | null {
  const windows = windowsOn(hours, date);
  if (!windows) return earliest;
  let best: number | null = null;
  for (const [open, close] of windows) {
    const start = Math.max(earliest, open);
    if (start + duration <= close && (best === null || start < best)) best = start;
  }
  return best;
}

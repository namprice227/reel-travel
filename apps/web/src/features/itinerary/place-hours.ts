import type { OpeningHours } from "@reel/contracts";
import { openingWindowsOn } from "@reel/planner";

function clockTime(minutes: number): string {
  if (minutes === 1440) return "24:00";
  const time = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return minutes > 1440 ? `${time} (next day)` : time;
}

/** A planned calendar date, not an open-now claim. Never fills missing provider hours. */
export function hoursForDate(hours: OpeningHours | undefined, date: string): string {
  if (!hours || hours.status === "unknown") return "Hours unknown";
  const day = new Date(`${date}T00:00:00Z`);
  const name = day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const windows = openingWindowsOn(hours, date)!;
  return windows.length ? `${name} hours · ${windows.map(([open, close]) => `${clockTime(open)}–${clockTime(close)}`).join(", ")}` : `Closed on ${name}`;
}

import type { OpeningHours } from "@reel/contracts";

/** A planned calendar date, not an open-now claim. Never fills missing provider hours. */
export function hoursForDate(hours: OpeningHours | undefined, date: string): string {
  if (!hours || hours.status === "unknown") return "Hours unknown";
  const day = new Date(`${date}T00:00:00Z`);
  const name = day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const windows = hours.windows.filter((w) => w.day === day.getUTCDay()).sort((a, b) => a.open.localeCompare(b.open));
  return windows.length ? `${name} hours · ${windows.map((w) => `${w.open}–${w.close}`).join(", ")}` : `Closed on ${name}`;
}

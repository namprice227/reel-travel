const MINUTES_PER_DAY = 24 * 60;

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Clamps to 00:00–23:59; the validator reports days that run past the traveler's day end. */
export function toLocalTime(minutes: number): string {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY - 1);
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** 0 = Sunday. Calendar weekday of a date, independent of any timezone. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export const datePart = (localDateTime: string) => localDateTime.slice(0, 10);
export const timePart = (localDateTime: string) => localDateTime.slice(11, 16);

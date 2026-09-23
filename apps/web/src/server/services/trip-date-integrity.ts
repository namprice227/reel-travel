import { isDatedTrip, type DatedTrip, type Reservation, type Trip, type ValidationIssue } from "@reel/contracts";
import { invalidState } from "../errors";

/** Planning, bookings and sharing need real dates. A draft trip from a source has none until the traveler adds them. */
export function requireDatedTrip(trip: Trip): DatedTrip {
  if (!isDatedTrip(trip)) throw invalidState("Add travel dates and a timezone in Trip setup to plan this trip.");
  return trip;
}

/** Accommodation checkOut stores the last occupied night, before the trip's departure day. */
export function tripDateIssues(
  trip: Pick<DatedTrip, "startDate" | "endDate" | "preferences">,
  reservations: Reservation[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const booking of reservations) {
    const date = booking.start.slice(0, 10);
    if (date < trip.startDate || date > trip.endDate) {
      issues.push({
        path: "startDate",
        message: `Booking “${booking.title}” on ${date} is outside the trip dates. Move or remove it before changing the trip dates.`,
      });
    }
  }
  trip.preferences.accommodations.forEach((stay, index) => {
    if (!stay.checkIn && !stay.checkOut) return;
    const path = `preferences.accommodations.${index}`;
    if (!stay.checkIn || !stay.checkOut) {
      issues.push({ path, message: `Give “${stay.name}” both its first and last night, or neither.` });
    } else if (stay.checkOut < stay.checkIn || stay.checkIn < trip.startDate || stay.checkOut >= trip.endDate) {
      issues.push({
        path,
        message: `Hotel “${stay.name}” needs nights from ${trip.startDate} through the night before ${trip.endDate}. Edit or remove this stay before changing the trip dates.`,
      });
    }
  });
  return issues;
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { placeFixtures } from "@reel/contracts/fixtures";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-date-integrity-"));
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("REEL_DATA_DIR", directory);
const { repos } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const trips = await import("../../apps/web/src/server/services/trips");
const { generateItinerary } = await import("../../apps/web/src/server/services/itinerary");

afterAll(() => {
  if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("reel-date-integrity-")) throw Error("Unsafe cleanup");
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture() {
  const user = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  const trip = await trips.createTrip(user, { title: "Synthetic dates", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-05" });
  return { user, trip };
}

it("rejects date shortening across a fixed booking without changing the trip, then permits it after removal", async () => {
  const { user, trip } = await fixture();
  const booking = await trips.createReservation(user, trip.id, { title: "Day five dinner", start: "2026-10-05T19:00", end: "2026-10-05T20:00", locked: true });
  await expect(trips.updateTrip(user, trip.id, { endDate: "2026-10-03" }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("Day five dinner") });
  expect((await trips.getTrip(user, trip.id)).endDate).toBe("2026-10-05");
  await expect(trips.createReservation(user, trip.id, { title: "Too late", start: "2026-10-06T19:00", end: "2026-10-06T20:00", locked: true }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await trips.deleteReservation(user, trip.id, booking.id);
  expect((await trips.updateTrip(user, trip.id, { endDate: "2026-10-03" })).endDate).toBe("2026-10-03");
});

it("rejects hotel nights on the departure day and date changes that strand a saved hotel", async () => {
  const { user, trip } = await fixture();
  const stay = (checkOut: string) => ({ name: "Synthetic hotel", location: null, checkIn: "2026-10-01", checkOut });
  await expect(trips.updateTrip(user, trip.id, { preferences: { accommodations: [stay("2026-10-05")] } }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("Synthetic hotel") });
  await trips.updateTrip(user, trip.id, { preferences: { accommodations: [stay("2026-10-04")] } });
  await expect(trips.updateTrip(user, trip.id, { endDate: "2026-10-03" }))
    .rejects.toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("Synthetic hotel") });
  expect((await trips.getTrip(user, trip.id)).endDate).toBe("2026-10-05");
  await trips.updateTrip(user, trip.id, { preferences: { accommodations: [stay("2026-10-02")] } });
  expect((await trips.updateTrip(user, trip.id, { endDate: "2026-10-03" })).endDate).toBe("2026-10-03");
});

it("reports a legacy out-of-range booking before invoking the itinerary generator", async () => {
  const { user, trip } = await fixture();
  await repos().places.insert({ ...structuredClone(placeFixtures.confirmed), id: `place_${crypto.randomUUID()}`, tripId: trip.id });
  await trips.createReservation(user, trip.id, { title: "Day five dinner", start: "2026-10-05T19:00", end: "2026-10-05T20:00", locked: true });
  await repos().trips.update({ ...trip, endDate: "2026-10-03" }); // Simulates pre-fix persisted data.
  await expect(generateItinerary(user, trip.id, { expectedVersion: null }))
    .rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("Day five dinner") });
});

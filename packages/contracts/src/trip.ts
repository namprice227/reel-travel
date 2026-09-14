import { z } from "zod";
import { Id, IsoDate, LatLng, LocalDateTime, LocalTime, Timestamp, Timezone } from "./common";
import { named } from "./registry";

/** Scope: one destination, one owner, a short trip. Enforced by the server. */
export const MAX_TRIP_DAYS = 7;

export const Pace = named(z.enum(["relaxed", "balanced", "packed"]), "Pace");
export type Pace = z.infer<typeof Pace>;
export const TransportMode = named(z.enum(["walk", "transit", "car"]), "TransportMode");
export type TransportMode = z.infer<typeof TransportMode>;
export const BudgetLevel = named(z.enum(["low", "medium", "high"]), "BudgetLevel");
export type BudgetLevel = z.infer<typeof BudgetLevel>;

export const Accommodation = named(
  z.object({
    name: z.string().trim().min(1).max(200),
    location: LatLng.nullable(),
  }),
  "Accommodation",
);
export type Accommodation = z.infer<typeof Accommodation>;

export const TripPreferences = named(
  z.object({
    pace: Pace,
    dayStart: LocalTime,
    dayEnd: LocalTime,
    transport: TransportMode,
    /** Total break time the planner reserves per day. */
    breakMinutes: z.number().int().min(0).max(240),
    budget: BudgetLevel.nullable(),
    interests: z.array(z.string().trim().min(1).max(40)).max(20),
    /** Confirmed place ids the planner schedules first. */
    mustVisitPlaceIds: z.array(Id).max(50),
    accommodation: Accommodation.nullable(),
  }),
  "TripPreferences",
);
export type TripPreferences = z.infer<typeof TripPreferences>;

export const defaultTripPreferences: TripPreferences = {
  pace: "balanced",
  dayStart: "09:00",
  dayEnd: "21:00",
  transport: "transit",
  breakMinutes: 60,
  budget: null,
  interests: [],
  mustVisitPlaceIds: [],
  accommodation: null,
};

export const Trip = named(
  z.object({
    id: Id,
    ownerId: Id,
    title: z.string().min(1).max(120),
    destination: z.string().min(1).max(120),
    timezone: Timezone,
    startDate: IsoDate,
    endDate: IsoDate,
    preferences: TripPreferences,
    /** Null until the first itinerary is generated. */
    currentItineraryVersion: z.number().int().positive().nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  }),
  "Trip",
);
export type Trip = z.infer<typeof Trip>;

export const CreateTripInput = named(
  z.object({
    title: z.string().trim().min(1).max(120),
    destination: z.string().trim().min(1).max(120),
    timezone: Timezone,
    startDate: IsoDate,
    endDate: IsoDate,
  }),
  "CreateTripInput",
  `endDate >= startDate and at most ${MAX_TRIP_DAYS} days (checked by the server)`,
);
export type CreateTripInput = z.infer<typeof CreateTripInput>;

export const UpdateTripInput = named(
  z.object({
    title: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().min(1).max(120).optional(),
    timezone: Timezone.optional(),
    startDate: IsoDate.optional(),
    endDate: IsoDate.optional(),
    /** Partial: only the fields sent are changed. */
    preferences: TripPreferences.partial().optional(),
  }),
  "UpdateTripInput",
);
export type UpdateTripInput = z.infer<typeof UpdateTripInput>;

export const Reservation = named(
  z.object({
    id: Id,
    tripId: Id,
    title: z.string().min(1).max(200),
    /** Optional link to a confirmed place; supplies the map location. */
    placeId: Id.nullable(),
    start: LocalDateTime,
    end: LocalDateTime,
    /** Locked reservations never move during generation or edits. */
    locked: z.boolean(),
    note: z.string().max(500).nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  }),
  "Reservation",
);
export type Reservation = z.infer<typeof Reservation>;

export const CreateReservationInput = named(
  z.object({
    title: z.string().trim().min(1).max(200),
    placeId: Id.nullable().optional(),
    start: LocalDateTime,
    end: LocalDateTime,
    locked: z.boolean().default(true),
    note: z.string().max(500).nullable().optional(),
  }),
  "CreateReservationInput",
  "Same-day booking: end after start, both on the same date (checked by the server)",
);
export type CreateReservationInput = z.input<typeof CreateReservationInput>;

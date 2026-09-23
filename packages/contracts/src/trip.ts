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
    /** First night of this stay; null with checkOut means it covers every day the dated stays don't. */
    checkIn: IsoDate.nullable().default(null),
    /** Last night of this stay. */
    checkOut: IsoDate.nullable().default(null),
  }),
  "Accommodation",
  "checkOut must not be before checkIn (checked by the server)",
);
export type Accommodation = z.infer<typeof Accommodation>;

/**
 * The stay a day starts from: the dated stay covering it, otherwise the first undated stay.
 * A trip with one hotel keeps working by listing it with no dates.
 */
export function stayOn(stays: readonly Accommodation[], date: string): Accommodation | null {
  const dated = stays.find((s) => s.checkIn && s.checkOut && s.checkIn <= date && date <= s.checkOut);
  return dated ?? stays.find((s) => !s.checkIn && !s.checkOut) ?? null;
}

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
    /** Where the traveler sleeps, in date order. Several stays let one trip change hotel part-way. */
    accommodations: z.array(Accommodation).max(MAX_TRIP_DAYS).default([]),
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
  accommodations: [],
};

/** Where a draft trip came from. The source's day count is a hint, not a travel date. */
export const TripDraftSource = named(
  z.object({
    sourceReelId: Id,
    /** Trip length stated by the source, when it stated one. */
    tripDays: z.number().int().min(1).max(30).nullable(),
  }),
  "TripDraftSource",
);
export type TripDraftSource = z.infer<typeof TripDraftSource>;

export const TripStatus = named(z.enum(["draft", "planned"]), "TripStatus",
  "draft: created from a source without travel dates; planned: dates and timezone set");
export type TripStatus = z.infer<typeof TripStatus>;

export const Trip = named(
  z.object({
    id: Id,
    ownerId: Id,
    title: z.string().min(1).max(120),
    destination: z.string().min(1).max(120),
    /** Absent on older trips, which are planned. */
    status: TripStatus.default("planned"),
    /** Null only while status is draft. */
    timezone: Timezone.nullable(),
    startDate: IsoDate.nullable(),
    endDate: IsoDate.nullable(),
    draft: TripDraftSource.nullable().default(null),
    /** Owner-uploaded cover bytes live in private asset storage; null uses the illustrated fallback. */
    coverAssetId: Id.nullable().default(null),
    preferences: TripPreferences,
    /** Places the traveler ticked for this trip. Absent on older trips, which retain confirmed-place behavior. */
    selectedPlaceIds: z.array(Id).max(100).optional(),
    /** Null until the first itinerary is generated. */
    currentItineraryVersion: z.number().int().positive().nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  }).refine((trip) => trip.status === "draft" || (trip.timezone && trip.startDate && trip.endDate), {
    message: "A planned trip needs a timezone, start date and end date.",
  }),
  "Trip",
);
export type Trip = z.infer<typeof Trip>;
/** A trip the planner can use: dates and timezone are set. */
export type DatedTrip = Trip & { timezone: string; startDate: string; endDate: string };
export const isDatedTrip = (trip: Trip): trip is DatedTrip => Boolean(trip.timezone && trip.startDate && trip.endDate);

// Keep cover uploads below the hosted request-body limit. The database stores metadata only.
export const MAX_TRIP_COVER_BYTES = 4 * 1024 * 1024;
export const TRIP_COVER_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const UploadTripCoverInput = named(
  z.object({
    file: z.file().min(1).max(MAX_TRIP_COVER_BYTES).mime([...TRIP_COVER_CONTENT_TYPES]),
    /** Last loaded timestamp; rejects replacing a cover from a stale tab. */
    expectedUpdatedAt: Timestamp.optional(),
  }),
  "UploadTripCoverInput",
  "multipart/form-data fields",
);
export type UploadTripCoverInput = z.infer<typeof UploadTripCoverInput>;

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

/**
 * Preferences in an update: every field optional and no defaults, so a field left out keeps its saved value.
 * (`TripPreferences.partial()` would still fill `accommodations` with its `[]` default and erase saved stays.)
 */
const TripPreferencesPatch = TripPreferences.extend({ accommodations: z.array(Accommodation).max(MAX_TRIP_DAYS) }).partial();

export const UpdateTripInput = named(
  z.object({
    /** Last loaded timestamp; browser forms use this to reject stale-tab saves. */
    expectedUpdatedAt: Timestamp.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().min(1).max(120).optional(),
    timezone: Timezone.optional(),
    startDate: IsoDate.optional(),
    endDate: IsoDate.optional(),
    /** Partial: only the fields sent are changed. */
    preferences: TripPreferencesPatch.optional(),
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

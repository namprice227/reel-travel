import { z } from "zod";
import { Id, IsoDate, LatLng, LocalTime, Timestamp } from "./common";
import { named } from "./registry";
import { OpeningHours } from "./place";

export const StopKind = named(z.enum(["place", "reservation", "break", "meal", "suggestion"]), "StopKind");
export type StopKind = z.infer<typeof StopKind>;
export const HoursCheck = named(z.enum(["open", "closed", "unknown", "not_applicable"]), "HoursCheck");
export type HoursCheck = z.infer<typeof HoursCheck>;

/** Retrieved venue suggestion; never a user-confirmed place or booking. */
export const SuggestedVenue = named(z.object({
  provider: z.literal("google"), providerPlaceId: z.string().min(1).max(300),
  fetchedAt: Timestamp, openingHours: OpeningHours,
  category: z.string().nullable(), priceLevel: z.number().int().min(0).max(4).nullable(),
  attribution: z.string().max(2000),
}), "SuggestedVenue");
export type SuggestedVenue = z.infer<typeof SuggestedVenue>;

export const Stop = named(
  z.object({
    /** Stable across edits: moving a stop keeps its id. */
    id: Id,
    kind: StopKind,
    title: z.string().min(1),
    placeId: Id.nullable(),
    reservationId: Id.nullable(),
    location: LatLng.nullable(),
    start: LocalTime,
    end: LocalTime,
    /** Estimated travel from the previous stop (or accommodation); null means unknown. Breaks use 0. */
    travelMinutesBefore: z.number().int().min(0).nullable(),
    locked: z.boolean(),
    hoursCheck: HoursCheck,
    sourceInspirationIds: z.array(Id),
    /** Intended activity/break duration, not a provider fact; retained before edit-time clamping. */
    plannedDurationMinutes: z.number().int().min(1).max(1439).optional(),
    suggestedArea: z.string().max(160).optional(),
    planningNote: z.string().max(500).optional(),
    suggestedVenue: SuggestedVenue.optional(),
  }),
  "Stop",
);
export type Stop = z.infer<typeof Stop>;

export const Day = named(z.object({ date: IsoDate, stops: z.array(Stop) }), "Day");
export type Day = z.infer<typeof Day>;

export const ConflictCode = named(
  z.enum([
    "OUTSIDE_OPENING_HOURS",
    "HOURS_UNKNOWN",
    "TRAVEL_UNKNOWN",
    "OVERLAP",
    "LOCKED_RESERVATION_UNREACHABLE",
    "LOCKED_RESERVATION_CHANGED",
    "DAY_OVERFLOW",
    "PLACE_UNSCHEDULED",
    "RESERVATION_OUTSIDE_TRIP",
    "VISIT_DURATION_TRUNCATED",
  ]),
  "ConflictCode",
);
export type ConflictCode = z.infer<typeof ConflictCode>;

export const Conflict = named(
  z.object({
    code: ConflictCode,
    severity: z.enum(["error", "warning", "info"]),
    date: IsoDate.nullable(),
    stopIds: z.array(Id),
    placeIds: z.array(Id),
    /** Plain-language explanation for the traveler. */
    message: z.string(),
    suggestion: z.string().nullable(),
  }),
  "Conflict",
);
export type Conflict = z.infer<typeof Conflict>;

/** partially_checked: no errors, but some opening hours or travel were unknown. */
export const ValidationStatus = named(z.enum(["valid", "partially_checked", "has_conflicts"]), "ValidationStatus");
export type ValidationStatus = z.infer<typeof ValidationStatus>;

/** Provider-neutral proposal: saved-place facts stay authoritative; additional ideas are explicitly unverified. */
export const ItineraryProposal = named(z.strictObject({
  days: z.array(z.strictObject({
    date: IsoDate,
    stops: z.array(z.strictObject({
      kind: StopKind,
      referenceId: Id.nullable(),
      start: LocalTime,
      durationMinutes: z.number().int().min(15).max(480).nullable().optional(),
      title: z.string().trim().min(1).max(160).optional(),
      area: z.string().trim().min(1).max(160).optional(),
      reason: z.string().trim().min(1).max(500).optional(),
    })).max(24),
  })).min(1).max(7),
  seasonalAdvice: z.string().max(800).nullable().optional(),
}), "ItineraryProposal");
export type ItineraryProposal = z.infer<typeof ItineraryProposal>;

export const GenerationInfo = named(z.object({
  provider: z.string().min(1).max(100), model: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100), inputHash: z.string().length(64),
  /** Total provider calls, including repair; absent on older saved plans. */
  attempts: z.number().int().min(1).max(2).optional(),
  durationMs: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
}), "GenerationInfo");
export type GenerationInfo = z.infer<typeof GenerationInfo>;

/** Heuristic practical assessment, separate from hard schedule validity. No claim of optimality. */
export const PlanQuality = named(z.object({
  score: z.number().int().min(0).max(100),
  savedPlacesScheduled: z.number().int().nonnegative(),
  savedPlacesTotal: z.number().int().nonnegative(),
  repairApplied: z.boolean(),
  issues: z.array(z.object({
    code: z.enum(["OMITTED_PLACE", "MEAL_WINDOW", "EXCESS_TRAVEL", "RUSHED_VISIT", "PREFERENCES", "FILLER", "WEATHER"]),
    date: IsoDate.nullable(),
    placeIds: z.array(Id),
    message: z.string(),
    alternatives: z.array(z.string()),
  })),
}), "PlanQuality");
export type PlanQuality = z.infer<typeof PlanQuality>;

/** One immutable saved version. Magazine, timeline and map all render the same version. */
export const Itinerary = named(
  z.object({
    id: Id,
    tripId: Id,
    version: z.number().int().positive(),
    createdAt: Timestamp,
    /** What produced this version, e.g. "generated", "move_stop". */
    change: z.string(),
    days: z.array(Day),
    unscheduledPlaceIds: z.array(Id),
    conflicts: z.array(Conflict),
    validationStatus: ValidationStatus,
    /** Estimates the traveler should know about, e.g. straight-line travel times. */
    assumptions: z.array(z.string()),
    /** Hash of places, reservations, dates and preferences used; drives itinerary.get "stale". */
    inputFingerprint: z.string(),
    /** Provider choices used for routing; an automatic choice is never a traveler confirmation. */
    resolvedPlaces: z.array(z.object({ placeId: Id, providerPlaceId: z.string().min(1).max(300) })).optional(),
    /** Ticked places without a provider location. They remain selected for a later retry. */
    unresolvedPlaceIds: z.array(Id).optional(),
    /** Ticked references already represented by another selected venue. */
    duplicatePlaceIds: z.array(Id).optional(),
    /** Generation provenance only; absent on old plans and on manually edited versions. */
    generation: GenerationInfo.optional(),
    quality: PlanQuality.optional(),
  }),
  "Itinerary",
);
export type Itinerary = z.infer<typeof Itinerary>;

/** Share-safe projection: no source links back to private saves. */
export const PublicStop = named(Stop.omit({ sourceInspirationIds: true }), "PublicStop");
export const PublicItinerary = named(
  z.object({
    version: z.number().int().positive(),
    createdAt: Timestamp,
    days: z.array(z.object({ date: IsoDate, stops: z.array(PublicStop) })),
    conflicts: z.array(Conflict),
    validationStatus: ValidationStatus,
    assumptions: z.array(z.string()),
  }),
  "PublicItinerary",
);
export type PublicItinerary = z.infer<typeof PublicItinerary>;
export type PublicStop = z.infer<typeof PublicStop>;

export const ItineraryEdit = named(
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("move_stop"), stopId: Id, toDate: IsoDate, toIndex: z.number().int().min(0) }),
    z.object({ type: z.literal("remove_stop"), stopId: Id }),
    z.object({ type: z.literal("add_place"), placeId: Id, date: IsoDate, index: z.number().int().min(0) }),
    z.object({ type: z.literal("replace_stop"), stopId: Id, placeId: Id }),
  ]),
  "ItineraryEdit",
);
export type ItineraryEdit = z.infer<typeof ItineraryEdit>;

export const GenerateItineraryInput = named(
  z.object({
    /** Current version the client has seen; null when none exists yet. */
    expectedVersion: z.number().int().positive().nullable(),
  }),
  "GenerateItineraryInput",
);
export type GenerateItineraryInput = z.infer<typeof GenerateItineraryInput>;

export const EditItineraryInput = named(
  z.object({
    expectedVersion: z.number().int().positive(),
    edit: ItineraryEdit,
    /** true: validate and return the result without saving. */
    dryRun: z.boolean().default(false),
  }),
  "EditItineraryInput",
);
export type EditItineraryInput = z.input<typeof EditItineraryInput>;

/** Where a place added while editing a day comes from. */
export const AddPlaceSource = named(
  z.discriminatedUnion("kind", [
    /** A place already in this trip, planned or not. */
    z.object({ kind: z.literal("trip"), placeId: Id }),
    /** A saved place from another trip of this account; copied in with its evidence. */
    z.object({ kind: z.literal("saved"), placeId: Id }),
    /** A place from an account reel in the library; copied in with its evidence. */
    z.object({ kind: z.literal("account"), accountPlaceId: Id }),
  ]),
  "AddPlaceSource",
);
export type AddPlaceSource = z.infer<typeof AddPlaceSource>;

export const AddItineraryPlaceInput = named(
  z.object({
    expectedVersion: z.number().int().positive(),
    source: AddPlaceSource,
    /** The branch the traveler chose for a place with several matches; confirmed in the same save. */
    providerPlaceId: z.string().min(1).max(300).optional(),
    at: z.discriminatedUnion("type", [
      /** Insert on a day; the end of the day when index is omitted. */
      z.object({ type: z.literal("day"), date: IsoDate, index: z.number().int().min(0).optional() }),
      /** Swap an existing non-booking stop for this place. */
      z.object({ type: z.literal("replace"), stopId: Id }),
    ]),
  }),
  "AddItineraryPlaceInput",
);
export type AddItineraryPlaceInput = z.infer<typeof AddItineraryPlaceInput>;

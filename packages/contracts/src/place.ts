import { z } from "zod";
import { Id, LatLng, LocalTime, Timestamp } from "./common";
import { SourceType } from "./inspiration";
import { named } from "./registry";

export const OpeningWindow = named(
  z.object({
    /** 0 = Sunday ... 6 = Saturday. */
    day: z.number().int().min(0).max(6),
    open: LocalTime,
    close: LocalTime,
  }),
  "OpeningWindow",
);
export type OpeningWindow = z.infer<typeof OpeningWindow>;

/** Never guess hours: "unknown" makes the plan partially checked. */
export const OpeningHours = named(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("known"), windows: z.array(OpeningWindow) }),
    z.object({ status: z.literal("unknown") }),
  ]),
  "OpeningHours",
);
export type OpeningHours = z.infer<typeof OpeningHours>;

/** Facts from a place provider, never from model prose. */
export const PlaceDetails = named(
  z.object({
    /** "fixture" for synthetic dev data. */
    provider: z.string().min(1),
    providerPlaceId: z.string().min(1),
    fetchedAt: Timestamp,
    category: z.string().nullable(),
    openingHours: OpeningHours,
    typicalVisitMinutes: z.number().int().positive().nullable(),
    priceLevel: z.number().int().min(0).max(4).nullable(),
    /** Fields the provider could not supply, shown to the traveler as unknown. */
    unknownFields: z.array(z.string()),
    attribution: z.string(),
  }),
  "PlaceDetails",
);
export type PlaceDetails = z.infer<typeof PlaceDetails>;

/** One real-world match for a clue. Several options = several branches. */
export const PlaceOption = named(
  z.object({
    providerPlaceId: z.string().min(1),
    name: z.string().min(1),
    address: z.string().nullable(),
    location: LatLng,
    details: PlaceDetails,
  }),
  "PlaceOption",
);
export type PlaceOption = z.infer<typeof PlaceOption>;

/** Why a place was suggested: which save, and what in it. */
export const Evidence = named(
  z.object({
    inspirationId: Id,
    sourceType: SourceType,
    /** What the extractor looked up, e.g. "Kumo Ramen". */
    clue: z.string().min(1),
    /** Short quote from the save; null for screenshots without readable text. */
    excerpt: z.string().nullable(),
    extractedAt: Timestamp,
  }),
  "Evidence",
);
export type Evidence = z.infer<typeof Evidence>;

/**
 * pending    one option found; traveler confirms or rejects
 * ambiguous  several branches; traveler must pick one
 * not_found  no match; traveler rejects or adds details to the save
 * confirmed  usable by the planner (only via places.confirm)
 * rejected   ignored by the planner
 */
export const PlaceStatus = named(
  z.enum(["pending", "ambiguous", "not_found", "confirmed", "rejected"]),
  "PlaceStatus",
);
export type PlaceStatus = z.infer<typeof PlaceStatus>;

export const CandidatePlace = named(
  z.object({
    id: Id,
    tripId: Id,
    status: PlaceStatus,
    /** Display name: the clue until confirmed, then the chosen option's name. */
    name: z.string().min(1),
    /** Duplicates merge by appending evidence, so one place can cite many saves. */
    evidence: z.array(Evidence).min(1),
    options: z.array(PlaceOption),
    /** Set when confirmed. */
    selected: PlaceOption.nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  }),
  "CandidatePlace",
);
export type CandidatePlace = z.infer<typeof CandidatePlace>;

export const ConfirmPlaceInput = named(
  z.object({ providerPlaceId: z.string().min(1) }),
  "ConfirmPlaceInput",
  "Which option to confirm; required even when only one option exists",
);
export type ConfirmPlaceInput = z.infer<typeof ConfirmPlaceInput>;

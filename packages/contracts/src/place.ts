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
/**
 * One provider photo. `ref` is the provider's own handle (for Google, "places/<id>/photos/<ref>");
 * the image itself is fetched server-side, because the provider key must never reach the browser.
 */
export const PlacePhoto = named(
  z.object({
    ref: z.string().min(1).max(600),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Who took it: shown next to the photo, as the provider's terms require. */
    attribution: z.string(),
  }),
  "PlacePhoto",
);
export type PlacePhoto = z.infer<typeof PlacePhoto>;

/**
 * One authentic provider review. Rendered verbatim without summarisation or re-ranking;
 * untrusted user-contributed content as provider policies and security rules require.
 */
export const ProviderReview = named(
  z.object({
    text: z.string(),
    authorName: z.string(),
    relativeTime: z.string().nullable().default(null),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    authorPhotoUrl: z.string().nullable().default(null),
    googleMapsUri: z.string().nullable().default(null),
  }),
  "ProviderReview",
);
export type ProviderReview = z.infer<typeof ProviderReview>;

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
    /** Provider photos, newest lookup wins. Empty when the provider has none (all fixture places). */
    photos: z.array(PlacePhoto).max(10).default([]),
    /** Short editorial summary from the provider, null when none was supplied. */
    summary: z.string().nullable().default(null),
    /** Average rating on a 1-5 scale, null when unrated or unsupported. */
    rating: z.number().nullable().default(null),
    /** Number of user ratings backing the rating score. */
    ratingCount: z.number().int().nonnegative().nullable().default(null),
    /** Official website URL of the venue. */
    websiteUrl: z.string().nullable().default(null),
    /** Direct provider URL (e.g. Google Maps link). */
    providerUrl: z.string().nullable().default(null),
    /** Formatted phone number for reservations or inquiries. */
    phone: z.string().nullable().default(null),
    /** Up to 5 authentic provider reviews, verbatim without summarisation or re-ranking. */
    reviews: z.array(ProviderReview).max(5).default([]),
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

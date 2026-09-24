import { z } from "zod";
import { Id, LatLng, LocalTime, Timestamp } from "./common";
import { SourceType } from "./inspiration";
import { named } from "./registry";
import { CountryCode } from "./countries";

export const SourceCategory = named(z.enum(["food", "attraction", "other"]), "SourceCategory");
/** Source-supported AI labels, separate from provider facts and user confirmation. */
export const SourceClassification = named(z.object({
  source: z.literal("ai"),
  country: z.object({ code: CountryCode, excerpt: z.string().min(1).max(300) }).nullable(),
  category: z.object({ value: SourceCategory, excerpt: z.string().min(1).max(300) }).nullable(),
}), "SourceClassification");
export type SourceClassification = z.infer<typeof SourceClassification>;

const HttpsUrl = z.url().max(2_048).refine(value => new URL(value).protocol === "https:", "Expected HTTPS");
/** Ephemeral display response only. Never store photo resource names or image URLs in candidate documents. */
export const PlacePhotoResponse = named(z.object({
  imageUrl: HttpsUrl,
  googleMapsUrl: HttpsUrl,
  authors: z.array(z.object({ name: z.string().min(1), url: HttpsUrl.nullable(), avatarUrl: HttpsUrl.nullable() })),
}), "PlacePhotoResponse");
export type PlacePhotoResponse = z.infer<typeof PlacePhotoResponse>;

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
    attribution: z.string().max(500),
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
    text: z.string().max(4_000),
    authorName: z.string().min(1).max(200),
    relativeTime: z.string().max(100).nullable().default(null),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    authorPhotoUrl: HttpsUrl.nullable().default(null),
    googleMapsUri: HttpsUrl.nullable().default(null),
  }),
  "ProviderReview",
);
export type ProviderReview = z.infer<typeof ProviderReview>;

export const PlaceDetails = named(
  z.object({
    /** "fixture" for synthetic dev data. */
    provider: z.string().min(1).max(50),
    providerPlaceId: z.string().min(1).max(300),
    fetchedAt: Timestamp,
    category: z.string().max(200).nullable(),
    openingHours: OpeningHours,
    typicalVisitMinutes: z.number().int().positive().nullable(),
    priceLevel: z.number().int().min(0).max(4).nullable(),
    /** Fields the provider could not supply, shown to the traveler as unknown. */
    unknownFields: z.array(z.string().min(1).max(100)).max(50),
    attribution: z.string().max(2_000),
    /** Legacy photo metadata retained for compatibility; new Google imports leave this empty and fetch fresh display photos. */
    photos: z.array(PlacePhoto).max(10).default([]),
    /** Short editorial summary from the provider, null when none was supplied. */
    summary: z.string().max(2_000).nullable().default(null),
    /** Average rating on a 1-5 scale, null when unrated or unsupported. */
    rating: z.number().nullable().default(null),
    /** Number of user ratings backing the rating score. */
    ratingCount: z.number().int().nonnegative().nullable().default(null),
    /** Official website URL of the venue. */
    websiteUrl: HttpsUrl.nullable().default(null),
    /** Direct provider URL (e.g. Google Maps link). */
    providerUrl: HttpsUrl.nullable().default(null),
    /** Formatted phone number for reservations or inquiries. */
    phone: z.string().max(100).nullable().default(null),
    /** Up to 5 authentic provider reviews, verbatim without summarisation or re-ranking. */
    reviews: z.array(ProviderReview).max(5).default([]),
    /** Normalized cuisine and venue type tags (e.g. "Tempura", "Izakaya", "Bar"). */
    types: z.array(z.string().min(1).max(100)).max(20).default([]),
    /** Formatted price range text (e.g. "¥4,000 – ¥10,000"). */
    priceRange: z.string().max(100).nullable().default(null),
    /** Dine-in service available. */
    dineIn: z.boolean().nullable().default(null),
    /** Takeout service available. */
    takeout: z.boolean().nullable().default(null),
    /** Delivery service available. */
    delivery: z.boolean().nullable().default(null),
    /** Table reservations accepted or available. */
    reservable: z.boolean().nullable().default(null),
    /** Serves vegetarian options. */
    servesVegetarianFood: z.boolean().nullable().default(null),
    /** Serves beer. */
    servesBeer: z.boolean().nullable().default(null),
    /** Serves wine. */
    servesWine: z.boolean().nullable().default(null),
    /** Outdoor patio or terrace seating available. */
    outdoorSeating: z.boolean().nullable().default(null),
    /** Suitable for children. */
    goodForChildren: z.boolean().nullable().default(null),
    /** Suitable for groups. */
    goodForGroups: z.boolean().nullable().default(null),
    /** Restroom available for patrons. */
    restroom: z.boolean().nullable().default(null),
    /** Accepted payment methods from provider. */
    paymentOptions: z.object({
      acceptsCreditCards: z.boolean().nullable().default(null),
      acceptsDebitCards: z.boolean().nullable().default(null),
      acceptsCashOnly: z.boolean().nullable().default(null),
      acceptsNfc: z.boolean().nullable().default(null),
    }).nullable().default(null),
    /** Accessibility capabilities from provider. */
    accessibilityOptions: z.object({
      wheelchairAccessibleEntrance: z.boolean().nullable().default(null),
      wheelchairAccessibleSeating: z.boolean().nullable().default(null),
    }).nullable().default(null),
  }),
  "PlaceDetails",
);
export type PlaceDetails = z.infer<typeof PlaceDetails>;

/** One real-world match for a clue. Several options = several branches. */
export const PlaceOption = named(
  z.object({
    providerPlaceId: z.string().min(1).max(300),
    name: z.string().min(1).max(300),
    address: z.string().max(1_000).nullable(),
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
    /** Name extracted from the source, e.g. "Kumo Ramen". */
    clue: z.string().min(1),
    /** Source-supported area/context; unverified. Optional for older records. */
    hint: z.string().max(60).nullable().optional(),
    /** Absent on older records; null labels mean the source did not support classification. */
    classification: SourceClassification.optional(),
    /** Short quote from the save; null for screenshots without readable text. */
    excerpt: z.string().nullable(),
    /** Day of the source's own itinerary ("Day 2"), a planning hint only. Absent on older records. */
    sourceDay: z.number().int().min(1).max(30).nullable().optional(),
    extractedAt: Timestamp,
  }),
  "Evidence",
);
export type Evidence = z.infer<typeof Evidence>;

/**
 * pending    one option found; traveler confirms or rejects
 * unverified extracted from source; no provider lookup performed
 * ambiguous  several branches; traveler must pick one
 * not_found  no match; traveler rejects or adds details to the save
 * confirmed  usable by the planner (only via places.confirm)
 * rejected   ignored by the planner
 */
export const PlaceStatus = named(
  z.enum(["unverified", "pending", "ambiguous", "not_found", "confirmed", "rejected"]),
  "PlaceStatus",
);
export type PlaceStatus = z.infer<typeof PlaceStatus>;

export const CandidatePlace = named(
  z.object({
    id: Id,
    tripId: Id,
    /** Original candidate when copied from another owned trip; supports repeat picks without duplicate rows. */
    copiedFromPlaceId: Id.optional(),
    /** Account-library idea when copied from a saved reel; supports repeat picks without duplicate rows. */
    copiedFromAccountPlaceId: Id.optional(),
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

export const CopyPlacesInput = named(
  z.object({
    placeIds: z.array(Id).max(100).optional(),
    accountPlaceIds: z.array(Id).max(100).optional(),
  }).refine(
    value => (value.placeIds?.length ?? 0) + (value.accountPlaceIds?.length ?? 0) >= 1,
    { message: "Choose at least one saved place." },
  ).refine(
    value => (value.placeIds?.length ?? 0) + (value.accountPlaceIds?.length ?? 0) <= 100,
    { message: "Choose at most 100 saved places." },
  ),
  "CopyPlacesInput",
  "Trip candidates or account-reel places from this account to reuse in a trip",
);
export type CopyPlacesInput = z.infer<typeof CopyPlacesInput>;

export const SelectPlacesInput = named(
  z.object({ placeIds: z.array(Id).max(100), expectedUpdatedAt: Timestamp.optional() }),
  "SelectPlacesInput",
  "Replace the trip's ticked places; no provider branch confirmation is required",
);
export type SelectPlacesInput = z.infer<typeof SelectPlacesInput>;

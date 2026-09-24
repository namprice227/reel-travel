import { z } from "zod";
import { Id, Timestamp } from "./common";
import { ImportFailureCode, JobStatus } from "./inspiration";
import { CountryCode } from "./countries";
import { PlaceOption } from "./place";
import { named } from "./registry";

/** A reel belongs to the account until its places are deliberately copied into a trip. */
export const AccountReel = named(z.object({
  id: Id,
  ownerId: Id,
  url: z.url({ protocol: /^https?$/ }),
  /** Traveler-supplied names/caption used when the reel cannot be read. */
  details: z.string().max(10_000).nullable().default(null),
  status: z.enum(["queued", "processing", "ready", "needs_input", "failed"]),
  failureCode: ImportFailureCode.nullable(),
  failureMessage: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  placeIds: z.array(Id),
  /** How the source presents itself: a day-by-day itinerary becomes a draft trip; anything else stays place ideas. */
  format: z.enum(["itinerary", "places"]).nullable().default(null),
  /** Draft trip created from an itinerary reel; null for place ideas. */
  tripId: Id.nullable().default(null),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}), "AccountReel");
export type AccountReel = z.infer<typeof AccountReel>;

/** Result of automatically looking up a source-backed account place. A match is not a traveler confirmation. */
export const AccountPlaceMappingStatus = named(
  z.enum(["unverified", "pending", "ambiguous", "not_found"]),
  "AccountPlaceMappingStatus",
);
export type AccountPlaceMappingStatus = z.infer<typeof AccountPlaceMappingStatus>;

/** Source-backed idea with optional provider candidates. Provider matches remain unconfirmed. */
export const AccountPlace = named(z.object({
  id: Id,
  ownerId: Id,
  reelId: Id,
  name: z.string().min(1).max(120),
  area: z.string().max(80).nullable(),
  category: z.string().max(60).nullable(),
  excerpt: z.string().max(300).nullable(),
  /** Country named by the source, with the literal supporting excerpt. Null means it was not supported. */
  country: z.object({ code: CountryCode, excerpt: z.string().min(1).max(300) }).nullable().default(null),
  /** Automatic lookup result. Existing records default to unverified. */
  mappingStatus: AccountPlaceMappingStatus.default("unverified"),
  /** Real-world candidates returned by the configured Places provider. They are not user-confirmed branches. */
  options: z.array(PlaceOption).max(10).default([]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}), "AccountPlace");
export type AccountPlace = z.infer<typeof AccountPlace>;

export const AccountReelJob = named(z.object({
  id: Id,
  ownerId: Id,
  targetId: Id,
  status: JobStatus,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  runAfter: Timestamp,
  lastError: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}), "AccountReelJob");
export type AccountReelJob = z.infer<typeof AccountReelJob>;

export const CreateAccountReelInput = named(z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
}), "CreateAccountReelInput");

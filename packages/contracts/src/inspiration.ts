import { z } from "zod";
import { Id, Timestamp } from "./common";
import { named } from "./registry";

export const SourceType = named(z.enum(["text", "link", "screenshot"]), "SourceType");
export type SourceType = z.infer<typeof SourceType>;

/**
 * queued -> processing -> needs_confirmation | ready | needs_input | failed
 * needs_input and failed can go back to queued (add details / retry); any unresolved state can be skipped.
 */
export const InspirationStatus = named(
  z.enum(["queued", "processing", "needs_confirmation", "ready", "needs_input", "failed", "skipped"]),
  "InspirationStatus",
);
export type InspirationStatus = z.infer<typeof InspirationStatus>;

export const ImportFailureCode = named(
  z.enum([
    "SOURCE_INACCESSIBLE",
    "UNSUPPORTED_SOURCE",
    "IMAGE_UNREADABLE",
    "NO_PLACES_FOUND",
    "EXTRACTION_ERROR",
    "LOOKUP_ERROR",
  ]),
  "ImportFailureCode",
);
export type ImportFailureCode = z.infer<typeof ImportFailureCode>;

export const Inspiration = named(
  z.object({
    id: Id,
    tripId: Id,
    sourceType: SourceType,
    /** Text saves: the pasted text. */
    text: z.string().nullable(),
    /** Link saves: the original URL, kept even when unreadable. */
    url: z.string().nullable(),
    /** Screenshot saves: private upload, owner-only via uploads.get. */
    assetId: Id.nullable(),
    note: z.string().nullable(),
    /** Extra text the traveler added during recovery. */
    details: z.string().nullable(),
    status: InspirationStatus,
    failureCode: ImportFailureCode.nullable(),
    failureMessage: z.string().nullable(),
    attempts: z.number().int().min(0),
    /** Candidate places this save created or was merged into. */
    placeIds: z.array(Id),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  }),
  "Inspiration",
);
export type Inspiration = z.infer<typeof Inspiration>;

export const CreateInspirationInput = named(
  z.discriminatedUnion("sourceType", [
    z.object({
      sourceType: z.literal("text"),
      text: z.string().trim().min(1).max(10_000),
      note: z.string().trim().max(1000).optional(),
    }),
    z.object({
      sourceType: z.literal("link"),
      url: z.url({ protocol: /^https?$/ }),
      note: z.string().trim().max(1000).optional(),
    }),
  ]),
  "CreateInspirationInput",
);
export type CreateInspirationInput = z.infer<typeof CreateInspirationInput>;

// Leave room for multipart overhead below the hosted function payload limit.
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const SCREENSHOT_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const CreateScreenshotInput = named(
  z.object({
    file: z.file().min(1).max(MAX_SCREENSHOT_BYTES).mime([...SCREENSHOT_CONTENT_TYPES]),
    note: z.string().trim().max(1000).optional(),
  }),
  "CreateScreenshotInput",
  "multipart/form-data fields",
);
export type CreateScreenshotInput = z.infer<typeof CreateScreenshotInput>;

export const AddDetailsInput = named(
  z.object({ text: z.string().trim().min(1).max(5000) }),
  "AddDetailsInput",
  "Text the traveler adds when a save could not be read",
);
export type AddDetailsInput = z.infer<typeof AddDetailsInput>;

export const JobStatus = named(z.enum(["queued", "running", "succeeded", "failed", "cancelled"]), "JobStatus");
export type JobStatus = z.infer<typeof JobStatus>;

export const Job = named(
  z.object({
    id: Id,
    tripId: Id,
    kind: z.enum(["import_inspiration", "verify_place"]),
    /** Inspiration id for imports; candidate place id for location-only verification. */
    targetId: Id,
    status: JobStatus,
    attempt: z.number().int().min(0),
    maxAttempts: z.number().int().positive(),
    runAfter: Timestamp,
    lastError: z.string().nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  }),
  "Job",
);
export type Job = z.infer<typeof Job>;

import { z } from "zod";
import { named } from "./registry";

export const Id = named(z.string().min(1).max(100), "Id", "Opaque identifier, e.g. trip_3f2a...");

export const IsoDate = named(z.iso.date(), "IsoDate", "Calendar date, YYYY-MM-DD");

export const Timestamp = named(z.iso.datetime(), "Timestamp", "Server-generated UTC instant, ISO 8601");

export const LocalTime = named(
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm"),
  "LocalTime",
  "Wall-clock time HH:mm in the trip timezone",
);

export const LocalDateTime = named(
  z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Expected YYYY-MM-DDTHH:mm")
    .refine((value) => IsoDate.safeParse(value.slice(0, 10)).success, "Expected a valid calendar date"),
  "LocalDateTime",
  "Wall-clock date and time in the trip timezone (no offset; the trip carries the timezone)",
);

export const Timezone = named(
  z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA timezone"),
  "Timezone",
  "IANA timezone, e.g. Asia/Tokyo",
);

export const LatLng = named(
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  "LatLng",
);
export type LatLng = z.infer<typeof LatLng>;

export const Ok = named(z.object({ ok: z.literal(true) }), "Ok");

export const ErrorCode = named(
  z.enum([
    "VALIDATION_FAILED",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "INVALID_STATE",
    "STALE_VERSION",
    "STALE_TRIP",
    "EDIT_REJECTED",
    "SHARE_REVOKED",
    "PAYLOAD_TOO_LARGE",
    "RATE_LIMITED",
    "INTERNAL",
    "CONTRACT_VIOLATION",
  ]),
  "ErrorCode",
);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const errorHttpStatus: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  // Another account's trip also returns NOT_FOUND so ids cannot be probed.
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  STALE_VERSION: 409,
  STALE_TRIP: 409,
  EDIT_REJECTED: 422,
  SHARE_REVOKED: 410,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  CONTRACT_VIOLATION: 500,
};

export const errorMeaning: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Params, query or body failed the schema. details.issues lists each problem.",
  UNAUTHENTICATED: "No valid session. Send the user to /sign-in.",
  FORBIDDEN: "Caller may not use this operation (e.g. dev sign-in disabled, bad worker secret).",
  NOT_FOUND: "Missing, or owned by another account.",
  INVALID_STATE: "Valid request, but the resource is in the wrong state (e.g. retrying a ready save).",
  STALE_VERSION: "expectedVersion is not the current itinerary version. details.currentVersion; reload then retry.",
  STALE_TRIP: "Trip details changed during this save. Reload and review the latest values before retrying.",
  EDIT_REJECTED: "Edit would break a locked reservation or truncate a visit at midnight. details.conflicts explains why; nothing was saved.",
  SHARE_REVOKED: "The viewing link was revoked by the owner.",
  PAYLOAD_TOO_LARGE: "Upload exceeds the size limit.",
  RATE_LIMITED: "Request or import quota exceeded. Observe Retry-After/details.retryAfterSeconds before trying again.",
  INTERNAL: "Unexpected server error. Safe to retry once.",
  CONTRACT_VIOLATION: "Server produced a response that does not match this contract. A backend bug.",
};

export const ApiErrorBody = named(
  z.object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      details: z.unknown().optional(),
    }),
  }),
  "ApiErrorBody",
  "Every non-2xx JSON response has this shape",
);
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export type ValidationIssue = { path: string; message: string };

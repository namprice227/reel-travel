import { z } from "zod";
import { Id, Ok, type ErrorCode } from "./common";
import {
  AddDetailsInput,
  CreateInspirationInput,
  CreateScreenshotInput,
  Inspiration,
  Job,
} from "./inspiration";
import { EditItineraryInput, GenerateItineraryInput, Itinerary } from "./itinerary";
import { CandidatePlace, ConfirmPlaceInput, PlacePhoto, PlaceStatus } from "./place";
import { named } from "./registry";
// SharedTripView retains optional place provider/attribution for correct downstream display.
import { Share, SharedTripView } from "./share";
import { CreateReservationInput, CreateTripInput, Reservation, Trip, UpdateTripInput } from "./trip";
import { DevSignInInput, SignInInput, SignUpInput, User } from "./user";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
/** public: no session. user: signed-in session required. worker: x-worker-secret header required. */
export type Access = "public" | "user" | "worker";
export type FeatureId = "foundation" | "trip-setup" | "import" | "places" | "itinerary" | "sharing" | "jobs";
export type Member = "Member 1" | "Member 2" | "Member 3" | "Member 4";

export interface EndpointDefinition {
  method: HttpMethod;
  /** Express-style params, e.g. /api/trips/:tripId. Names must match `params`. */
  path: `/api/${string}`;
  access: Access;
  feature: FeatureId;
  /** Who builds the screen that calls it, and who builds the server side. */
  owners: { ui: Member | null; server: Member };
  summary: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Default "json". "form-data" bodies are sent as multipart/form-data. */
  bodyKind?: "json" | "form-data";
  response: z.ZodType;
  /** Default "json". "binary" returns raw bytes (the client gets a Blob). */
  responseKind?: "json" | "binary";
  successStatus?: 200 | 201 | 202;
  /** Domain errors. UNAUTHENTICATED (access "user") and VALIDATION_FAILED (any input) are implied. */
  errors: readonly ErrorCode[];
}

const TripParams = z.object({ tripId: Id });
const InspirationParams = TripParams.extend({ inspirationId: Id });
const PlaceParams = TripParams.extend({ placeId: Id });
const ReservationParams = TripParams.extend({ reservationId: Id });
const ShareParams = TripParams.extend({ shareId: Id });

const Binary = named(z.custom<Blob>(() => true), "Binary", "Raw bytes with the stored Content-Type");

const M1 = "Member 1";
const M2 = "Member 2";
const M3 = "Member 3";
const M4 = "Member 4";

/**
 * THE frontend/backend contract. The server router, the typed browser client and
 * docs/api/endpoints.md are all derived from this object.
 * Changing an entry is a cross-team change: tell both owners, then run `npm run docs:api`.
 */
export const endpoints = {
  // ---------------------------------------------------------------- foundation (F0)
  "auth.signIn": {
    method: "POST", path: "/api/auth/sign-in", access: "public", feature: "foundation",
    owners: { ui: M1, server: M4 },
    summary: "Verify email/password with Supabase Auth and issue a private application session. Credentials and provider tokens are never returned.",
    body: SignInInput, response: z.object({ user: User }), errors: ["UNAUTHENTICATED", "FORBIDDEN", "RATE_LIMITED"],
  },
  "auth.signUp": {
    method: "POST", path: "/api/auth/sign-up", access: "public", feature: "foundation",
    owners: { ui: M1, server: M4 },
    summary: "Register with Supabase Auth. Always asks the user to check email and then sign in; never creates an application session from unconfirmed signup data.",
    body: SignUpInput, response: Ok, errors: ["FORBIDDEN", "RATE_LIMITED"],
  },
  "auth.devSignIn": {
    method: "POST",
    path: "/api/auth/dev-sign-in",
    access: "public",
    feature: "foundation",
    owners: { ui: M1, server: M4 },
    summary:
      "Development sign-in by email only. Available only with the file adapter outside production; always disabled with Supabase.",
    body: DevSignInInput,
    response: z.object({ user: User }),
    errors: ["FORBIDDEN"],
  },
  "auth.signOut": {
    method: "POST",
    path: "/api/auth/sign-out",
    access: "public",
    feature: "foundation",
    owners: { ui: M1, server: M4 },
    summary: "Clear the session cookie. Safe to call when already signed out.",
    response: Ok,
    errors: [],
  },
  "auth.me": {
    method: "GET",
    path: "/api/me",
    access: "user",
    feature: "foundation",
    owners: { ui: M1, server: M4 },
    summary: "The signed-in user. 401 means show the sign-in screen.",
    response: z.object({ user: User }),
    errors: [],
  },

  // ---------------------------------------------------------------- trip setup (F3)
  "trips.list": {
    method: "GET",
    path: "/api/trips",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Trips owned by the signed-in user, newest first.",
    response: z.object({ trips: z.array(Trip) }),
    errors: [],
  },
  "trips.create": {
    method: "POST",
    path: "/api/trips",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Create a trip with default preferences.",
    body: CreateTripInput,
    response: z.object({ trip: Trip }),
    successStatus: 201,
    errors: [],
  },
  "trips.get": {
    method: "GET",
    path: "/api/trips/:tripId",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "One trip, including preferences and the current itinerary version number.",
    params: TripParams,
    response: z.object({ trip: Trip }),
    errors: ["NOT_FOUND"],
  },
  "trips.update": {
    method: "PATCH",
    path: "/api/trips/:tripId",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Change trip details/preferences. Concurrent changes reject with STALE_TRIP; reload before retrying. Confirmed must-visits only. Changed planning inputs mark the itinerary stale.",
    params: TripParams,
    body: UpdateTripInput,
    response: z.object({ trip: Trip }),
    errors: ["NOT_FOUND", "STALE_TRIP"],
  },
  "reservations.list": {
    method: "GET",
    path: "/api/trips/:tripId/reservations",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Bookings for the trip, ordered by start.",
    params: TripParams,
    response: z.object({ reservations: z.array(Reservation) }),
    errors: ["NOT_FOUND"],
  },
  "reservations.create": {
    method: "POST",
    path: "/api/trips/:tripId/reservations",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Add a same-day booking with valid calendar dates and end after start. placeId must be a confirmed place in this trip. Overlaps are explained by itinerary validation.",
    params: TripParams,
    body: CreateReservationInput,
    response: z.object({ reservation: Reservation }),
    successStatus: 201,
    errors: ["NOT_FOUND"],
  },
  "reservations.delete": {
    method: "DELETE",
    path: "/api/trips/:tripId/reservations/:reservationId",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Remove a booking. The itinerary becomes stale until regenerated.",
    params: ReservationParams,
    response: Ok,
    errors: ["NOT_FOUND"],
  },

  // ---------------------------------------------------------------- import (F1)
  "inspirations.list": {
    method: "GET",
    path: "/api/trips/:tripId/inspirations",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "All saves for the trip, newest first. Poll while any are queued/processing.",
    params: TripParams,
    response: z.object({ inspirations: z.array(Inspiration) }),
    errors: ["NOT_FOUND"],
  },
  "inspirations.create": {
    method: "POST",
    path: "/api/trips/:tripId/inspirations",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Atomically save and queue text/link extraction. Imports have per-user burst, daily and active-job limits. Real videos support English YouTube content up to 2 minutes. Configured lookup supplies matches for user confirmation; OpenStreetMap imports allow at most 10 distinct clues, otherwise request a shorter source. Without lookup, results remain unverified.",
    params: TripParams,
    body: CreateInspirationInput,
    response: z.object({ inspiration: Inspiration, job: Job }),
    successStatus: 201,
    errors: ["NOT_FOUND", "RATE_LIMITED"],
  },
  "inspirations.createFromScreenshot": {
    method: "POST",
    path: "/api/trips/:tripId/inspirations/screenshot",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Store a private screenshot up to 4 MiB and atomically queue its save. Image extraction is deferred; add text to recover. Import and private-storage quotas apply.",
    params: TripParams,
    body: CreateScreenshotInput,
    bodyKind: "form-data",
    response: z.object({ inspiration: Inspiration, job: Job }),
    successStatus: 201,
    errors: ["NOT_FOUND", "PAYLOAD_TOO_LARGE", "RATE_LIMITED", "INVALID_STATE"],
  },
  "inspirations.get": {
    method: "GET",
    path: "/api/trips/:tripId/inspirations/:inspirationId",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "One save with the candidate places it produced and its latest job.",
    params: InspirationParams,
    response: z.object({ inspiration: Inspiration, places: z.array(CandidatePlace), job: Job.nullable() }),
    errors: ["NOT_FOUND"],
  },
  "inspirations.retry": {
    method: "POST",
    path: "/api/trips/:tripId/inspirations/:inspirationId/retry",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Atomically re-queue a failed/needs_input save. Concurrent retries return the same active job; quotas apply to new work.",
    params: InspirationParams,
    response: z.object({ inspiration: Inspiration, job: Job }),
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "inspirations.addDetails": {
    method: "POST",
    path: "/api/trips/:tripId/inspirations/:inspirationId/details",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Atomically append recovery text and queue a failed/needs_input save. Concurrent recovery cannot create duplicate active jobs; quotas apply.",
    params: InspirationParams,
    body: AddDetailsInput,
    response: z.object({ inspiration: Inspiration, job: Job }),
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "inspirations.skip": {
    method: "POST",
    path: "/api/trips/:tripId/inspirations/:inspirationId/skip",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Atomically skip a queued/failed/needs-input save and cancel its active job. Preserve source and daily usage; processing saves cannot be skipped.",
    params: InspirationParams,
    response: z.object({ inspiration: Inspiration }),
    errors: ["NOT_FOUND", "INVALID_STATE"],
  },
  "uploads.get": {
    method: "GET",
    path: "/api/uploads/:assetId",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M4 },
    summary: "Owner-only private screenshot bytes. Use as <img src>. Viewers of shared links get 404.",
    params: z.object({ assetId: Id }),
    response: Binary,
    responseKind: "binary",
    errors: ["NOT_FOUND"],
  },

  // ---------------------------------------------------------------- places (F2)
  "places.photo": {
    method: "GET",
    path: "/api/trips/:tripId/places/:placeId/photo",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Fresh display-only photo and attribution for a stored Google match. Owner-only; 60/minute and 300/day per user. No photo resources are persisted or cached.",
    params: PlaceParams,
    query: z.object({ providerPlaceId: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/) }),
    response: z.object({ photo: PlacePhoto.nullable() }),
    errors: ["NOT_FOUND", "RATE_LIMITED", "INTERNAL"],
  },
  "places.list": {
    method: "GET",
    path: "/api/trips/:tripId/places",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Candidate places with source evidence and optional AI country/category labels, including unverified extractions; optionally filtered by status.",
    params: TripParams,
    query: z.object({ status: PlaceStatus.optional() }),
    response: z.object({ places: z.array(CandidatePlace), verificationJobs: z.array(Job).optional() }),
    errors: ["NOT_FOUND"],
  },
  "places.verify": {
    method: "POST",
    path: "/api/trips/:tripId/places/:placeId/verify",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Queue location-only lookup for an unverified place. Reuse active work; do not rerun transcription/extraction or auto-confirm. Limit requests to 10/minute and 30/day per account.",
    params: PlaceParams,
    response: z.object({ job: Job }),
    successStatus: 202,
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "places.confirm": {
    method: "POST",
    path: "/api/trips/:tripId/places/:placeId/confirm",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary:
      "Confirm one provider option (picks the branch when ambiguous). Unverified extractions cannot be confirmed. Other places confirmed to the same provider place merge into this one.",
    params: PlaceParams,
    body: ConfirmPlaceInput,
    response: z.object({ place: CandidatePlace, mergedPlaceIds: z.array(Id) }),
    errors: ["NOT_FOUND", "INVALID_STATE"],
  },
  "places.reject": {
    method: "POST",
    path: "/api/trips/:tripId/places/:placeId/reject",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Exclude a candidate from planning. Its evidence is kept.",
    params: PlaceParams,
    response: z.object({ place: CandidatePlace }),
    errors: ["NOT_FOUND"],
  },

  // ---------------------------------------------------------------- itinerary (F4, F5)
  "itinerary.get": {
    method: "GET",
    path: "/api/trips/:tripId/itinerary",
    access: "user",
    feature: "itinerary",
    owners: { ui: M2, server: M4 },
    summary:
      "Current saved version, or null. stale = places, bookings, dates, timezone or preferences changed since it was made. All three views read this.",
    params: TripParams,
    response: z.object({ itinerary: Itinerary.nullable(), stale: z.boolean() }),
    errors: ["NOT_FOUND"],
  },
  "itinerary.generate": {
    method: "POST",
    path: "/api/trips/:tripId/itinerary/generate",
    access: "user",
    feature: "itinerary",
    owners: { ui: M2, server: M4 },
    summary:
      "Build a new version from confirmed places, bookings and preferences. Unknown travel is null and partially checked; infeasible parts come back as conflicts, not errors.",
    params: TripParams,
    body: GenerateItineraryInput,
    response: z.object({ itinerary: Itinerary }),
    successStatus: 201,
    errors: ["NOT_FOUND", "STALE_VERSION", "INVALID_STATE"],
  },
  "itinerary.edit": {
    method: "POST",
    path: "/api/trips/:tripId/itinerary/edits",
    access: "user",
    feature: "itinerary",
    owners: { ui: M2, server: M4 },
    summary:
      "Move/remove/add/replace a stop. Affected days are re-timed and re-validated. Breaking a locked booking or truncating a visit at midnight -> EDIT_REJECTED; other conflicts are saved and returned.",
    params: TripParams,
    body: EditItineraryInput,
    response: z.object({ itinerary: Itinerary, saved: z.boolean() }),
    errors: ["NOT_FOUND", "INVALID_STATE", "STALE_VERSION", "EDIT_REJECTED"],
  },

  // ---------------------------------------------------------------- sharing (F6)
  "shares.list": {
    method: "GET",
    path: "/api/trips/:tripId/shares",
    access: "user",
    feature: "sharing",
    owners: { ui: M2, server: M4 },
    summary: "Viewing links for the trip, including revoked ones. Tokens are never returned again.",
    params: TripParams,
    response: z.object({ shares: z.array(Share) }),
    errors: ["NOT_FOUND"],
  },
  "shares.create": {
    method: "POST",
    path: "/api/trips/:tripId/shares",
    access: "user",
    feature: "sharing",
    owners: { ui: M2, server: M4 },
    summary: "Create a read-only viewing link. token and url are returned only in this response. Limited to 10 creations per owner per 10-minute window.",
    params: TripParams,
    response: z.object({ share: Share, token: z.string(), url: z.string() }),
    successStatus: 201,
    errors: ["NOT_FOUND", "RATE_LIMITED"],
  },
  "shares.revoke": {
    method: "POST",
    path: "/api/trips/:tripId/shares/:shareId/revoke",
    access: "user",
    feature: "sharing",
    owners: { ui: M2, server: M4 },
    summary: "Revoke a viewing link immediately. Idempotent.",
    params: ShareParams,
    response: z.object({ share: Share }),
    errors: ["NOT_FOUND"],
  },
  "shared.get": {
    method: "GET",
    path: "/api/shared/:token",
    access: "public",
    feature: "sharing",
    owners: { ui: M2, server: M4 },
    summary: "Read-only view; stale plans are withheld (stale=true, itinerary=null, places=[]), until regenerated. Limited to 120 reads per link per minute. Revocation is never undone by a view.",
    params: z.object({ token: z.string().min(1).max(256) }),
    response: z.object({ view: SharedTripView }),
    errors: ["NOT_FOUND", "SHARE_REVOKED", "RATE_LIMITED"],
  },

  // ---------------------------------------------------------------- jobs
  "jobs.runDue": {
    method: "POST",
    path: "/api/internal/jobs/run-due",
    access: "worker",
    feature: "jobs",
    owners: { ui: null, server: M4 },
    summary: "Run due imports only in local file mode with fake providers. Production/Supabase imports execute in the dedicated worker; this endpoint returns FORBIDDEN there.",
    response: z.object({ processed: z.number().int(), succeeded: z.number().int(), failed: z.number().int() }),
    errors: ["FORBIDDEN"],
  },
} as const satisfies Record<string, EndpointDefinition>;

export type Endpoints = typeof endpoints;
export type EndpointId = keyof Endpoints;

type InputOf<S> = S extends z.ZodType ? z.input<S> : never;
type OutputOf<S> = S extends z.ZodType ? z.output<S> : never;

/** What the browser sends. Keys are present only when the endpoint takes them. */
export type EndpointRequest<Id extends EndpointId> = (Endpoints[Id] extends { params: infer S }
  ? { params: InputOf<S> }
  : unknown) &
  (Endpoints[Id] extends { query: infer S } ? { query?: InputOf<S> } : unknown) &
  (Endpoints[Id] extends { body: infer S } ? { body: InputOf<S> } : unknown);

/** What the browser receives on success. */
export type EndpointResponse<Id extends EndpointId> = OutputOf<Endpoints[Id]["response"]>;

/** What a server handler receives after validation. */
export type EndpointParams<Id extends EndpointId> = Endpoints[Id] extends { params: infer S }
  ? OutputOf<S>
  : Record<string, never>;
export type EndpointQuery<Id extends EndpointId> = Endpoints[Id] extends { query: infer S }
  ? OutputOf<S>
  : Record<string, never>;
export type EndpointBody<Id extends EndpointId> = Endpoints[Id] extends { body: infer S } ? OutputOf<S> : undefined;

/** What a server handler returns: data matching the schema, or a raw Response for binary endpoints. */
export type EndpointResult<Id extends EndpointId> = Endpoints[Id] extends { responseKind: "binary" }
  ? Response
  : InputOf<Endpoints[Id]["response"]>;

/** Fill `:name` segments. Throws when a param is missing. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path param "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

import { z } from "zod";
import { Id, Ok, type ErrorCode } from "./common";
import {
  AddDetailsInput,
  CreateInspirationInput,
  CreateScreenshotInput,
  Inspiration,
  Job,
} from "./inspiration";
import { AddItineraryPlaceInput, EditItineraryInput, GenerateItineraryInput, Itinerary, PlaceSearchQuery, UpdateItineraryPlaceInput } from "./itinerary";
import { CandidatePlace, ConfirmPlaceInput, CopyPlacesInput, PlaceDetails, PlaceOption, PlacePhotoResponse, PlaceStatus, SelectPlacesInput } from "./place";
import { named } from "./registry";
// SharedTripView retains optional place provider/attribution for correct downstream display.
import { Share, SharedTripView } from "./share";
import { ProviderPlaceId, StaySearchQuery, StaySearchResult, StaySessionToken, StaySuggestion } from "./stay";
import { CreateReservationInput, CreateTripInput, Reservation, Trip, UpdateTripInput, UploadTripCoverInput } from "./trip";
import { DevSignInInput, SignInInput, SignUpInput, User } from "./user";
import { AnalyticsEvent } from "./analytics";
import { AccountPlace, AccountReel, AccountReelJob, CreateAccountReelInput, FinishAccountReelReviewInput } from "./account-reel";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
/** public: no session. user: signed-in session required. worker: x-worker-secret header required. */
export type Access = "public" | "user" | "worker";
export type FeatureId = "foundation" | "trip-setup" | "import" | "places" | "itinerary" | "sharing" | "jobs" | "analytics";
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
const OwnedInspirationParams = z.object({ inspirationId: Id });
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
  "analytics.track": {
    method: "POST", path: "/api/analytics", access: "public", feature: "analytics",
    owners: { ui: M2, server: M4 },
    summary: "Accept an allowlisted product event with bounded non-content properties and deliver it through the configured server-side analytics sink.",
    body: AnalyticsEvent, response: Ok, errors: ["RATE_LIMITED"],
  },
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
    summary: "Change trip details/preferences. A draft trip becomes planned once start date, end date and timezone are all set; partial dates on a draft are rejected. Date changes reject bookings or hotel nights outside the new trip. A stay linked to a stays.place result is re-checked with the provider when its link or the destination changes: the provider supplies its location, address and fit, a hotel in another city or country is rejected, and a nearby town needs fit=nearby from the traveler. Unchanged links keep their saved facts. Concurrent changes reject with STALE_TRIP; reload before retrying. Selected located must-visits only. Changed planning inputs mark the itinerary stale.",
    params: TripParams,
    body: UpdateTripInput,
    response: z.object({ trip: Trip }),
    errors: ["NOT_FOUND", "STALE_TRIP", "INVALID_STATE", "RATE_LIMITED"],
  },
  "stays.suggest": {
    method: "GET",
    path: "/api/trips/:tripId/stays/suggest",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Hotel or area suggestions while the traveler types a stay, from the Places provider's autocomplete: limited to the trip's country and biased to its destination. Candidates only, nothing checked or saved. Pass the same session token for one traveler's keystrokes and the stays.place call that ends them. 90/minute and 1500/day per user. No hotel provider configured -> INVALID_STATE.",
    params: TripParams,
    query: z.object({ q: StaySearchQuery, session: StaySessionToken }),
    response: z.object({ suggestions: z.array(StaySuggestion), attribution: z.string().max(200) }),
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "stays.place": {
    method: "GET",
    path: "/api/trips/:tripId/stays/place",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Provider facts for one picked hotel and its fit against the trip destination (inside, nearby, elsewhere, other_country, or unchecked when the destination area is unknown). Nothing is saved; trips.update checks the link again. Shares the place-search limits (20/minute, 200/day per user). Unknown or permanently closed place -> NOT_FOUND. No hotel provider configured -> INVALID_STATE.",
    params: TripParams,
    query: z.object({ id: ProviderPlaceId, session: StaySessionToken.optional() }),
    response: z.object({ result: StaySearchResult }),
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "trips.delete": {
    method: "DELETE",
    path: "/api/trips/:tripId",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Permanently delete an owned trip and its saves, places, bookings, itinerary versions, shares, jobs and private uploads. Independent copies in other trips remain.",
    params: TripParams,
    response: Ok,
    errors: ["NOT_FOUND"],
  },
  "trips.cover.upload": {
    method: "POST",
    path: "/api/trips/:tripId/cover",
    access: "user",
    feature: "trip-setup",
    owners: { ui: M1, server: M4 },
    summary: "Upload or replace an owner-only trip cover in private storage. Metadata and the trip reference commit atomically; stale tabs are rejected.",
    params: TripParams,
    body: UploadTripCoverInput,
    bodyKind: "form-data",
    response: z.object({ trip: Trip }),
    errors: ["NOT_FOUND", "STALE_TRIP", "PAYLOAD_TOO_LARGE", "INVALID_STATE"],
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
    summary: "Add a same-day booking within the trip dates, ending after it starts. placeId must be a selected place with a location in this trip. Overlaps are explained by itinerary validation.",
    params: TripParams,
    body: CreateReservationInput,
    response: z.object({ reservation: Reservation }),
    successStatus: 201,
    errors: ["NOT_FOUND", "INVALID_STATE"],
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
  "accountReels.list": {
    method: "GET", path: "/api/account/reels", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "List this account's saved reels and source-backed place ideas, including country labels only where the source supports them, newest reels first.",
    response: z.object({ reels: z.array(AccountReel), places: z.array(AccountPlace) }),
    errors: [],
  },
  "accountReels.library": {
    method: "GET", path: "/api/account/library", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "List places from owned saved reels, including source-linked places in reel-created trips, grouped by country in the UI.",
    response: z.object({ reels: z.array(AccountReel), places: z.array(AccountPlace.extend({ originTripId: Id.optional(), confirmed: z.boolean().optional() })) }),
    errors: [],
  },
  "accountReels.create": {
    method: "POST", path: "/api/account/reels", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Save a reel link to the account shelf without choosing a trip. Public YouTube Shorts queue source-backed place extraction; inaccessible sources retain recovery status. A reel that presents itself as a day-by-day itinerary (source-quoted, checked by the server) becomes a draft trip with no dates and its places grouped by source day when its destination is a supported trip country; an itinerary elsewhere stays place ideas with format \"itinerary\" and no tripId; any other reel stays place ideas.",
    body: CreateAccountReelInput,
    response: z.object({ reel: AccountReel, job: AccountReelJob }),
    successStatus: 201,
    errors: ["RATE_LIMITED"],
  },
  "accountReels.addDetails": {
    method: "POST", path: "/api/account/reels/:reelId/details", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Add source text to an inaccessible or failed account reel and queue another extraction attempt. The original URL remains unchanged.",
    params: z.object({ reelId: Id }),
    body: AddDetailsInput,
    response: z.object({ reel: AccountReel, job: AccountReelJob }),
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "accountReels.mapPlaces": {
    method: "POST", path: "/api/account/reels/:reelId/map-places", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Map existing source-backed account places through the configured Places provider. Only places with source-supported country evidence are searched; provider candidates remain unconfirmed.",
    params: z.object({ reelId: Id }),
    response: z.object({ places: z.array(AccountPlace) }),
    errors: ["NOT_FOUND", "INVALID_STATE"],
  },
  "accountReels.placePhoto": {
    method: "GET", path: "/api/account/reels/:reelId/places/:placeId/photo", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Fresh display-only Google photo and attribution for a stored account-place candidate. Owner-only; shares the place-photo rate limits. Photo resources are never persisted.",
    params: z.object({ reelId: Id, placeId: Id }),
    query: z.object({ providerPlaceId: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/) }),
    response: z.object({ photo: PlacePhotoResponse.nullable() }),
    errors: ["NOT_FOUND", "RATE_LIMITED", "INTERNAL"],
  },
  "accountReels.keepAsIdeas": {
    method: "POST", path: "/api/account/reels/:reelId/keep-as-ideas", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Undo an automatic draft trip: delete the draft trip created from this itinerary reel and keep its places as account place ideas instead. Only a still-draft trip can be converted.",
    params: z.object({ reelId: Id }),
    response: z.object({ reel: AccountReel, places: z.array(AccountPlace) }),
    errors: ["NOT_FOUND", "INVALID_STATE"],
  },
  "accountReels.finishReview": {
    method: "POST", path: "/api/account/reels/:reelId/review", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Close Home's detected-places popup for this reel so it stops reappearing. Listed place ideas (unticked ones on save, all on Cancel) are removed from the account; an empty list keeps every place. Removal needs a ready reel without a draft trip; copies already added to trips remain. Repeating is a no-op.",
    params: z.object({ reelId: Id }),
    body: FinishAccountReelReviewInput,
    response: z.object({ reel: AccountReel, places: z.array(AccountPlace) }),
    errors: ["NOT_FOUND", "INVALID_STATE"],
  },
  "accountReels.delete": {
    method: "DELETE", path: "/api/account/reels/:reelId", access: "user", feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Delete one account-owned reel and its extracted ideas.",
    params: z.object({ reelId: Id }),
    response: Ok,
    errors: ["NOT_FOUND"],
  },
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
  "inspirations.getOwned": {
    method: "GET",
    path: "/api/inspirations/:inspirationId",
    access: "user",
    feature: "import",
    owners: { ui: M1, server: M3 },
    summary: "Open one save by id when it belongs to the signed-in user, including evidence followed from a place in another trip.",
    params: OwnedInspirationParams,
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
  "places.listSaved": {
    method: "GET",
    path: "/api/places",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Saved candidate places from owned trips. Trip copies retain source evidence and repeated copies are idempotent.",
    response: z.object({ places: z.array(CandidatePlace) }),
    errors: [],
  },
  "places.photo": {
    method: "GET",
    path: "/api/trips/:tripId/places/:placeId/photo",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Fresh display-only photo and attribution for a stored Google match. Owner-only; 60/minute and 300/day per user. No photo resources are persisted or cached.",
    params: PlaceParams,
    query: z.object({ providerPlaceId: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/) }),
    response: z.object({ photo: PlacePhotoResponse.nullable() }),
    errors: ["NOT_FOUND", "RATE_LIMITED", "INTERNAL"],
  },
  "places.details": {
    method: "GET",
    path: "/api/trips/:tripId/places/:placeId/details",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "On-demand rich place details (reviews, hours, amenities, contact) for a confirmed or selected match. Owner-only, cached for up to 30 days per provider policies.",
    params: PlaceParams,
    query: z.object({ providerPlaceId: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/) }),
    response: z.object({ details: PlaceDetails.nullable() }),
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
  "places.search": {
    method: "GET",
    path: "/api/trips/:tripId/places/search",
    access: "user",
    feature: "places",
    owners: { ui: M2, server: M3 },
    summary: "Look up real places by name near the trip's destination with the configured Places provider, for adding while editing a day. Results are provider candidates, not confirmations; nothing is saved. 20/minute and 200/day per user. No provider configured -> INVALID_STATE.",
    params: TripParams,
    query: z.object({ q: PlaceSearchQuery }),
    response: z.object({ results: z.array(PlaceOption) }),
    errors: ["NOT_FOUND", "INVALID_STATE", "RATE_LIMITED"],
  },
  "places.copy": {
    method: "POST",
    path: "/api/trips/:tripId/places/copy",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Copy saved trip candidates or account-reel places into a trip, preserving provider options, status and source evidence. Repeated copies remain idempotent.",
    params: TripParams,
    body: CopyPlacesInput,
    response: z.object({ places: z.array(CandidatePlace) }),
    errors: ["NOT_FOUND", "INVALID_STATE"],
  },
  "places.select": {
    method: "PATCH",
    path: "/api/trips/:tripId/places/selection",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Replace the places the traveler wants to visit. Selection is independent of provider matching; unresolved places remain selected and are reported after planning.",
    params: TripParams,
    body: SelectPlacesInput,
    response: z.object({ trip: Trip }),
    errors: ["NOT_FOUND", "STALE_TRIP"],
  },
  "places.delete": {
    method: "DELETE",
    path: "/api/trips/:tripId/places/:placeId",
    access: "user",
    feature: "places",
    owners: { ui: M1, server: M3 },
    summary: "Permanently remove one owned trip place. Source saves and copies in other trips remain; selection, must-visit and booking references are detached. Existing itinerary versions become stale when planning inputs change.",
    params: PlaceParams,
    response: Ok,
    errors: ["NOT_FOUND", "STALE_TRIP"],
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
      "Build a practical trip from saved dates, daily times, preferences, places and bookings, including meals and labeled nearby suggestions when ideas are sparse. When configured, dated weather informs planning and provider-backed nearby venues are fitted into actual time slots; discovery failures leave provisional suggestions. The server schedules model day/order/duration proposals, protects saved-place coverage, assesses usefulness separately from validity, and attempts bounded targeted repair. Optional quality explains omissions and suggested trade-offs. Invalid identities, impossible bookings or unusable provider output -> GENERATION_FAILED. Changed inputs -> STALE_TRIP. AI generation is limited to 3/minute and 20/day per account.",
    params: TripParams,
    body: GenerateItineraryInput,
    response: z.object({ itinerary: Itinerary }),
    successStatus: 201,
    errors: ["NOT_FOUND", "STALE_VERSION", "STALE_TRIP", "INVALID_STATE", "GENERATION_FAILED", "RATE_LIMITED"],
  },
  "itinerary.edit": {
    method: "POST",
    path: "/api/trips/:tripId/itinerary/edits",
    access: "user",
    feature: "itinerary",
    owners: { ui: M2, server: M4 },
    summary:
      "Move/remove/add/replace a stop, or set its length and earliest start (set_stop_time). Affected days are re-timed and re-validated. Breaking a locked booking or truncating an activity or break at midnight -> EDIT_REJECTED; other conflicts are saved and returned. Intended durations are retained on re-timed stops. add_place/replace_stop may name any usable place in this trip: one planning did not include yet is selected in the same save, and an itinerary that was current stays current.",
    params: TripParams,
    body: EditItineraryInput,
    response: z.object({ itinerary: Itinerary, saved: z.boolean() }),
    errors: ["NOT_FOUND", "INVALID_STATE", "STALE_VERSION", "EDIT_REJECTED"],
  },
  "itinerary.addPlace": {
    method: "POST",
    path: "/api/trips/:tripId/itinerary/places",
    access: "user",
    feature: "itinerary",
    owners: { ui: M2, server: M4 },
    summary:
      "Add a place to a day, or swap a stop for it, from this trip, another trip's saves, the account library or a places.search result. Saved and library places are copied in with their source evidence; a search result is re-checked with the provider and kept with its query as a text save for evidence; a chosen branch is confirmed. The place is selected for planning and the day re-timed and re-validated as in itinerary.edit; an itinerary that was current stays current. A copy or branch choice already saved remains if the edit itself is then refused.",
    params: TripParams,
    body: AddItineraryPlaceInput,
    response: z.object({ itinerary: Itinerary, place: CandidatePlace }),
    errors: ["NOT_FOUND", "INVALID_STATE", "STALE_VERSION", "EDIT_REJECTED", "RATE_LIMITED"],
  },
  "itinerary.updatePlace": {
    method: "POST",
    path: "/api/trips/:tripId/itinerary/places/:placeId",
    access: "user",
    feature: "itinerary",
    owners: { ui: M2, server: M4 },
    summary:
      "While editing a day: switch a trip place to another of its matching branches (confirmed) and/or give it the traveler's own name (null restores the provider name). Its stops take the new name, location and hours, and affected days are re-timed and re-validated as in itinerary.edit; an itinerary that was current stays current. A branch or name already saved remains if the re-timed plan is refused.",
    params: PlaceParams,
    body: UpdateItineraryPlaceInput,
    response: z.object({ itinerary: Itinerary, place: CandidatePlace }),
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
    errors: ["NOT_FOUND", "RATE_LIMITED", "INVALID_STATE"],
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

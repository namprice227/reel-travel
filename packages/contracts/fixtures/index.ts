import {
  defaultTripPreferences,
  type ApiErrorBody,
  type CandidatePlace,
  type Evidence,
  type Inspiration,
  type Itinerary,
  type PlaceOption,
  type Reservation,
  type Share,
  type SharedTripView,
  type Stop,
  type Trip,
  type User,
} from "../src/index";

/**
 * One example of every contract state that the UI must handle. Use them to build screens
 * before the backend is ready (import from "@reel/contracts/fixtures") and in tests.
 * contracts.test.ts proves each one parses against its schema.
 * SYNTHETIC: venue names and hours are fictional.
 */

const T = "2026-09-14T08:00:00.000Z";
const TRIP_ID = "trip_tokyo";
const ATTRIBUTION = "Synthetic fixture: fictional venue and hours, not real data";

const allDays = (open: string, close: string) => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close }));

function option(
  providerPlaceId: string,
  name: string,
  lat: number,
  lng: number,
  details: Partial<PlaceOption["details"]> = {},
): PlaceOption {
  return {
    providerPlaceId,
    name,
    address: `${name} (synthetic address)`,
    location: { lat, lng },
    details: {
      provider: "fixture",
      providerPlaceId,
      fetchedAt: T,
      category: null,
      openingHours: { status: "known", windows: allDays("10:00", "21:00") },
      typicalVisitMinutes: 60,
      priceLevel: null,
      unknownFields: ["priceLevel", "photos", "summary", "rating", "phone", "websiteUrl", "reviews"],
      photos: [],
      summary: null,
      rating: null,
      ratingCount: null,
      websiteUrl: null,
      providerUrl: null,
      phone: null,
      reviews: [],
      attribution: ATTRIBUTION,
      ...details,
    },
  };
}

const evidence = (inspirationId: string, clue: string, excerpt: string | null): Evidence => ({
  inspirationId,
  sourceType: "text",
  clue,
  excerpt,
  extractedAt: T,
});

// ------------------------------------------------------------------ users and trips

export const userFixture: User = {
  id: "user_alice",
  email: "alice@example.test",
  displayName: "Alice",
  createdAt: T,
};

export const tripFixture: Trip = {
  id: TRIP_ID,
  ownerId: userFixture.id,
  title: "Tokyo long weekend",
  destination: "Tokyo",
  timezone: "Asia/Tokyo",
  startDate: "2026-10-01",
  endDate: "2026-10-04",
  preferences: defaultTripPreferences,
  currentItineraryVersion: 1,
  createdAt: T,
  updatedAt: T,
};

export const reservationFixture: Reservation = {
  id: "res_dinner",
  tripId: TRIP_ID,
  title: "Dinner at Ginza Sushi Counter",
  placeId: null,
  start: "2026-10-01T19:30",
  end: "2026-10-01T21:00",
  locked: true,
  note: "Booked, deposit paid",
  createdAt: T,
  updatedAt: T,
};

// ------------------------------------------------------------------ import states

const inspiration = (fields: Partial<Inspiration> & Pick<Inspiration, "id" | "sourceType" | "status">): Inspiration => ({
  tripId: TRIP_ID,
  text: null,
  url: null,
  assetId: null,
  note: null,
  details: null,
  failureCode: null,
  failureMessage: null,
  attempts: 1,
  placeIds: [],
  createdAt: T,
  updatedAt: T,
  ...fields,
});

export const inspirationFixtures = {
  processing: inspiration({ id: "insp_processing", sourceType: "text", status: "processing", text: "Hoshi Coffee for breakfast" }),
  ready: inspiration({
    id: "insp_ready",
    sourceType: "text",
    status: "ready",
    text: "Catch the sky deck at sunset",
    placeIds: ["place_sky_deck"],
  }),
  needsConfirmation: inspiration({
    id: "insp_branch",
    sourceType: "text",
    status: "needs_confirmation",
    text: "Best bowl of my life at Kumo Ramen",
    placeIds: ["place_kumo"],
  }),
  inaccessibleLink: inspiration({
    id: "insp_link",
    sourceType: "link",
    status: "needs_input",
    url: "https://www.instagram.com/reel/example",
    failureCode: "SOURCE_INACCESSIBLE",
    failureMessage: "Posts on instagram.com can't be read automatically. Add the place names or paste the caption.",
  }),
  failed: inspiration({
    id: "insp_failed",
    sourceType: "screenshot",
    status: "failed",
    assetId: "asset_example",
    attempts: 3,
    failureCode: "EXTRACTION_ERROR",
    failureMessage: "Import failed after 3 attempts. Retry or add details.",
  }),
} satisfies Record<string, Inspiration>;

// ------------------------------------------------------------------ place states

const skyDeck = option("fx-sky-deck", "Sumida Sky Deck", 35.7101, 139.8107, { category: "viewpoint", typicalVisitMinutes: 90 });
const kumoShibuya = option("fx-kumo-ramen-shibuya", "Kumo Ramen Shibuya", 35.6614, 139.701, { category: "restaurant" });
const kumoShinjuku = option("fx-kumo-ramen-shinjuku", "Kumo Ramen Shinjuku", 35.6905, 139.702, { category: "restaurant" });
const shrine = option("fx-forest-shrine", "Harajuku Forest Shrine", 35.6764, 139.6993, {
  category: "shrine",
  openingHours: { status: "unknown" },
  unknownFields: ["openingHours", "priceLevel"],
});

const place = (fields: Partial<CandidatePlace> & Pick<CandidatePlace, "id" | "status" | "name" | "evidence">): CandidatePlace => ({
  tripId: TRIP_ID,
  options: [],
  selected: null,
  createdAt: T,
  updatedAt: T,
  ...fields,
});

export const placeFixtures = {
  confirmed: place({
    id: "place_sky_deck",
    status: "confirmed",
    name: "Sumida Sky Deck",
    evidence: [evidence("insp_ready", "Sumida Sky Deck", "Catch the sky deck at sunset")],
    options: [skyDeck],
    selected: skyDeck,
  }),
  mergedDuplicate: place({
    id: "place_sky_deck_merged",
    status: "confirmed",
    name: "Sumida Sky Deck",
    evidence: [
      evidence("insp_ready", "Sumida Sky Deck", "Catch the sky deck at sunset"),
      evidence("insp_other", "Sumida Sky Deck", "…sky deck tickets sell out…"),
    ],
    options: [skyDeck],
    selected: skyDeck,
  }),
  ambiguousBranch: place({
    id: "place_kumo",
    status: "ambiguous",
    name: "Kumo Ramen",
    evidence: [evidence("insp_branch", "Kumo Ramen", "Best bowl of my life at Kumo Ramen")],
    options: [kumoShibuya, kumoShinjuku],
  }),
  pendingUnknownHours: place({
    id: "place_shrine",
    status: "pending",
    name: "Harajuku Forest Shrine",
    evidence: [evidence("insp_shrine", "Harajuku Forest Shrine", "quiet morning at the forest shrine")],
    options: [shrine],
  }),
  notFound: place({
    id: "place_nowhere",
    status: "not_found",
    name: "Nowhere Bar",
    evidence: [evidence("insp_nowhere", "Nowhere Bar", 'Friends loved "Nowhere Bar"')],
  }),
} satisfies Record<string, CandidatePlace>;

// ------------------------------------------------------------------ itineraries

const stop = (fields: Partial<Stop> & Pick<Stop, "id" | "title" | "start" | "end">): Stop => ({
  kind: "place",
  placeId: null,
  reservationId: null,
  location: null,
  travelMinutesBefore: 0,
  locked: false,
  hoursCheck: "open",
  sourceInspirationIds: [],
  ...fields,
});

const dinnerStop = stop({
  id: "stop_dinner",
  kind: "reservation",
  title: reservationFixture.title,
  reservationId: reservationFixture.id,
  start: "19:30",
  end: "21:00",
  locked: true,
  hoursCheck: "not_applicable",
});

const assumptions = [
  "Travel times are estimates from straight-line distance ×1.3 at 20 km/h (transit), not live routes.",
  "Visit lengths come from the place provider, or 60 minutes when unknown.",
  "Opening hours are checked only where the provider supplied them; unknown hours are flagged.",
];

const itinerary = (fields: Partial<Itinerary> & Pick<Itinerary, "id" | "version" | "days" | "validationStatus">): Itinerary => ({
  tripId: TRIP_ID,
  createdAt: T,
  change: "generated",
  unscheduledPlaceIds: [],
  conflicts: [],
  assumptions,
  inputFingerprint: "0f1e2d3c",
  ...fields,
});

export const itineraryFixtures = {
  valid: itinerary({
    id: "itin_v1",
    version: 1,
    validationStatus: "valid",
    days: [
      {
        date: "2026-10-01",
        stops: [
          stop({
            id: "stop_sky",
            title: "Sumida Sky Deck",
            placeId: "place_sky_deck",
            location: skyDeck.location,
            start: "10:00",
            end: "11:30",
            sourceInspirationIds: ["insp_ready"],
          }),
          stop({ id: "stop_break", kind: "break", title: "Break", start: "12:00", end: "13:00", hoursCheck: "not_applicable" }),
          dinnerStop,
        ],
      },
      { date: "2026-10-02", stops: [] },
    ],
  }),
  partiallyChecked: itinerary({
    id: "itin_v2",
    version: 2,
    change: "add_place",
    validationStatus: "partially_checked",
    days: [
      {
        date: "2026-10-01",
        stops: [
          stop({
            id: "stop_shrine",
            title: "Harajuku Forest Shrine",
            placeId: "place_shrine",
            location: shrine.location,
            start: "09:00",
            end: "10:00",
            hoursCheck: "unknown",
          }),
          dinnerStop,
        ],
      },
    ],
    conflicts: [
      {
        code: "HOURS_UNKNOWN",
        severity: "info",
        date: "2026-10-01",
        stopIds: ["stop_shrine"],
        placeIds: ["place_shrine"],
        message: 'Opening hours for "Harajuku Forest Shrine" are unknown, so this time was not checked.',
        suggestion: "Check the venue's hours before you go.",
      },
    ],
  }),
  impossibleReservation: itinerary({
    id: "itin_v3",
    version: 3,
    validationStatus: "has_conflicts",
    days: [
      {
        date: "2026-10-01",
        stops: [
          dinnerStop,
          stop({
            id: "stop_show",
            kind: "reservation",
            title: "Late show",
            reservationId: "res_show",
            start: "20:00",
            end: "22:00",
            locked: true,
            hoursCheck: "not_applicable",
          }),
        ],
      },
    ],
    conflicts: [
      {
        code: "LOCKED_RESERVATION_UNREACHABLE",
        severity: "error",
        date: "2026-10-01",
        stopIds: ["stop_show", "stop_dinner"],
        placeIds: [],
        message: 'You\'d reach "Late show" at 21:00, after its 20:00 start, because "Dinner at Ginza Sushi Counter" ends at 21:00.',
        suggestion: "Move a stop to another day or after the booking.",
      },
    ],
  }),
} satisfies Record<string, Itinerary>;

// ------------------------------------------------------------------ sharing

export const shareFixtures = {
  active: { id: "share_active", tripId: TRIP_ID, createdAt: T, revokedAt: null, lastViewedAt: null },
  revoked: { id: "share_revoked", tripId: TRIP_ID, createdAt: T, revokedAt: "2026-09-15T09:00:00.000Z", lastViewedAt: T },
} satisfies Record<string, Share>;

export const sharedViewFixture: SharedTripView = {
  stale: false,
  trip: {
    title: tripFixture.title,
    destination: tripFixture.destination,
    timezone: tripFixture.timezone,
    startDate: tripFixture.startDate,
    endDate: tripFixture.endDate,
  },
  itinerary: {
    version: 1,
    createdAt: T,
    days: itineraryFixtures.valid.days.map((day) => ({
      date: day.date,
      stops: day.stops.map(({ sourceInspirationIds: _private, ...rest }) => rest),
    })),
    conflicts: [],
    validationStatus: "valid",
    assumptions,
  },
  places: [
    { id: "place_sky_deck", name: skyDeck.name, address: skyDeck.address, location: skyDeck.location, category: "viewpoint" },
  ],
};

// ------------------------------------------------------------------ errors

export const errorFixtures = {
  unauthenticated: { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
  staleVersion: {
    error: { code: "STALE_VERSION", message: "The itinerary changed since you loaded it.", details: { currentVersion: 2 } },
  },
  editRejected: {
    error: {
      code: "EDIT_REJECTED",
      message: "That edit would break a locked booking.",
      details: { conflicts: itineraryFixtures.impossibleReservation.conflicts },
    },
  },
  shareRevoked: { error: { code: "SHARE_REVOKED", message: "This viewing link was revoked by the trip owner." } },
  rateLimited: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 60 seconds.", details: { retryAfterSeconds: 60 } } },
  visitDurationRejected: {
    error: {
      code: "EDIT_REJECTED", message: "This visit cannot fit before midnight.",
      details: { conflicts: [{ code: "VISIT_DURATION_TRUNCATED", severity: "error", date: "2026-10-01",
        stopIds: ["stop_synthetic_late"], placeIds: ["place_synthetic_late"],
        message: '"Synthetic late visit" needs 60 minutes, which does not fit before midnight.',
        suggestion: "Move it earlier or to another day. Visits cannot be shortened to fit.",
      }] },
    },
  },
} satisfies Record<string, ApiErrorBody>;

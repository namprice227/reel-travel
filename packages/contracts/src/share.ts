import { z } from "zod";
import { Id, IsoDate, LatLng, Timestamp } from "./common";
import { PublicItinerary } from "./itinerary";
import { named } from "./registry";

/** The token itself is shown once at creation; only its hash is stored. */
export const Share = named(
  z.object({
    id: Id,
    tripId: Id,
    createdAt: Timestamp,
    revokedAt: Timestamp.nullable(),
    lastViewedAt: Timestamp.nullable(),
  }),
  "Share",
);
export type Share = z.infer<typeof Share>;

export const SharedPlace = named(
  z.object({
    id: Id,
    name: z.string(),
    address: z.string().nullable(),
    location: LatLng,
    category: z.string().nullable(),
    provider: z.string().optional(),
    attribution: z.string().optional(),
  }),
  "SharedPlace",
);
export type SharedPlace = z.infer<typeof SharedPlace>;

/** Read-only projection for viewers. No uploads, source text or edit handles. */
export const SharedTripView = named(
  z.object({
    trip: z.object({
      title: z.string(),
      destination: z.string(),
      timezone: z.string(),
      startDate: IsoDate,
      endDate: IsoDate,
    }),
    /** Null when the owner has not generated an itinerary yet. */
    itinerary: PublicItinerary.nullable(),
    places: z.array(SharedPlace),
  }),
  "SharedTripView",
);
export type SharedTripView = z.infer<typeof SharedTripView>;

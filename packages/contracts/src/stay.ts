import { z } from "zod";
import { named } from "./registry";
import { PlaceOption } from "./place";

/**
 * Where a hotel sits against the trip destination, decided by the server from provider data:
 * inside the destination area, a nearby town the traveler accepted, somewhere else, another country,
 * or unchecked when the destination area could not be looked up.
 */
export const StayFit = named(z.enum(["inside", "nearby", "elsewhere", "other_country", "unchecked"]), "StayFit");
export type StayFit = z.infer<typeof StayFit>;
/** Fits a stay may be saved with. "elsewhere" and "other_country" are refused. */
export const LinkableStayFit = z.enum(["inside", "nearby", "unchecked"]);

export const StaySearchQuery = z.string().trim().min(2).max(120);
/** Groups one traveler's keystrokes and the pick that ends them into one provider session. */
export const StaySessionToken = z.string().regex(/^[A-Za-z0-9_-]{8,36}$/);
export const ProviderPlaceId = z.string().regex(/^[A-Za-z0-9_-]{1,300}$/);

/** A hotel suggested while typing: a candidate to pick, not a checked or saved fact. */
export const StaySuggestion = named(
  z.object({
    providerPlaceId: ProviderPlaceId,
    name: z.string().min(1).max(300),
    secondary: z.string().max(300).nullable(),
    /** Straight-line km from the destination centre, when known. */
    distanceKm: z.number().min(0).nullable(),
  }),
  "StaySuggestion",
);
export type StaySuggestion = z.infer<typeof StaySuggestion>;

/**
 * The provider place a stay is linked to. The browser sends the provider id and what the traveler typed; the server
 * looks the place up again, so address, locality, fit and the stay's location are provider facts.
 */
export const StayPlace = named(
  z.object({
    provider: z.string().min(1).max(50),
    providerPlaceId: z.string().min(1).max(300),
    /** What the traveler typed before picking it, kept as evidence. */
    query: StaySearchQuery,
    address: z.string().max(1_000).nullable(),
    /** Town or city from the provider address, e.g. "Yokohama"; null when the provider gave none. */
    locality: z.string().max(120).nullable(),
    /** A browser sending "nearby" is the traveler accepting a hotel outside the destination. */
    fit: LinkableStayFit,
    /** The trip destination the fit was checked against. */
    checkedFor: z.string().max(120),
  }),
  "StayPlace",
);
export type StayPlace = z.infer<typeof StayPlace>;

export const StaySearchResult = named(
  z.object({
    option: PlaceOption,
    locality: z.string().max(120).nullable(),
    fit: StayFit,
    /** Straight-line km from the destination centre; 0 inside the destination, null when unchecked. */
    distanceKm: z.number().min(0).nullable(),
  }),
  "StaySearchResult",
);
export type StaySearchResult = z.infer<typeof StaySearchResult>;

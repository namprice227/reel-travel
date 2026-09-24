// Server-side decision on how a reel presents itself. The model proposes; literal source text decides.

export type ReelFormat = {
  /** itinerary: the source itself presents a day-by-day plan. places: anything else, however many places. */
  kind: "itinerary" | "places";
  /** Verbatim source phrase that establishes an itinerary; null for places. */
  evidence: string | null;
  /** Trip length stated by the source, or the highest labelled day. Null when unstated. */
  tripDays: number | null;
  /** Destination named in the source; null when the source does not name it. */
  city: string | null;
  country: string | null;
};

export type ProposedReelFormat = {
  format: "itinerary" | "places";
  format_evidence: string | null;
  trip_days: number | null;
  destination_city: string | null;
  destination_country: string | null;
  stops: Array<{ day_number: number | null }>;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
};
const COUNT = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})`;
const TRIP_LENGTH = new RegExp(`\\b${COUNT}[\\s-]*(day|night)s?\\b`, "i");
const DAY_LABEL = new RegExp(`\\bday\\s*${COUNT}\\b`, "i");
const ITINERARY_WORD = /\bitinerar(?:y|ies)\b/i;
const MAX_SOURCE_DAYS = 30;

const normalize = (text: string) => text.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, "\"")
  .replace(/\s+/g, " ").trim().toLowerCase();
const toCount = (token: string) => /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token.toLowerCase()] ?? null;

/**
 * Accept "itinerary" only when a quoted phrase appears in the source, reads as itinerary wording
 * ("5 day itinerary", "Day 1", "3 nights in Seoul"), the source gives a day structure, and names a destination.
 * Everything else is "places". Day numbers survive only for itineraries.
 */
export function resolveReelFormat(proposed: ProposedReelFormat, sourceTexts: string[]): {
  format: ReelFormat; dayNumbers: Array<number | null>;
} {
  const sources = sourceTexts.map(normalize).filter(Boolean);
  const inSource = (value: string | null) => {
    const needle = value ? normalize(value) : "";
    return needle.length > 0 && sources.some((source) => source.includes(needle));
  };
  const city = inSource(proposed.destination_city) ? proposed.destination_city!.trim() : null;
  const country = inSource(proposed.destination_country) ? proposed.destination_country!.trim() : null;
  const places = { format: { kind: "places" as const, evidence: null, tripDays: null, city, country },
    dayNumbers: proposed.stops.map(() => null) };

  const quote = proposed.format_evidence?.trim() ?? "";
  if (proposed.format !== "itinerary" || !inSource(quote)) return places;
  const length = TRIP_LENGTH.exec(quote);
  if (!length && !DAY_LABEL.test(quote) && !ITINERARY_WORD.test(quote)) return places;

  const dayNumbers = proposed.stops.map((stop) =>
    stop.day_number !== null && Number.isInteger(stop.day_number) && stop.day_number >= 1 && stop.day_number <= MAX_SOURCE_DAYS
      ? stop.day_number : null);
  const labelledDays = new Set(dayNumbers.filter((day): day is number => day !== null));
  const statedLength = length ? toCount(length[1]!) : null;
  const tripDays = statedLength !== null && statedLength >= 1 && statedLength <= MAX_SOURCE_DAYS
    ? statedLength : labelledDays.size ? Math.max(...labelledDays) : null;
  // A one-word "itinerary" claim with no stated length and no grouped stops is not a day-by-day plan.
  if (labelledDays.size < 2 && tripDays === null) return places;
  if (!city && !country) return places;

  return { format: { kind: "itinerary", evidence: quote, tripDays, city, country },
    dayNumbers: tripDays === null ? dayNumbers : dayNumbers.map((day) => day !== null && day <= tripDays ? day : null) };
}

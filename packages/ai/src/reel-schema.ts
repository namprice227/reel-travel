import { z } from "zod";
import { ProviderError } from "./provider-request";

// Extraction artifacts, not contracts.Itinerary or confirmed CandidatePlace.
const text = z.string().trim().min(1).max(1000);
const optionalText = text.nullable();
const texts = z.array(text).max(30);
export const VideoEvidenceOutputSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
  audio: z.strictObject({ transcript: z.string().max(100_000), language: z.string().min(1).max(40).nullable() }),
  visual_observations: z.array(z.strictObject({
    timestamp_seconds: z.number().min(0).max(86_400),
    visible_text: z.array(z.string().trim().min(1).max(500)).max(20),
    description: z.string().trim().min(1).max(1000),
    uncertainties: texts,
  })).max(60),
  uncertainties: texts,
});
export type VideoEvidenceOutput = z.infer<typeof VideoEvidenceOutputSchema>;
export type VideoEvidence = {
  audio: VideoEvidenceOutput["audio"];
  visual_observations: (VideoEvidenceOutput["visual_observations"][number] & { id: string })[];
  uncertainties: string[];
};

const common = {
  classification: z.strictObject({
    basis: z.enum(["route", "single_place", "fallback"]),
    explanation: text,
    uncertain: z.boolean(),
    evidence_ids: z.array(z.string().min(1).max(40)).max(60),
  }),
  summary: optionalText,
  tags: texts,
  uncertainties: texts,
  field_evidence: z.array(z.strictObject({
    field: z.string().min(1).max(200),
    source_id: z.string().min(1).max(40),
    quote: z.string().trim().min(1).max(1000),
  })).max(600),
};
export const ItineraryReelSchema = z.strictObject({
  type: z.literal("itinerary"),
  title: optionalText,
  total_days: z.number().int().min(1).max(365).nullable(),
  destinations: z.array(z.strictObject({
    city: optionalText, country: optionalText,
    days: z.array(z.number().int().min(1).max(365)).max(365),
    stops: z.array(z.strictObject({
      name: optionalText, category: optionalText, activity: optionalText,
      tip: optionalText, recommended_dish: optionalText,
    })).max(50),
  })).max(30),
  transport_notes: optionalText,
  estimated_budget_tier: optionalText,
  ...common,
});
export const PlaceReelSchema = z.strictObject({
  type: z.literal("place"),
  place_name: optionalText,
  category: optionalText,
  location: z.strictObject({
    city_or_region: optionalText, country: optionalText,
    // Only a later factual provider may supply coordinates.
    coordinates: z.null(),
  }),
  highlights: texts,
  practical_info: z.strictObject({
    best_time_to_visit: optionalText,
    recommended_duration_hours: z.number().min(0).max(8760).nullable(),
    entry_fee: optionalText,
    accessibility: optionalText,
  }),
  recommended_for: texts,
  additional_places: z.array(z.strictObject({
    name: text, city_or_region: optionalText, country: optionalText,
  })).max(50),
  ...common,
});
export const ReelSchema = z.union([ItineraryReelSchema, PlaceReelSchema]);
// Structured outputs require an object at the root; the union is nested.
export const ReelResponseSchema = z.strictObject({ result: ReelSchema });
export type Reel = z.infer<typeof ReelSchema>;

export function normalizeVideoEvidence(value: unknown): VideoEvidence {
  const parsed = VideoEvidenceOutputSchema.safeParse(value);
  if (!parsed.success || parsed.data.status !== "ok")
    throw new ProviderError("MALFORMED_OUTPUT", "Video evidence does not match the schema.");
  const data = parsed.data;
  // Only remove identical observations at the SAME timestamp. Repeated scenes at different
  // times may carry itinerary order; no image-level or semantic deduplication is claimed.
  const unique = data.visual_observations.filter((item, index, all) =>
    all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index);
  unique.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
  return {
    audio: data.audio,
    visual_observations: unique.map((item, index) => ({ id: `visual_${index + 1}`, ...item })),
    uncertainties: data.uncertainties,
  };
}

export function evidenceSources(evidence: VideoEvidence): Map<string, string> {
  return new Map([
    ["audio", evidence.audio.transcript],
    ...evidence.visual_observations.map(item =>
      [item.id, [...item.visible_text, item.description].join("\n")] as [string, string]),
  ]);
}

/** Citation presence/quotes are checked, not semantic truth or video accuracy. */
export function validateReel(value: unknown, evidence: VideoEvidence): Reel {
  const parsed = ReelResponseSchema.safeParse(value);
  const invalid = (reason: string) => new ProviderError("MALFORMED_OUTPUT", "Reel validation failed: " + reason + ".");
  if (!parsed.success) throw invalid("schema mismatch");
  const reel = parsed.data.result;
  const sources = evidenceSources(evidence);
  if (reel.classification.evidence_ids.some(id => !sources.get(id)?.trim())) throw invalid("unknown classification evidence");
  if (reel.classification.basis === "fallback") {
    if (reel.type !== "place" || !reel.classification.uncertain) throw invalid("fallback must be an uncertain place");
  } else {
    if (!reel.classification.evidence_ids.length) throw invalid("missing classification evidence");
    if ((reel.type === "itinerary") !== (reel.classification.basis === "route")) throw invalid("classification basis mismatch");
  }
  if (reel.type === "itinerary") {
    if (!reel.destinations.length || !reel.destinations.some(d => d.stops.length)) throw invalid("itinerary has no stops");
    for (const destination of reel.destinations) {
      if (new Set(destination.days).size !== destination.days.length ||
        destination.days.some((day, index, days) => (index > 0 && day < days[index - 1]) ||
          (reel.total_days !== null && day > reel.total_days))) throw invalid("invalid destination days");
    }
  }
  // Require citation coverage for every populated content leaf, including each array item.
  const leaves = new Set<string>();
  function collect(value: unknown, path: string) {
    if (value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => collect(v, `${path}.${i}`));
    else if (typeof value === "object") Object.entries(value as Record<string, unknown>)
      .forEach(([key, v]) => collect(v, path ? `${path}.${key}` : key));
    else leaves.add(path);
  }
  const { type: _type, classification: _classification, uncertainties: _uncertainties,
    field_evidence: citations, ...content } = reel;
  collect(content, "");
  const covered = new Set<string>();
  for (const citation of citations) {
    if (!leaves.has(citation.field)) throw invalid("citation does not target a populated content field");
    if (!sources.get(citation.source_id)?.includes(citation.quote)) throw invalid("citation quote is absent from its source");
    covered.add(citation.field);
  }
  const missing = [...leaves].filter(path => !covered.has(path));
  // Paths originate from the strict schema, never from raw provider strings.
  if (missing.length) throw invalid("missing citations for " + missing.slice(0,5).join(", "));
  return reel;
}


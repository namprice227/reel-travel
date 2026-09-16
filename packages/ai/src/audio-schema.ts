import { z } from "zod";
import { PlaceClueSchema } from "./types";

/** Unverified extraction leads, NOT the persisted contracts.CandidatePlace. */
export const ExtractedPlaceSchema = z.strictObject({
  name: PlaceClueSchema.shape.query.nullable(),
  city: z.string().trim().min(1).max(120).nullable(),
  area: PlaceClueSchema.shape.hint,
  category: z.string().trim().min(1).max(120).nullable(),
  clues: z.array(z.string().min(1).max(300)).max(20),
  excerpts: z.array(z.string().min(1).max(300)).min(1).max(20),
});
export const TranscriptExtractionSchema = z.strictObject({
  extractedPlaces: z.array(ExtractedPlaceSchema).max(50),
});
export const AudioExtractionResultSchema = TranscriptExtractionSchema.extend({
  transcript: z.string().max(100_000),
});
export type ExtractedPlace = z.infer<typeof ExtractedPlaceSchema>;
export type AudioExtractionResult = z.infer<typeof AudioExtractionResultSchema>;

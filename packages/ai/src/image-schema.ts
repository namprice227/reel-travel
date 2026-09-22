import { z } from "zod";

const text = z.string().trim().min(1).max(1000);
const texts = z.array(text).max(50);

export const ImageEvidenceOutputSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
  visible_text: z.array(z.string().trim().min(1).max(500)).max(50),
  landmarks_or_venues: z.array(z.string().trim().min(1).max(200)).max(20),
  visual_description: z.string().trim().min(1).max(2000),
  location_clues: texts,
  uncertainties: texts,
});

export type ImageEvidenceOutput = z.infer<typeof ImageEvidenceOutputSchema>;

export const ImageStopSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  area_hint: z.string().trim().min(1).max(100).nullable(),
  category: z.enum(["food", "attraction", "other"]).nullable(),
  activity: z.string().trim().min(1).max(500).nullable(),
  tip: z.string().trim().min(1).max(500).nullable(),
  excerpt: z.string().trim().min(1).max(500).nullable(),
});
export type ImageStop = z.infer<typeof ImageStopSchema>;

export const ImageStopsOutputSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
  visual_description: z.string().trim().min(1).max(2000),
  stops: z.array(ImageStopSchema).max(20),
});
export type ImageStopsOutput = z.infer<typeof ImageStopsOutputSchema>;

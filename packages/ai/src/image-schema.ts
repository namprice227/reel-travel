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

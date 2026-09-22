import { expect, it } from "vitest";
import { z } from "zod";
import { toGeminiJsonSchema } from "./gemini-schema";
import { ImageEvidenceOutputSchema } from "./image-schema";

it("keeps the evidence shape and nullability but removes provider-side bounds", () => {
  const schema = toGeminiJsonSchema(ImageEvidenceOutputSchema);
  const serialized = JSON.stringify(schema);
  for (const keyword of ["$schema", "minLength", "maxLength", "maxItems", "minimum", "maximum"])
    expect(serialized).not.toContain('"' + keyword + '"');
  expect(schema.required).toEqual(["status", "visible_text", "landmarks_or_venues", "visual_description", "location_clues", "uncertainties"]);
  expect(serialized).toContain('"enum":["ok","unavailable"]');
});

it("preserves properties named like schema keywords", () => {
  const schema = toGeminiJsonSchema(z.strictObject({ maxLength: z.string().max(5) }));
  expect(schema.properties).toEqual({ maxLength: { type: "string" } });
});


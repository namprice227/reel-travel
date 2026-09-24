import { expect, it, vi } from "vitest";
import { z } from "zod";
import { toGeminiJsonSchema } from "./gemini-schema";
import { ImageEvidenceOutputSchema } from "./image-schema";
import { VideoEvidenceOutputSchema } from "./reel-schema";
import { createGeminiYouTubeReader } from "./youtube";
import { YOUTUBE_EVIDENCE_PROMPT } from "../prompts/youtube-evidence-v1";

it("keeps the image evidence shape and removes provider-side bounds", () => {
  const schema = toGeminiJsonSchema(ImageEvidenceOutputSchema);
  const serialized = JSON.stringify(schema);
  for (const keyword of ["$schema", "minLength", "maxLength", "maxItems", "minimum", "maximum"])
    expect(serialized).not.toContain('"' + keyword + '"');
  expect(schema.required).toEqual(["status", "visible_text", "landmarks_or_venues", "visual_description", "location_clues", "uncertainties"]);
  expect(serialized).toContain('"enum":["ok","unavailable"]');
});

it("keeps the video evidence shape and nullability but removes provider-side bounds", () => {
  const schema = toGeminiJsonSchema(VideoEvidenceOutputSchema);
  const serialized = JSON.stringify(schema);
  for (const keyword of ["$schema", "minLength", "maxLength", "maxItems", "minimum", "maximum"])
    expect(serialized).not.toContain('"' + keyword + '"');
  expect(schema.required).toEqual(["status", "audio", "visual_observations", "uncertainties"]);
  expect(serialized.includes('"type":"null"') || serialized.includes('"nullable":true')).toBe(true);
  expect(serialized).toContain('"enum":["ok","unavailable"]');
});

it("preserves properties named like schema keywords", () => {
  const schema = toGeminiJsonSchema(z.strictObject({ maxLength: z.string().max(5) }));
  expect(schema.properties).toEqual({ maxLength: { type: "string" } });
});

it("preserves literals and discriminated-union tags", () => {
  const schema = toGeminiJsonSchema(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("place"), name: z.string() }),
    z.object({ kind: z.literal("note"), text: z.string() }),
  ]));
  const serialized = JSON.stringify(schema);
  expect(serialized).toContain('"const":"place"');
  expect(serialized).toContain('"const":"note"');
});

it("still rejects over-limit evidence locally after the simplified provider request", async () => {
  const observation = { timestamp_seconds: 1, visible_text: [], description: "Synthetic scene", uncertainties: [] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
      status: "ok", audio: { transcript: "", language: null },
      visual_observations: Array.from({ length: 61 }, () => observation), uncertainties: [],
    }) }] } }],
  }));
  await expect(createGeminiYouTubeReader({ apiKey: "test", fetch: fetcher }, VideoEvidenceOutputSchema,
    YOUTUBE_EVIDENCE_PROMPT).read("https://www.youtube.com/watch?v=B0mSzDK3MiA"))
    .rejects.toMatchObject({ code: "MALFORMED_OUTPUT" });
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.generationConfig.responseJsonSchema).toEqual(toGeminiJsonSchema(VideoEvidenceOutputSchema));
});

it.each([[400, "rejected", "TRANSCRIPTION_FAILED"], [503, "overloaded", "PROVIDER_UNAVAILABLE"], [429, "quota", "PROVIDER_UNAVAILABLE"]])("explains HTTP %s without provider text", async (status, hint, code) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { message: "private-provider-body" } }, { status: Number(status) }));
  await expect(createGeminiYouTubeReader({ apiKey: "test", fetch: fetcher, retryDelaysMs: [] }, VideoEvidenceOutputSchema,
    YOUTUBE_EVIDENCE_PROMPT).read("https://www.youtube.com/watch?v=B0mSzDK3MiA"))
    .rejects.toMatchObject({ code, message: expect.stringContaining(String(hint)) });
});


import { expect, it, vi } from "vitest";
import { z } from "zod";
import { toGeminiJsonSchema } from "./gemini-schema";
import { VideoEvidenceOutputSchema } from "./reel-schema";
import { createGeminiYouTubeReader } from "./youtube";
import { YOUTUBE_EVIDENCE_PROMPT } from "../prompts/youtube-evidence-v1";

it("keeps the evidence shape and nullability but removes provider-side bounds", () => {
  const schema = toGeminiJsonSchema(VideoEvidenceOutputSchema);
  const serialized = JSON.stringify(schema);
  for (const keyword of ["$schema", "minLength", "maxLength", "maxItems", "minimum", "maximum"])
    expect(serialized).not.toContain('"' + keyword + '"');
  expect(schema.required).toEqual(["status", "audio", "visual_observations", "uncertainties"]);
  expect(serialized).toContain('"type":"null"');
  expect(serialized).toContain('"enum":["ok","unavailable"]');
});
it("preserves properties named like schema keywords", () => {
  const schema = toGeminiJsonSchema(z.strictObject({ maxLength: z.string().max(5) }));
  expect(schema.properties).toEqual({ maxLength: { type: "string" } });
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
it.each([[400, "rejected"], [503, "overloaded"], [429, "quota"]])("explains HTTP %s without provider text", async (status, hint) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { message: "private-provider-body" } }, { status: Number(status) }));
  await expect(createGeminiYouTubeReader({ apiKey: "test", fetch: fetcher }, VideoEvidenceOutputSchema,
    YOUTUBE_EVIDENCE_PROMPT).read("https://www.youtube.com/watch?v=B0mSzDK3MiA"))
    .rejects.toMatchObject({ code: "TRANSCRIPTION_FAILED", message: expect.stringContaining(String(hint)) });
});


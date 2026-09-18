import { expect, it, vi } from "vitest";
import { createGeminiYouTubeTranscriber } from "./youtube";
import { createOpenAIExtractor } from "./openai-extractor";

const url = "https://www.youtube.com/shorts/jTOfOew316s?si=tracking&list=ignored";
// Synthetic responses only; normal tests never contact the duration or AI providers.
function duration(seconds: unknown = 60, resultOverrides = {}, videoOverrides = {}) {
  return { success: true, results: [{ id: "jTOfOew316s", videoCount: 1, fetchedVideoCount: 1, consideredCount: 1,
    unavailableCount: 0, isTruncated: false, rangeStart: 1, rangeEnd: 1, totalSeconds: seconds,
    videos: [{ id: "jTOfOew316s", durationSeconds: seconds, considered: true, ...videoOverrides }], ...resultOverrides }] };
}
function transcript(language: string | null = "en", status = "ok", text = "Visit Synthetic Cafe.") {
  return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ status, transcript: text, language }) }] } }] };
}
function setup(meta: unknown, generated = transcript()) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(meta)).mockResolvedValueOnce(Response.json(generated));
  return { transcriber: createGeminiYouTubeTranscriber({ apiKey: "synthetic-gemini", fetch: fetcher }), fetcher };
}
it.each([121, 120.1, 180, 2736, 86400])("blocks %s seconds before Gemini even for Shorts URLs", async seconds => {
  const { transcriber, fetcher } = setup(duration(seconds));
  const extractionFetch = vi.fn<typeof fetch>();
  expect(await createOpenAIExtractor({ apiKey: "test", youtube: transcriber, fetch: extractionFetch })
    .extract({ sourceType: "link", url, note: null, details: null }))
    .toMatchObject({ status: "needs_input", failureCode: "UNSUPPORTED_SOURCE", message: expect.stringContaining("up to 2 minutes") });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(extractionFetch).not.toHaveBeenCalled();
});
it.each([1, 60, 119, 120])("allows %s seconds and passes only accepted transcript to extraction", async seconds => {
  const { transcriber, fetcher } = setup(duration(seconds));
  const extractionFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [
    { type: "output_text", text: JSON.stringify({ clues: [{ query: "Synthetic Cafe", hint: null, sourcePassage: 0 }] }) },
  ] }] }));
  const result = await createOpenAIExtractor({ apiKey: "synthetic", youtube: transcriber, fetch: extractionFetch })
    .extract({ sourceType: "link", url, note: null, details: null });
  expect(result.status).toBe("ok");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(JSON.parse(extractionFetch.mock.calls[0]![1]!.body as string).input[1].content))
    .toEqual({ passages: [{ id: 0, text: "Visit Synthetic Cafe." }] });
});
it.each([0, -1, null, "60", "1:00"])("rejects unverified duration %s without Gemini", async seconds => {
  const { transcriber, fetcher } = setup(duration(seconds));
  expect(await transcriber.transcribe(url)).toMatchObject({ failureCode: "SOURCE_INACCESSIBLE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { success: false }, { success: true, results: [] }, {},
  duration(60, { id: "wrong-video" }), duration(60, {}, { id: "wrong-video" }),
  duration(60, { totalSeconds: 10 }), duration(60, { videoCount: 2 }), duration(60, { consideredCount: 0 }),
  duration(60, { unavailableCount: 1 }), duration(60, { isTruncated: true }), duration(60, { rangeEnd: 2 }),
  duration(60, {}, { considered: false }), duration(60, { videos: [] }),
])("rejects incomplete or mismatched duration responses %#", async meta => {
  const { transcriber, fetcher } = setup(meta);
  expect(await transcriber.transcribe(url)).toMatchObject({ status: "needs_input", failureCode: "SOURCE_INACCESSIBLE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["en", "en-US", "en-GB", "English"])("accepts detected English %s", async language => {
  const { transcriber } = setup(duration(), transcript(language));
  expect(await transcriber.transcribe(url)).toMatchObject({ status: "ok", language });
});
it.each(["vi", "French", "en,vi", "English and Vietnamese", null, "und"])("rejects detected language %s before extraction", async language => {
  const { transcriber, fetcher } = setup(duration(), transcript(language));
  const extractionFetch = vi.fn<typeof fetch>();
  expect(await createOpenAIExtractor({ apiKey: "test", youtube: transcriber, fetch: extractionFetch })
    .extract({ sourceType: "link", url, note: null, details: null }))
    .toMatchObject({ failureCode: "UNSUPPORTED_SOURCE", message: "We only support English-language videos." });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(extractionFetch).not.toHaveBeenCalled();
});
it("handles early language rejection with no transcript", async () => {
  const { transcriber } = setup(duration(), transcript("vi", "unsupported_language", ""));
  expect(await transcriber.transcribe(url)).toMatchObject({ failureCode: "UNSUPPORTED_SOURCE" });
});
it("masks duration API failures and never falls back to Gemini", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private error", { status: 503 }));
  await expect(createGeminiYouTubeTranscriber({ apiKey: "synthetic", fetch: fetcher }).transcribe(url))
    .rejects.toMatchObject({ code: "VIDEO_DURATION_FAILED", message: expect.not.stringContaining("private error") });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("times out stalled duration checks before requesting Gemini", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const request = createGeminiYouTubeTranscriber({ apiKey: "synthetic", fetch: fetcher }).transcribe(url);
    const assertion = expect(request).rejects.toMatchObject({ code: "VIDEO_DURATION_FAILED" });
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
it("sends only the normalized URL/range to duration API and bounds generation", async () => {
  const { transcriber, fetcher } = setup(duration());
  await transcriber.transcribe(url);
  const [endpoint, request] = fetcher.mock.calls[0]!;
  expect(endpoint).toBe("https://ytplaylistlength.one/api/calculate");
  expect(request!.method).toBe("POST");
  expect(request!.headers).toBeUndefined();
  expect(request!.redirect).toBe("error");
  expect(Object.fromEntries((request!.body as FormData).entries())).toEqual({
    search_string: "https://www.youtube.com/watch?v=jTOfOew316s", range_start: "1", range_end: "1",
  });
  const body = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
  expect(body.generationConfig).toMatchObject({ maxOutputTokens: 8192, temperature: 1, thinkingConfig: { thinkingLevel: "low" } });
  expect(body.systemInstruction.parts[0].text).toContain("Do not translate it");
  expect(body).not.toHaveProperty("tools");
});

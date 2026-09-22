import { expect, it, vi } from "vitest";
import fixtures from "../../../evals/datasets/youtube-reels.json";
import { analyzeYouTubeReel, createReelClassifier, normalizeVideoEvidence, validateReel, ReelResponseSchema } from "./reel";
import { z } from "zod";
import { YOUTUBE_EVIDENCE_PROMPT } from "../prompts/youtube-evidence-v1";
import { CLASSIFY_REEL_PROMPT } from "../prompts/classify-reel-v1";

const url = "https://www.youtube.com/watch?v=jTOfOew316s";
const geminiBody = (value: unknown, finishReason = "STOP") =>
  ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
const openaiBody = (value: unknown, status = "completed") =>
  ({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
const sample = fixtures.cases[0];
const evidence = () => normalizeVideoEvidence(sample.evidence);
const options = (fetch: typeof globalThis.fetch) => ({ gemini: { apiKey: "test", fetch }, openai: { apiKey: "test", fetch } });
const clone = <T>(value: T): T => structuredClone(value);

it.each(fixtures.cases)("runs mocked speech/visual evidence -> typed extraction: $id", async fixture => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(geminiBody(fixture.evidence)))
    .mockResolvedValueOnce(Response.json(openaiBody({ result: fixture.expected })));
  const onProgress = vi.fn();
  const result = await analyzeYouTubeReel(url, { ...options(fetcher), onProgress });
  expect(onProgress.mock.calls.map(call => call[0])).toEqual(["evidence", "classification", "validated"]);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Expected success");
  expect(result.result).toEqual(fixture.expected);
  expect(result.provenance.facts_verified).toBe(false);
  expect(result.provenance.planner_validated).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const first = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(first.systemInstruction.parts[0].text).toBe(YOUTUBE_EVIDENCE_PROMPT);
  expect(first.contents[0].parts[0].fileData.fileUri).toBe(url);
  const second = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
  expect(second.input[0].content).toBe(CLASSIFY_REEL_PROMPT);
  expect(JSON.parse(second.input[1].content)).toEqual(result.evidence);
  expect(second.store).toBe(false);
  expect(second).not.toHaveProperty("tools");
  expect(first).not.toHaveProperty("tools");
});

it("emits an object-root provider schema with a nested union", () => {
  const schema = z.toJSONSchema(ReelResponseSchema, { target: "draft-7" });
  expect(schema.type).toBe("object");
  expect(schema).not.toHaveProperty("anyOf");
  expect(schema).not.toHaveProperty("oneOf");
  expect(schema.properties?.result).toHaveProperty("anyOf");
});

it.each(["https://instagram.com/reel/abc", "https://tiktok.com/video/123", "https://youtube.com.evil.test/watch?v=jTOfOew316s", "local.mp4"])("rejects unsupported input before calls: %s", async input => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await analyzeYouTubeReel(input, options(fetcher))).toMatchObject({ status: "needs_input", failureCode: "SOURCE_INACCESSIBLE" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("preflights the second-stage key and timeout before paying Gemini", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(analyzeYouTubeReel(url, { ...options(fetcher), openai: {} })).rejects.toMatchObject({ code: "API_KEY_MISSING" });
  await expect(analyzeYouTubeReel(url, { ...options(fetcher), openai: { apiKey: "test", timeoutMs: -1 } })).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not classify unavailable videos", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(geminiBody({ ...sample.evidence, status: "unavailable" })));
  expect(await analyzeYouTubeReel(url, options(fetcher))).toMatchObject({ status: "needs_input" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("sorts evidence and removes only identical observations at identical timestamps", () => {
  const a = fixtures.cases[1].evidence.visual_observations[0];
  const b = { ...a, timestamp_seconds: 1 };
  const changed = { ...b, visible_text: ["Day 2"] };
  const normalized = normalizeVideoEvidence({ ...sample.evidence, visual_observations: [a, b, a, changed] });
  expect(normalized.visual_observations.map(v => v.timestamp_seconds)).toEqual([1, 1, 4.2]);
  expect(normalized.visual_observations.map(v => v.id)).toEqual(["visual_1", "visual_2", "visual_3"]);
});
it.each([-1, NaN, Infinity])("rejects invalid visual timestamp %s", timestamp => {
  const a = fixtures.cases[1].evidence.visual_observations[0];
  expect(() => normalizeVideoEvidence({ ...sample.evidence, visual_observations: [{ ...a, timestamp_seconds: timestamp }] })).toThrow();
});
it.each([
  ["unknown source", (r: any) => { r.field_evidence[0].source_id = "visual_999"; }],
  ["fabricated quote", (r: any) => { r.field_evidence[0].quote = "not in the source"; }],
  ["missing citation", (r: any) => { r.field_evidence.pop(); }],
  ["wrong field", (r: any) => { r.field_evidence[0].field = "__proto__"; }],
  ["third category", (r: any) => { r.type = "unknown"; }],
  ["day beyond total", (r: any) => { r.destinations[1].days = [3]; }],
  ["duplicate day", (r: any) => { r.destinations[0].days = [1, 1]; }],
  ["classification mismatch", (r: any) => { r.classification.basis = "single_place"; }],
  ["classification without evidence", (r: any) => { r.classification.evidence_ids = []; }],
  ["extra unvalidated field", (r: any) => { r.verified = true; }],
] as const)("rejects %s", (_name, mutate) => {
  const reel = clone(sample.expected); mutate(reel);
  expect(() => validateReel({ result: reel }, evidence())).toThrow();
});
it("rejects guessed coordinates and falsely certain fallbacks", () => {
  const fixture = fixtures.cases[3];
  expect(() => validateReel({ result: { ...fixture.expected, location: { city_or_region: null, country: null,
    coordinates: { latitude: 1, longitude: 2 } } } }, normalizeVideoEvidence(fixture.evidence))).toThrow();
  expect(() => validateReel({ result: { ...fixture.expected, classification: { ...fixture.expected.classification, uncertain: false } } },
    normalizeVideoEvidence(fixture.evidence))).toThrow();
});
it.each([
  ["refusal", { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }, "LLM_REFUSAL"],
  ["partial", openaiBody({ result: sample.expected }, "incomplete"), "CLASSIFICATION_FAILED"],
  ["invalid envelope", {}, "MALFORMED_OUTPUT"],
  ["invalid JSON", { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "oops" }] }] }, "MALFORMED_OUTPUT"],
] as const)("rejects OpenAI %s", async (_name, body, code) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
  await expect(createReelClassifier({ apiKey: "test", fetch: fetcher }).classify(evidence())).rejects.toMatchObject({ code });
});
it("masks classifier HTTP errors and bounds hanging requests", async () => {
  await expect(createReelClassifier({ apiKey: "test", fetch: vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({ private: "secret" }, { status: 429 })) }).classify(evidence()))
    .rejects.toMatchObject({ code: "CLASSIFICATION_FAILED", message: expect.not.stringContaining("secret") });
  await expect(createReelClassifier({ apiKey: "test", timeoutMs: 5, fetch: vi.fn<typeof fetch>(() => new Promise(() => {})) })
    .classify(evidence())).rejects.toMatchObject({ code: "CLASSIFICATION_FAILED" });
});
it("rejects truncated or malformed Gemini observations before OpenAI", async () => {
  for (const body of [geminiBody(sample.evidence, "MAX_TOKENS"), geminiBody({ status: "ok" })]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(body));
    await expect(analyzeYouTubeReel(url, options(fetcher))).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});


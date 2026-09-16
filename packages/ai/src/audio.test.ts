import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixtures from "../../../evals/datasets/audio-phase1.json";
import { AUDIO_EXTRACTION_PROMPT } from "../prompts/audio-extraction-v1";
import { AudioExtractionResultSchema, createOpenAIAudioProviders, extractPlacesFromAudio, MAX_AUDIO_BYTES, readLocalAudio, validateTranscriptExtraction } from "./audio";
import { extractFromFixtures } from "./fake-extractor";

const transcript = "Visit Hoshi Coffee.";
const place = { name: "Hoshi Coffee", city: null, area: null, category: null, clues: [], excerpts: [transcript] };
const output = { extractedPlaces: [place] };
const envelope = (value: unknown = output) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
const reply = (body: unknown, status = 200) => Response.json(body, { status });
let folder: string;
let filepath: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "reel-audio-"));
  filepath = join(folder, "synthetic.wav");
  // Synthetic PCM WAV: silence, not a recording of a person.
  const wav = Buffer.alloc(46);
  wav.write("RIFF"); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
  await writeFile(filepath, wav);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden in audio tests"); }));
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(folder, { recursive: true, force: true }); });

it("runs local file -> multipart transcription -> strict structured extraction without network", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ text: transcript })).mockResolvedValueOnce(reply(envelope()));
  const result = await extractPlacesFromAudio(filepath, createOpenAIAudioProviders({ apiKey: "test-key", fetch: fetcher }));
  expect(result).toEqual({ transcript, ...output });
  expect(AudioExtractionResultSchema.safeParse(result).success).toBe(true);
  const [url, request] = fetcher.mock.calls[0]!;
  expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
  const form = request!.body as FormData;
  expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
  expect((form.get("file") as File).name).toBe("sample.wav");
  const body = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
  expect(body.store).toBe(false);
  expect(body.input).toEqual([{ role: "system", content: AUDIO_EXTRACTION_PROMPT }, { role: "user", content: transcript }]);
  expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, schema: { additionalProperties: false } });
  expect(body).not.toHaveProperty("tools");
});

it.each(["", "missing.wav"])("rejects missing input %s before provider calls", async name => {
  const transcribe = vi.fn();
  await expect(extractPlacesFromAudio(name ? join(folder, name) : name, { transcriber: { transcribe }, extractor: { extract: vi.fn() } })).rejects.toMatchObject({ code: "INVALID_FILE" });
  expect(transcribe).not.toHaveBeenCalled();
});
it("rejects empty files and directories", async () => {
  await writeFile(filepath, "");
  await expect(readLocalAudio(filepath)).rejects.toMatchObject({ code: "INVALID_FILE" });
  const dir = join(folder, "directory.wav"); await mkdir(dir);
  await expect(readLocalAudio(dir)).rejects.toMatchObject({ code: "INVALID_FILE" });
});
it.each(["sample.txt", "sample.mp4", "sample.webm"])("rejects unsupported type %s", async name => {
  await expect(readLocalAudio(join(folder, name))).rejects.toMatchObject({ code: "UNSUPPORTED_AUDIO_TYPE" });
});
it("rejects oversized audio before reading it", async () => {
  await truncate(filepath, MAX_AUDIO_BYTES + 1);
  await expect(readLocalAudio(filepath)).rejects.toMatchObject({ code: "AUDIO_TOO_LARGE" });
});
it("requires a key without calling the provider", () => {
  expect(() => createOpenAIAudioProviders({ apiKey: " " })).toThrow(expect.objectContaining({ code: "API_KEY_MISSING" }));
  expect(fetch).not.toHaveBeenCalled();
});
it.each([NaN, 0, -1, 300001])("rejects invalid timeout %s", timeoutMs => {
  expect(() => createOpenAIAudioProviders({ apiKey: "test", timeoutMs })).toThrow(expect.objectContaining({ code: "INVALID_CONFIGURATION" }));
});
it.each(["transcription", "extraction"])("bounds %s time even when fetch ignores abort", async stage => {
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const p = createOpenAIAudioProviders({ apiKey: "test", fetch: fetcher, timeoutMs: 5 });
  const operation = stage === "transcription" ? p.transcriber.transcribe(await readLocalAudio(filepath)) : p.extractor.extract(transcript);
  await expect(operation).rejects.toMatchObject({ code: `${stage.toUpperCase()}_TIMEOUT` });
  expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
});
it.each([401, 429, 500])("reports transcription HTTP %s failure without leaking provider body", async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ error: "secret-provider-body" }, status));
  await expect(extractPlacesFromAudio(filepath, createOpenAIAudioProviders({ apiKey: "test", fetch: fetcher }))).rejects.toMatchObject({
    code: "TRANSCRIPTION_FAILED", message: expect.not.stringContaining("secret-provider-body"),
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("handles transport failure and invalid transcription JSON shape", async () => {
  for (const fetcher of [vi.fn<typeof fetch>().mockRejectedValue(new Error("private detail")), vi.fn<typeof fetch>().mockResolvedValue(reply({ text: 123 }))]) {
    const p = createOpenAIAudioProviders({ apiKey: "test", fetch: fetcher });
    await expect(p.transcriber.transcribe(await readLocalAudio(filepath))).rejects.toMatchObject({ code: "TRANSCRIPTION_FAILED" });
  }
});
it.each([
  [{ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }, "LLM_REFUSAL"],
  [{ status: "incomplete", output: [] }, "EXTRACTION_FAILED"],
  [{ status: "completed", output: [] }, "MALFORMED_OUTPUT"],
  [{ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }] }, "MALFORMED_OUTPUT"],
  [envelope({ extractedPlaces: [{ ...place, coordinates: [1, 2] }] }), "MALFORMED_OUTPUT"],
  [envelope({ extractedPlaces: [{ ...place, excerpts: ["invented evidence"] }] }), "MALFORMED_OUTPUT"],
  [envelope({ extractedPlaces: [{ name: "missing fields" }] }), "MALFORMED_OUTPUT"],
])("rejects refusal, partial or malformed output %#", async (body, code) => {
  const p = createOpenAIAudioProviders({ apiKey: "test", fetch: vi.fn<typeof fetch>().mockResolvedValue(reply(body)) });
  await expect(p.extractor.extract(transcript)).rejects.toMatchObject({ code });
});
it("returns no places for silence without making an extraction request", async () => {
  const p = createOpenAIAudioProviders({ apiKey: "test" });
  expect(await p.extractor.extract("  ")).toEqual({ extractedPlaces: [] });
  expect(fetch).not.toHaveBeenCalled();
});
it("consolidates exact duplicates with evidence but keeps distinct branches", () => {
  const second = "Hoshi Coffee has a blue door.";
  const result = validateTranscriptExtraction({ extractedPlaces: [place, { ...place, excerpts: [second] }, { ...place, area: "Shibuya" }] }, `${transcript} ${second}`);
  expect(result.extractedPlaces).toHaveLength(2);
  expect(result.extractedPlaces[0]!.excerpts).toEqual([transcript, second]);
});
describe("synthetic development fixtures (not model quality measurements)", () => {
  it.each(fixtures.cases)("validates $id and preserves expected recovery", async fixture => {
    expect(fixture.synthetic).toBe(true);
    if (fixture.sourceType === "link") {
      expect(extractFromFixtures({ sourceType: "link", url: fixture.url!, note: null, details: null })).toMatchObject({ failureCode: "SOURCE_INACCESSIBLE" });
    } else {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(envelope(fixture.expected)));
      const p = createOpenAIAudioProviders({ apiKey: "test", fetch: fetcher });
      expect(await p.extractor.extract(fixture.transcript!)).toEqual(fixture.expected);
      expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).input[1].content).toBe(fixture.transcript);
    }
  });
});


it("reports extraction HTTP and transport failures", async () => {
  for (const fetcher of [vi.fn<typeof fetch>().mockResolvedValue(reply({}, 500)), vi.fn<typeof fetch>().mockRejectedValue(new Error("private detail"))]) {
    await expect(createOpenAIAudioProviders({ apiKey: "test", fetch: fetcher }).extractor.extract(transcript)).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  }
});
it("bounds a stalled response body, not just response headers", async () => {
  const response = new Response(new ReadableStream({ start() {} }));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(createOpenAIAudioProviders({ apiKey: "test", fetch: fetcher, timeoutMs: 5 }).extractor.extract(transcript)).rejects.toMatchObject({ code: "EXTRACTION_TIMEOUT" });
});

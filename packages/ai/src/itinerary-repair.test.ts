import { afterEach, expect, it, vi } from "vitest";
import { generateWithProvider, type ItineraryProviderRequest } from "./itinerary";
import { createOpenAIItineraryProvider } from "./openai-itinerary";
import { itineraryCases } from "../../../evals/itinerary/cases";
import { benchmarkItinerary } from "../../../evals/itinerary/benchmark";
const ctx = () => {
  const value = structuredClone(itineraryCases[0]!.input);
  value.preferences.breakMinutes = 0; value.preferences.transport = "walk";
  value.places[1]!.title = "Tokyo"; value.places[1]!.location = { lat: 35.686, lng: 139.76 };
  return value;
};
const proposal = (time = "12:30") => ({ days: [{ date: "2026-10-01", stops: [
  { kind: "place", referenceId: "art", start: "11:30" }, { kind: "place", referenceId: "food", start: time },
] }] });
const result = (time = "12:30") => ({ proposal: proposal(time), model: "test", usage: { inputTokens: 10, outputTokens: 5 } });
afterEach(() => vi.restoreAllMocks());
it("calculates a feasible timeline for the reported travel overlap without another model call", async () => {
  const generate = vi.fn().mockResolvedValue(result());
  const value = await generateWithProvider(ctx(), { id: "test", generate });
  expect(value.plan.conflicts.some(c => c.severity === "error")).toBe(false);
  expect(value.plan.days[0]!.stops.filter(s => s.kind === "place").map(s => s.placeId).sort()).toEqual(["art", "food"]);
  expect(value.generation).toMatchObject({ attempts: 1, inputTokens: 10, outputTokens: 5 });
  expect(generate).toHaveBeenCalledTimes(1);
});
const invalidResult = () => ({ ...result(), proposal: { days: [{ date: "2026-10-01", stops: [
  { kind: "place", referenceId: "unknown-place", start: "12:30" },
] }] } });
it("stops after two invalid proposals and records failed attempts in benchmarks", async () => {
  const generate = vi.fn().mockResolvedValue(invalidResult());
  const measured = await benchmarkItinerary(ctx(), { id: "test", generate });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(measured).toMatchObject({ accepted: false, attempts: 2, inputTokens: 20, outputTokens: 10 });
  expect(measured.attemptDetails.every(a => a.issues.length > 0)).toBe(true);
});
it("preserves single-attempt benchmarking and does not repair valid proposals", async () => {
  const generate = vi.fn().mockResolvedValue(result());
  expect((await benchmarkItinerary(ctx(), { id: "test", generate }, { maxAttempts: 1 })).attempts).toBe(1);
  generate.mockReset().mockResolvedValue(result("12:45"));
  const value = await generateWithProvider(ctx(), { id: "test", generate });
  expect(generate).toHaveBeenCalledTimes(1); expect(value.generation.attempts).toBe(1);
});
it("does not hide unknown token usage or echo malformed fields", async () => {
  const generate = vi.fn().mockResolvedValueOnce({ ...result(), proposal: { days: [], secretExtra: "do not echo" }, usage: { inputTokens: null, outputTokens: 1 } })
    .mockResolvedValueOnce(result("12:45"));
  const value = await generateWithProvider(ctx(), { id: "test", generate });
  expect(generate.mock.calls[1]![0].repair).toEqual({ proposal: null, issues: ["SCHEMA: Invalid itinerary JSON."] });
  expect(value.generation).toMatchObject({ inputTokens: null, outputTokens: 6 });
});
it("never moves a booking to accept a repaired schedule", async () => {
  const input = structuredClone(itineraryCases[1]!.input);
  const generate = vi.fn().mockResolvedValue({ ...result(), proposal: { days: [{ date: "2026-10-01", stops: [
    { kind: "reservation", referenceId: "booking", start: "13:00" },
  ] }] } });
  await expect(generateWithProvider(input, { id: "test", generate })).rejects.toMatchObject({ issues: expect.arrayContaining(["BOOKING_TIME: Booking dates and times cannot move."]) });
  expect(generate).toHaveBeenCalledTimes(2);
});
it("does not retry provider failures, including a failure during repair", async () => {
  const generate = vi.fn().mockRejectedValue(new Error("provider unavailable"));
  await expect(generateWithProvider(ctx(), { id: "test", generate })).rejects.toThrow("provider unavailable");
  expect(generate).toHaveBeenCalledTimes(1);
  generate.mockReset().mockResolvedValueOnce(invalidResult()).mockRejectedValueOnce(new Error("repair unavailable"));
  const measured = await benchmarkItinerary(ctx(), { id: "test", generate });
  expect(measured).toMatchObject({ accepted: false, attempts: 2, inputTokens: null, outputTokens: null });
  expect(measured.attemptDetails[0]?.response?.usage.inputTokens).toBe(10);
});
it("passes feedback through the OpenAI adapter as untrusted user data", async () => {
  const envelope = (time: string) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(time === "12:30" ? invalidResult().proposal : proposal(time)) }] }] });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(envelope("12:30")).mockResolvedValueOnce(envelope("12:45"));
  await generateWithProvider(ctx(), createOpenAIItineraryProvider({ apiKey: "test", fetch: fetcher }));
  const body = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
  expect(body.input[0].content).toContain("untrusted data");
  expect(JSON.parse(body.input[1].content).repair.issues.join()).toContain("PLACE_UNKNOWN");
  expect(body.text.format.strict).toBe(true);
});
it("shares the overall deadline with repair", async () => {
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const generate = vi.fn().mockImplementationOnce(async () => { now.mockReturnValue(24_000); return invalidResult(); }).mockResolvedValueOnce(result("12:45"));
  await generateWithProvider(ctx(), { id: "test", generate });
  expect(generate.mock.calls[0]![0].limits.timeoutMs).toBe(25_000);
  expect(generate.mock.calls[1]![0].limits.timeoutMs).toBe(16_000);
});
it("does not start a repair without enough remaining time", async () => {
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const generate = vi.fn().mockImplementation(async () => { now.mockReturnValue(39_500); return invalidResult(); });
  await expect(generateWithProvider(ctx(), { id: "test", generate })).rejects.toThrow("deadline");
  expect(generate).toHaveBeenCalledTimes(1);
});
it("bounds an adapter that ignores its timeout", async () => {
  vi.useFakeTimers();
  try {
    const generate = vi.fn(() => new Promise<never>(() => {}));
    const pending = expect(generateWithProvider(ctx(), { id: "test", generate })).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(25_000); await pending;
    expect(generate).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
it("allows an explicit evaluation budget while sharing the remaining time with repair", async () => {
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const generate = vi.fn().mockImplementationOnce(async () => { now.mockReturnValue(80_000); return invalidResult(); }).mockResolvedValueOnce(result("12:45"));
  await generateWithProvider(ctx(), { id: "test", generate }, {
    budget: { callTimeoutMs: 90_000, totalTimeoutMs: 150_000, maxOutputTokens: 4000 },
  });
  expect(generate.mock.calls[0]![0].limits).toEqual({ timeoutMs: 90_000, maxOutputTokens: 4000 });
  expect(generate.mock.calls[1]![0].limits.timeoutMs).toBe(70_000);
});
it("rejects invalid evaluation budgets before contacting a provider", async () => {
  const generate = vi.fn();
  await expect(generateWithProvider(ctx(), { id: "test", generate }, {
    budget: { callTimeoutMs: 0, totalTimeoutMs: 150_000, maxOutputTokens: 8000 },
  })).rejects.toThrow("Invalid evaluation budget");
  expect(generate).not.toHaveBeenCalled();
});

it("targets practical weaknesses and keeps the better repaired plan", async () => {
  const input = ctx(); input.preferences.dayEnd = "14:00";
  const tooLong = { ...result(), proposal: { days: [{ date: input.startDate, stops: [
    { kind: "place", referenceId: "art", start: "09:00", durationMinutes: 480 },
    { kind: "place", referenceId: "food", start: "12:00", durationMinutes: 60 },
  ] }] } };
  const generate = vi.fn().mockResolvedValueOnce(tooLong).mockImplementationOnce(async (request: ItineraryProviderRequest) => {
    expect(request.repair!.issues.join()).toContain("QUALITY_OMITTED_PLACE");
    return result();
  });
  const value = await generateWithProvider(input, { id: "test", generate });
  expect(value.plan.quality).toMatchObject({ savedPlacesScheduled: 2, repairApplied: true });
  expect(value.generation.attempts).toBe(2);
});
it("keeps a valid partial plan when optional quality repair has a provider failure", async () => {
  const input = ctx(); input.places[0]!.openingHours = { status: "known", windows: [] };
  const generate = vi.fn().mockResolvedValueOnce(result()).mockRejectedValueOnce(Error("repair unavailable"));
  const value = await generateWithProvider(input, { id: "test", generate });
  expect(value.plan.unscheduledPlaceIds).toEqual(["art"]);
  expect(value.plan.quality!.issues.some(i => i.code === "OMITTED_PLACE")).toBe(true);
  expect(value.generation).toMatchObject({ attempts: 2, inputTokens: null, outputTokens: null });
});
it("keeps a valid draft when quality repair returns invalid identities", async () => {
  const input = ctx(); input.places[0]!.openingHours = { status: "known", windows: [] };
  const generate = vi.fn().mockResolvedValueOnce(result()).mockResolvedValueOnce(invalidResult());
  const value = await generateWithProvider(input, { id: "test", generate });
  expect(value.plan.days.flatMap(d => d.stops).some(s => s.placeId === "food")).toBe(true);
  expect(value.generation.attempts).toBe(2);
});
it("returns the checked draft if no time remains for optional quality repair", async () => {
  const input = ctx(); input.places[0]!.openingHours = { status: "known", windows: [] };
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  const generate = vi.fn().mockImplementation(async () => { now.mockReturnValue(39_500); return result(); });
  const value = await generateWithProvider(input, { id: "test", generate });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(value.plan.unscheduledPlaceIds).toEqual(["art"]);
});
it("benchmark retains an accepted draft and selected model after a failed quality-repair call", async () => {
  const input = ctx(); input.places[0]!.openingHours = { status: "known", windows: [] };
  const generate = vi.fn().mockResolvedValueOnce(result()).mockRejectedValueOnce(Error("repair unavailable"));
  const measured = await benchmarkItinerary(input, { id: "test", generate });
  expect(measured).toMatchObject({ accepted: true, model: "test", attempts: 2, inputTokens: null });
  expect(measured.plan?.quality?.savedPlacesScheduled).toBe(1);
  expect(measured.attemptDetails[1]?.issues).toEqual(["PROVIDER_FAILURE"]);
});

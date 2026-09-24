import { expect, it, vi } from "vitest";
import { generateWithProvider, prepareItineraryRequest, itineraryRequestHash } from "./itinerary";
import { createOpenAIItineraryProvider } from "./openai-itinerary";
import { itineraryCases } from "../../../evals/itinerary/cases";
import { baselineProvider, benchmarkItinerary } from "../../../evals/itinerary/benchmark";
const ctx = () => structuredClone(itineraryCases[0]!.input);
const proposal = { days: [{ date: "2026-10-01", stops: [{ kind: "place", referenceId: "art", start: "09:00" }] }] };
const envelope = (change = {}) => ({ status: "completed", model: "synthetic-model", usage: { input_tokens: 20, output_tokens: 10 },
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }], ...change });
it("sends preferences/dates/confirmed facts through strict Responses output with no private notes", async () => {
  const input = structuredClone(itineraryCases[1]!.input);
  const request = prepareItineraryRequest(input);
  const serialized = JSON.stringify(request.input);
  expect(serialized).not.toContain("Private note"); expect(serialized).not.toContain("sourceInspirationIds");
  expect(request.input).toMatchObject({ timezone: "Asia/Tokyo", preferences: { budget: "low", interests: ["art"] } });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
  await createOpenAIItineraryProvider({ apiKey: "synthetic-secret", model: "chosen-model", fetch: fetcher }).generate(request);
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(body).toMatchObject({ model: "chosen-model", store: false, max_output_tokens: 8000, text: { format: { strict: true, type: "json_schema" } } });
  expect(body.input[0].content).toContain("untrusted data");
  expect(JSON.stringify(body)).not.toContain("synthetic-secret");
});
it.each([
  { status: "incomplete" },
  { output: [{ type: "message", content: [{ type: "refusal" }] }] },
  { output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] },
])("rejects partial/refused/malformed model output without accepting a schedule", async change => {
  const provider = createOpenAIItineraryProvider({ apiKey: "test", fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope(change))) });
  await expect(generateWithProvider(ctx(), provider)).rejects.toThrow();
});
it("fails closed on provider errors or absent credentials", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret provider details", { status: 429 }));
  await expect(generateWithProvider(ctx(), createOpenAIItineraryProvider({ fetch: fetcher }))).rejects.toThrow("not configured");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(generateWithProvider(ctx(), createOpenAIItineraryProvider({ apiKey: "test", fetch: fetcher }))).rejects.toThrow("HTTP 429");
});
it("accepts a pluggable provider with identical validation and provenance", async () => {
  const result = await generateWithProvider(ctx(), { id: "synthetic-other", async generate() {
    return { proposal, model: "test", usage: { inputTokens: null, outputTokens: null } };
  } });
  expect(result.generation).toMatchObject({ provider: "synthetic-other", model: "test", promptVersion: "itinerary-v7", inputTokens: null });
  expect(result.generation.inputHash).toBe(itineraryRequestHash(prepareItineraryRequest(ctx())));
  expect(result.plan.unscheduledPlaceIds).toEqual([]);
});
it("bounds input before calling a provider", async () => {
  const input = ctx(); input.places = Array.from({ length: 51 }, () => input.places[0]!);
  const generate = vi.fn();
  await expect(generateWithProvider(input, { id: "test", generate })).rejects.toThrow("50 confirmed places");
  expect(generate).not.toHaveBeenCalled();
});
it("constrains trip day count and distinguishes bookable IDs in every provider schema", () => {
  const input = structuredClone(itineraryCases[1]!.input); input.endDate = "2026-10-02";
  const request = prepareItineraryRequest(input);
  expect(request.input.places.find(p => p.placeId === "food")?.visitAllowed).toBe(false);
  const schema = request.jsonSchema as { properties: { days: { minItems: number; maxItems: number } } };
  expect(schema.properties.days).toMatchObject({ minItems: 2, maxItems: 2 });
  expect(JSON.stringify(schema)).not.toContain('"food"');
  expect(JSON.stringify(schema)).toContain('"booking"');
});
it("provides the correct accommodation travel node for each date", () => {
  const input = ctx();
  input.endDate = "2026-10-02";
  input.preferences.accommodations = [
    { name: "First stay", location: { lat: 35.68, lng: 139.76 }, checkIn: "2026-10-01", checkOut: "2026-10-01" },
    { name: "Second stay", location: { lat: 36, lng: 140 }, checkIn: "2026-10-02", checkOut: "2026-10-02" },
  ];
  const request = prepareItineraryRequest(input);
  expect(request.promptVersion).toBe("itinerary-v7");
  expect(request.systemPrompt).toContain("preferences.accommodations");
  expect(request.systemPrompt).toContain("Pace and suggestedPlaceVisitsPerDay are guidelines, not quotas");
  expect(request.input).toHaveProperty("suggestedPlaceVisitsPerDay");
  expect(request.input).not.toHaveProperty("maxPlaceVisitsPerDay");
  expect(request.input.dates.map(day => day.accommodationNodeId)).toEqual([
    "accommodation:2026-10-01", "accommodation:2026-10-02",
  ]);
  const art = request.input.travel.nodeIds.indexOf("art");
  const first = request.input.travel.nodeIds.indexOf("accommodation:2026-10-01");
  const second = request.input.travel.nodeIds.indexOf("accommodation:2026-10-02");
  expect(request.input.travel.minutes[first]![art]).toBe(0);
  expect(request.input.travel.minutes[second]![art]).toBeGreaterThan(0);
});
it("benchmark measures recovered saved-place coverage and retains provider failures", async () => {
  const empty = await benchmarkItinerary(ctx(), { id: "test", async generate() { return {
    proposal: { days: [{ date: "2026-10-01", stops: [] }] }, model: "test", usage: { inputTokens: 10, outputTokens: 5 },
  }; } });
  expect(empty).toMatchObject({ accepted: true, coverage: 1, mustVisitCoverage: 1, costUsd: null });
  const failed = await benchmarkItinerary(ctx(), { id: "test", async generate() { throw Error("PRIVATE"); } });
  expect(failed).toMatchObject({ accepted: false, schemaValid: false, issues: ["PROVIDER_FAILURE"] });
  expect(JSON.stringify(failed)).not.toContain("PRIVATE");
  const baseline = await benchmarkItinerary(ctx(), baselineProvider(ctx()));
  expect(baseline.provider).toBe("baseline"); expect(baseline.inputTokens).toBe(0);
});
it("passes a source itinerary day to the model as a hint, and null when absent", () => {
  const input = ctx();
  input.places[0]!.sourceDay = 2;
  const places = prepareItineraryRequest(input).input.places;
  expect(places.find((p) => p.placeId === input.places[0]!.placeId)?.sourceDay).toBe(2);
  expect(places.find((p) => p.placeId === input.places[1]!.placeId)?.sourceDay).toBeNull();
  expect(prepareItineraryRequest(input).systemPrompt).toContain("sourceDay");
});

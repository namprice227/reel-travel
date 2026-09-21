import { createHash } from "node:crypto";
import { z } from "zod";
import { GenerationInfo, ItineraryProposal, LocalTime, stayOn } from "@reel/contracts";
import { compileProposal, datesBetween, PACE_CAPACITY, travelMinutes, weekday, type PlannerContext } from "@reel/planner";
import { ITINERARY_PROMPT, ITINERARY_PROMPT_VERSION } from "../prompts/itinerary-v1";
import { ProviderError } from "./provider-request";

/** Allowlisted, serializable input shared by all adapters. No account IDs, transcripts, photos or booking notes. */
export function planningInput(ctx: PlannerContext) {
  if (ctx.places.length > 50 || ctx.reservations.length > 30)
    throw new ProviderError("INPUT_LIMIT", "AI planning supports up to 50 confirmed places and 30 bookings.");
  const dates = datesBetween(ctx.startDate, ctx.endDate);
  if (!dates.length || dates.length > 7) throw new ProviderError("INPUT_LIMIT", "AI planning supports one to seven days.");
  const places = [...ctx.places].sort((a, b) => a.placeId.localeCompare(b.placeId));
  const booked = new Set(ctx.reservations.flatMap(r => r.placeId ? [r.placeId] : []));
  const accommodationNodes = dates.map(date => ({
    id: `accommodation:${date}`,
    location: stayOn(ctx.preferences.accommodations, date)?.location ?? null,
  }));
  const nodes = [...accommodationNodes,
    ...places.map(p => ({ id: p.placeId, location: p.location })),
    ...ctx.reservations.map(r => ({ id: r.id, location: places.find(p => p.placeId === r.placeId)?.location ?? null }))];
  const input = {
    destination: ctx.destination ?? null, timezone: ctx.timezone ?? null,
    dates: dates.map(date => ({ date, weekday: weekday(date), accommodationNodeId: `accommodation:${date}` })),
    preferences: ctx.preferences,
    maxPlaceVisitsPerDay: PACE_CAPACITY[ctx.preferences.pace],
    places: places.map(p => ({ placeId: p.placeId, title: p.title, location: p.location, visitAllowed: !booked.has(p.placeId),
      openingHours: p.openingHours, visitMinutes: p.visitMinutes, category: p.category ?? null, priceLevel: p.priceLevel ?? null })),
    bookings: [...ctx.reservations].sort((a, b) => a.id.localeCompare(b.id)).map(r => ({
      id: r.id, title: r.title, placeId: r.placeId, start: r.start, end: r.end, locked: r.locked,
    })),
    travel: { nodeIds: nodes.map(n => n.id), minutes: nodes.map(a => nodes.map(b => travelMinutes(a.location, b.location, ctx.preferences.transport))) },
  };
  if (JSON.stringify(input).length > 100_000) throw new ProviderError("INPUT_LIMIT", "Planning input exceeds 100000 characters.");
  return input;
}

export interface ItineraryProviderRequest {
  input: ReturnType<typeof planningInput>;
  systemPrompt: string;
  promptVersion: string;
  jsonSchema: Record<string, unknown>;
  limits: { timeoutMs: number; maxOutputTokens: number };
}
export interface ItineraryProviderResult {
  proposal: unknown;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}
/** Implement this interface to plug in Gemini, Ollama or another planning agent. */
export interface ItineraryProvider {
  readonly id: string;
  generate(request: ItineraryProviderRequest): Promise<ItineraryProviderResult>;
}

export function prepareItineraryRequest(ctx: PlannerContext): ItineraryProviderRequest {
  const input = planningInput(ctx);
  // Constrain date vocabulary and day count per request. The compiler still checks order and uniqueness.
  const dates = input.dates.map(d => d.date) as [string, ...string[]];
  const placeIds = input.places.filter(p => p.visitAllowed).map(p => p.placeId);
  const bookingIds = input.bookings.map(b => b.id);
  const variants = [];
  if (placeIds.length) variants.push(z.strictObject({ kind: z.literal("place"), referenceId: z.enum(placeIds as [string, ...string[]]), start: LocalTime }));
  if (bookingIds.length) variants.push(z.strictObject({ kind: z.literal("reservation"), referenceId: z.enum(bookingIds as [string, ...string[]]), start: LocalTime }));
  if (input.preferences.breakMinutes > 0) variants.push(z.strictObject({ kind: z.literal("break"), referenceId: z.null(), start: LocalTime }));
  const stopSchema = variants.length === 1 ? variants[0]! : variants.length > 1 ? z.union(variants) : ItineraryProposal.shape.days.element.shape.stops.element;
  const schema = ItineraryProposal.extend({ days: z.array(ItineraryProposal.shape.days.element.extend({
    date: z.enum(dates),
    stops: z.array(stopSchema).max(variants.length ? 24 : 0),
  })).length(dates.length) });
  return { input, systemPrompt: ITINERARY_PROMPT, promptVersion: ITINERARY_PROMPT_VERSION,
    jsonSchema: z.toJSONSchema(schema, { target: "draft-7" }), limits: { timeoutMs: 40_000, maxOutputTokens: 8000 } };
}
export function itineraryRequestHash(request: ItineraryProviderRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

/** Exactly one bounded provider attempt. Same compiler for every model; never silently fall back. */
export async function generateWithProvider(ctx: PlannerContext, provider: ItineraryProvider) {
  const request = prepareItineraryRequest(ctx);
  const inputHash = itineraryRequestHash(request);
  const start = performance.now();
  const response = await provider.generate(structuredClone(request));
  const plan = compileProposal(response.proposal, ctx);
  const generation = GenerationInfo.parse({ provider: provider.id, model: response.model, promptVersion: request.promptVersion,
    inputHash, durationMs: performance.now() - start, ...response.usage });
  return { plan, generation };
}

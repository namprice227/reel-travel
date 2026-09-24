import { createHash } from "node:crypto";
import { z } from "zod";
import { GenerationInfo, ItineraryProposal, LocalTime, stayOn } from "@reel/contracts";
import { scheduleProposal, betterPlan, ProposalError, datesBetween, PACE_CAPACITY, travelMinutes, weekday, type PlannerContext, type PlanResult } from "@reel/planner";
import { ITINERARY_PROMPT, ITINERARY_PROMPT_VERSION } from "../prompts/itinerary-v7";
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
    weather: ctx.weather ?? [],
    dates: dates.map(date => ({ date, weekday: weekday(date), accommodationNodeId: `accommodation:${date}` })),
    preferences: ctx.preferences,
    suggestedPlaceVisitsPerDay: PACE_CAPACITY[ctx.preferences.pace],
    places: places.map(p => ({ placeId: p.placeId, title: p.title, location: p.location, visitAllowed: !booked.has(p.placeId),
      openingHours: p.openingHours, visitMinutes: p.visitMinutes, category: p.category ?? null, priceLevel: p.priceLevel ?? null,
      sourceDay: p.sourceDay ?? null })),
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
  repair?: { proposal: ItineraryProposal | null; issues: string[] };
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
  if (placeIds.length) variants.push(z.strictObject({ kind: z.literal("place"), referenceId: z.enum(placeIds as [string, ...string[]]), start: LocalTime, durationMinutes: z.number().int().min(15).max(480).nullable() }));
  if (bookingIds.length) variants.push(z.strictObject({ kind: z.literal("reservation"), referenceId: z.enum(bookingIds as [string, ...string[]]), start: LocalTime }));
  variants.push(z.strictObject({ kind: z.literal("break"), referenceId: z.null(), start: LocalTime,
    durationMinutes: z.number().int().min(15).max(240).nullable() }));
  for (const kind of ["meal", "suggestion"] as const) variants.push(z.strictObject({
    kind: z.literal(kind), referenceId: z.null(), start: LocalTime,
    durationMinutes: z.number().int().min(15).max(480), title: z.string().min(1).max(160),
    area: z.string().min(1).max(160), reason: z.string().min(1).max(500),
  }));
  const stopSchema = variants.length === 1 ? variants[0]! : variants.length > 1 ? z.union(variants) : ItineraryProposal.shape.days.element.shape.stops.element;
  const schema = ItineraryProposal.extend({ seasonalAdvice: z.string().max(800).nullable(), days: z.array(ItineraryProposal.shape.days.element.extend({
    date: z.enum(dates),
    stops: z.array(stopSchema).max(variants.length ? 24 : 0),
  })).length(dates.length) });
  return { input, systemPrompt: ITINERARY_PROMPT, promptVersion: ITINERARY_PROMPT_VERSION,
    jsonSchema: z.toJSONSchema(schema, { target: "draft-7" }), limits: { timeoutMs: 25_000, maxOutputTokens: 8000 } };
}
export function itineraryRequestHash(request: ItineraryProviderRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export interface GenerationAttempt {
  response?: ItineraryProviderResult;
  /** Checked schedule for this attempt, distinct from the raw model proposal. */
  plan?: PlanResult;
  schemaValid: boolean;
  issues: string[];
  durationMs: number;
  requestHash: string;
}

export function itineraryUsage(attempts: GenerationAttempt[]) {
  const sum = (key: "inputTokens" | "outputTokens") => attempts.length && attempts.every(a => a.response?.usage[key] != null)
    ? attempts.reduce((n, a) => n + a.response!.usage[key]!, 0) : null;
  return { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens") };
}

/** At most one model repair within 40 seconds. A valid first draft survives failed quality repair. */
export async function generateWithProvider(ctx: PlannerContext, provider: ItineraryProvider,
  options: { maxAttempts?: 1 | 2; onAttempt?: (attempt: GenerationAttempt) => void;
    /** Evaluation-only budget override; application callers retain interactive defaults. */
    budget?: { callTimeoutMs: number; totalTimeoutMs: number; maxOutputTokens: number } } = {}) {
  const request = prepareItineraryRequest(ctx);
  if (options.budget) {
    const b = options.budget;
    if (![b.callTimeoutMs, b.totalTimeoutMs, b.maxOutputTokens].every(n => Number.isInteger(n) && n > 0)
      || b.callTimeoutMs > 300_000 || b.totalTimeoutMs > 600_000 || b.maxOutputTokens > 32_768) throw Error("Invalid evaluation budget");
    request.limits = { timeoutMs: b.callTimeoutMs, maxOutputTokens: b.maxOutputTokens };
  }
  const inputHash = itineraryRequestHash(request);
  const start = performance.now();
  const attempts: GenerationAttempt[] = [];
  const maxAttempts = options.maxAttempts ?? 2;
  let best: { plan: PlanResult; model: string } | undefined;
  const finish = () => ({ plan: best!.plan, generation: GenerationInfo.parse({
    provider: provider.id, model: best!.model, promptVersion: request.promptVersion, inputHash,
    attempts: attempts.length, durationMs: performance.now() - start, ...itineraryUsage(attempts),
  }) });
  for (let index = 0; index < maxAttempts; index++) {
    const remaining = Math.floor((options.budget?.totalTimeoutMs ?? 40_000) - (performance.now() - start));
    if (remaining < 1000 && best) return finish();
    if (remaining < 1000) throw new ProviderError("GENERATION_FAILED", "Itinerary generation deadline reached.");
    const next = { ...request, limits: { ...request.limits, timeoutMs: Math.min(request.limits.timeoutMs, remaining) } };
    const attemptStart = performance.now();
    let response: ItineraryProviderResult | undefined;
    let schemaValid = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const record = (issues: string[], plan?: PlanResult) => {
      const attempt = { response, plan, schemaValid, issues, durationMs: performance.now() - attemptStart, requestHash: itineraryRequestHash(next) };
      attempts.push(attempt); options.onAttempt?.(attempt);
    };
    try {
      // Adapters must cancel their own transport; also bound adapters that ignore the supplied deadline.
      response = await Promise.race([provider.generate(structuredClone(next)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderError("GENERATION_FAILED", "Itinerary provider timed out.")), next.limits.timeoutMs);
      })]);
    } catch (error) {
      record(["PROVIDER_FAILURE"]);
      if (best) return finish();
      throw error;
    } finally { clearTimeout(timer); }
    const parsed = ItineraryProposal.safeParse(response.proposal);
    schemaValid = parsed.success;
    let plan;
    try { plan = scheduleProposal(response.proposal, ctx); }
    catch (error) {
      if (!(error instanceof ProposalError)) { record(["VALIDATION_FAILURE"]); throw error; }
      record(error.issues);
      if (index + 1 === maxAttempts) { if (best) return finish(); throw error; }
      // Never echo arbitrary malformed fields or unlimited provider text back into the prompt.
      request.repair = { proposal: parsed.success ? parsed.data : null, issues: error.issues.slice(0, 20).map(s => s.slice(0, 500)) };
      continue;
    }
    if (!best || betterPlan(plan, best.plan, ctx)) {
      if (index > 0 && plan.quality) plan.quality.repairApplied = true;
      best = { plan, model: response.model };
    }
    const weaknesses = plan.quality!.issues.filter(i => ["OMITTED_PLACE", "RUSHED_VISIT", "EXCESS_TRAVEL", "WEATHER", "MEAL_WINDOW", "FILLER"].includes(i.code));
    if (plan.quality!.score < 85 && weaknesses.length && index + 1 < maxAttempts) {
      const issues = weaknesses.slice(0, 10).map(i => `QUALITY_${i.code}: ${i.message} ${i.alternatives.join(" ")}`.slice(0, 500));
      record(issues, plan);
      request.repair = { proposal: parsed.success ? parsed.data : null, issues };
      continue;
    }
    record([], plan);
    return finish();
  }
  throw new ProviderError("GENERATION_FAILED", "Itinerary generation failed.");
}

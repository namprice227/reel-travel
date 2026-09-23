import { generatePlan, compileProposal, ProposalError, type PlannerContext } from "@reel/planner";
import { generateWithProvider, itineraryUsage, type GenerationAttempt, itineraryRequestHash, prepareItineraryRequest, type ItineraryProvider, type ItineraryProviderResult } from "@reel/ai/itinerary";

/** The old heuristic is an explicit comparator, never a fallback for a failed model. */
export function baselineProvider(ctx: PlannerContext): ItineraryProvider {
  return { id: "baseline", async generate() {
    const plan = generatePlan(ctx);
    return { model: "greedy-v2", usage: { inputTokens: 0, outputTokens: 0 }, proposal: {
      days: plan.days.map(d => ({ date: d.date, stops: d.stops.map(s => ({ kind: s.kind,
        referenceId: s.kind === "reservation" ? s.reservationId : s.placeId, start: s.start })) })),
    } };
  } };
}

/** No persistence or live provider lookup. Every attempt is recorded, including refusals and invalid schedules. */
export async function benchmarkItinerary(input: PlannerContext, provider: ItineraryProvider, options: { maxAttempts?: 1 | 2; budget?: { callTimeoutMs: number; totalTimeoutMs: number; maxOutputTokens: number } } = {}) {
  const request = prepareItineraryRequest(input);
  const start = performance.now();
  let response: ItineraryProviderResult | undefined;
  let schemaValid = false;
  let selectedModel: string | undefined;
  const attempts: GenerationAttempt[] = [];
  try {
    const outcome = provider.id === "baseline" ? await runBaseline() : await generateWithProvider(input, provider, { maxAttempts: options.maxAttempts ?? (provider.id === "baseline" ? 1 : 2),
      budget: options.budget, onAttempt: attempt => { attempts.push(attempt); response = attempt.response; schemaValid = attempt.schemaValid; } });
    const plan = outcome.plan;
    selectedModel = outcome.generation?.model ?? response?.model;
    const scheduled = new Set(plan.days.flatMap(d => d.stops.flatMap(s => s.placeId ? [s.placeId] : [])));
    const wanted = new Set(input.preferences.mustVisitPlaceIds);
    const stops = plan.days.flatMap(d => d.stops);
    const unknownTravelLegs = stops.filter(s => s.travelMinutesBefore === null).length;
    return { ...metadata(), plan, accepted: true, issues: [] as string[],
      coverage: input.places.length ? scheduled.size / input.places.length : null,
      mustVisitCoverage: wanted.size ? [...wanted].filter(id => scheduled.has(id)).length / wanted.size : null,
      travelMinutes: unknownTravelLegs ? null : stops.reduce((total, s) => total + (s.travelMinutesBefore ?? 0), 0),
      unknownTravelLegs, validationStatus: plan.validationStatus,
      unscheduledPlaceIds: plan.unscheduledPlaceIds, proposal: response?.proposal ?? null,
    };
  } catch (error) {
    return { ...metadata(), plan: null, accepted: false, issues: error instanceof ProposalError ? error.issues : ["PROVIDER_FAILURE"],
      coverage: null, mustVisitCoverage: null, travelMinutes: null, unknownTravelLegs: null,
      validationStatus: null, unscheduledPlaceIds: null, proposal: response?.proposal ?? null };
  }
  async function runBaseline() {
    // Preserve the greedy comparator: do not silently pass it through the new hybrid scheduler.
    response = await provider.generate(request);
    schemaValid = true;
    let plan;
    try { plan = compileProposal(response.proposal, input); }
    catch (error) {
      attempts.push({ response, schemaValid, issues: error instanceof ProposalError ? error.issues : ["VALIDATION_FAILURE"], durationMs: performance.now() - start, requestHash: itineraryRequestHash(request) });
      throw error;
    }
    attempts.push({ response, plan, schemaValid, issues: [], durationMs: performance.now() - start, requestHash: itineraryRequestHash(request) });
    return { plan, generation: undefined };
  }
  function metadata() {
    return { provider: provider.id, model: selectedModel ?? response?.model ?? null, promptVersion: request.promptVersion,
      inputHash: itineraryRequestHash(request), latencyMs: performance.now() - start, schemaValid,
      ...itineraryUsage(attempts), attempts: attempts.length, attemptDetails: attempts,
      costUsd: null, humanPreferenceScore: null };
  }
}

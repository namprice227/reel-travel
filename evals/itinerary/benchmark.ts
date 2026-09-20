import { ItineraryProposal } from "@reel/contracts";
import { generatePlan, compileProposal, ProposalError, type PlannerContext } from "@reel/planner";
import { itineraryRequestHash, prepareItineraryRequest, type ItineraryProvider, type ItineraryProviderResult } from "@reel/ai/itinerary";

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
export async function benchmarkItinerary(input: PlannerContext, provider: ItineraryProvider) {
  const request = prepareItineraryRequest(input);
  const start = performance.now();
  let response: ItineraryProviderResult | undefined;
  let schemaValid = false;
  try {
    response = await provider.generate(structuredClone(request));
    schemaValid = ItineraryProposal.safeParse(response.proposal).success;
    const plan = compileProposal(response.proposal, input);
    const scheduled = new Set(plan.days.flatMap(d => d.stops.flatMap(s => s.placeId ? [s.placeId] : [])));
    const wanted = new Set(input.preferences.mustVisitPlaceIds);
    const stops = plan.days.flatMap(d => d.stops);
    const unknownTravelLegs = stops.filter(s => s.travelMinutesBefore === null).length;
    return { ...metadata(), accepted: true, issues: [] as string[],
      coverage: input.places.length ? scheduled.size / input.places.length : null,
      mustVisitCoverage: wanted.size ? [...wanted].filter(id => scheduled.has(id)).length / wanted.size : null,
      travelMinutes: unknownTravelLegs ? null : stops.reduce((total, s) => total + (s.travelMinutesBefore ?? 0), 0),
      unknownTravelLegs, validationStatus: plan.validationStatus,
      unscheduledPlaceIds: plan.unscheduledPlaceIds, proposal: response.proposal,
    };
  } catch (error) {
    return { ...metadata(), accepted: false, issues: error instanceof ProposalError ? error.issues : ["PROVIDER_FAILURE"],
      coverage: null, mustVisitCoverage: null, travelMinutes: null, unknownTravelLegs: null,
      validationStatus: null, unscheduledPlaceIds: null, proposal: response?.proposal ?? null };
  }
  function metadata() {
    return { provider: provider.id, model: response?.model ?? null, promptVersion: request.promptVersion,
      inputHash: itineraryRequestHash(request), latencyMs: performance.now() - start, schemaValid,
      inputTokens: response?.usage.inputTokens ?? null, outputTokens: response?.usage.outputTokens ?? null,
      costUsd: null, humanPreferenceScore: null };
  }
}

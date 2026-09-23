import Ajv from "ajv";
import { ItineraryProposal } from "@reel/contracts";
import { compileProposal, ProposalError, toMinutes } from "@reel/planner";
import { prepareItineraryRequest } from "@reel/ai/itinerary";
import type { ComparisonCase } from "./comparison-cases";

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
/** Additional metrics never change the application acceptance decision. */
export function scoreProposal(raw: unknown, fixture: ComparisonCase) {
  const validate = ajv.compile(prepareItineraryRequest(fixture.input).jsonSchema);
  const strictSchemaValid = validate(raw);
  const schemaErrors = validate.errors?.map(e => `${e.instancePath}: ${e.message}`) ?? [];
  const parsed = ItineraryProposal.safeParse(raw);
  let accepted = false, issues: string[] = [];
  try { compileProposal(raw, fixture.input); accepted = true; }
  catch (e) { issues = e instanceof ProposalError ? e.issues : ["VALIDATION_FAILURE"]; }
  if (!parsed.success) return { strictSchemaValid, schemaErrors, accepted, issues, quality: null };
  const proposal = parsed.data;
  const stops = proposal.days.flatMap(d=>d.stops);
  const referenced = new Set(stops.flatMap(s=>s.kind === "place" && s.referenceId ? [s.referenceId] : s.kind === "reservation"
    ? fixture.input.reservations.filter(r=>r.id===s.referenceId && r.placeId).map(r=>r.placeId!) : []));
  const targets = fixture.targetPlaceIds;
  const targetCoverage = targets.length ? targets.filter(id=>referenced.has(id)).length / targets.length : null;
  const lunchDates = fixture.mealDates.filter(date => proposal.days.find(d=>d.date===date)?.stops.some(s=> {
    const start=toMinutes(s.start);
    if(start<11*60 || start>14*60) return false;
    if(s.kind==="meal") return true;
    if(s.kind==="place") return /restaurant|cafe|food/.test(fixture.input.places.find(p=>p.placeId===s.referenceId)?.category??"");
    return s.kind==="reservation" && /lunch|dinner|food|restaurant/.test(fixture.input.reservations.find(r=>r.id===s.referenceId)?.title??"");
  }));
  const mealCoverage = fixture.mealDates.length ? lunchDates.length/fixture.mealDates.length : null;
  const suggestionCount=stops.filter(s=>s.kind==="suggestion").length;
  const seasonalAdvicePresent=!!proposal.seasonalAdvice?.trim();
  const useful = accepted && (targetCoverage === null || targetCoverage===1)
    && (mealCoverage===null || mealCoverage===1) && (!fixture.requireSuggestions || suggestionCount>0) && seasonalAdvicePresent;
  return { strictSchemaValid, schemaErrors, accepted, issues, quality: { targetCoverage, mealCoverage,
    suggestionCount, seasonalAdvicePresent, stopCount:stops.length, useful,
    // Presence-based checks are proxies. They do not establish geographical or climate accuracy.
    unverifiedActivityCount:stops.filter(s=>s.kind==="suggestion"||s.kind==="meal").length } };
}

# OpenAI itinerary generation - 21 September 2026

## Implemented

Provider-neutral itinerary proposals and shared deterministic compilation. Backend loads saved dates,
daily times, timezone, preferences, confirmed places and bookings. OpenAI Responses adapter with strict
per-trip schema, versioned prompt, one bounded attempt, private credentials and shared account quotas.
Unknowns are retained; invalid plans never replace a version. Generation provenance and request hashes
are saved for accepted model results. Post-call input checks catch changes during generation.

Provider interface and six-case synthetic benchmark CLI support future model/adapter comparisons without
changing handlers, UI or validation. Gemini/Ollama transports and a held-out benchmark are not implemented.

## Validation actually run

- 27 initial focused planner/provider/service tests passed. Full suite then exposed three import tests
  that implicitly selected OpenAI generation while mocking extraction output; those tests now explicitly
  select the baseline generator. Dedicated generation tests mock the planning provider.
- Subsequent `npm run check` passed 418 tests plus type checks, API docs freshness and workspace validation.
- Live GPT-4o mini development smoke: normal one-day fixture passed in 2.699 seconds, 1,052 input/65 output
  tokens. No private trip data used. A separate two-day fixture with a booking also passed directly.
- Three initial full local UI attempts with GPT-4o mini were rejected: omitted day, invalid/repeated place
  reference, and missing/extra break. No itinerary was saved. Added exact date-count/date enums and distinct
  booking/visit reference enums to the per-request schema. These are development iterations, not independent
  held-out comparisons. Prompt and schema hashes distinguish versions.
- Final default is pinned `gpt-4.1-mini-2025-04-14`. Full live UI -> API -> OpenAI -> validator -> Supabase
  acceptance passed with a disposable synthetic account/trip: two dates, all three confirmed places, fixed
  lunch at 12:00-13:00, daily 10:00-17:00 window, provenance, persistence, reload, mobile overflow and no page
  errors (10 grouped assertions). Provider/compile time 3.062 seconds, 1,677 input/143 output tokens.
  Temporary accounts and trips were removed after every attempt. No production traveler data was used.
- Offline benchmark runner recorded six baseline attempts: four accepted, two rejected because the original
  greedy output omitted a requested break. This tests failure accounting; it is not a model quality ranking.
- Final `npm run check` passed all 421 tests in 33 files, workspace type checks, API docs freshness and
  planning validation. `npm run build` completed successfully (Next.js production build).

### Multi-stay contract repair

After `TripPreferences.accommodation` became the `accommodations` array, four stale evaluation/AI/compiler
references caused the workspace typecheck to fail. The fixtures now use complete accommodation records,
the deterministic proposal compiler selects `stayOn(accommodations, date)`, and AI input exposes a separate
accommodation travel node for every date. The system prompt version is now `itinerary-v2` so stored provenance
distinguishes the changed input semantics. Two focused suites passed 26 tests; final `npm run check` passed
432 tests in 35 files, type checks, API-document freshness and planning validation. Inputs were synthetic;
no live model, hosted runtime or human itinerary review was repeated for this repair.

## Limits

No formal multi-provider benchmark, cost measurement or independent human usability review. Screenshots
stay under ignored `.local/itinerary-ai-browser`. Timing is local development, not hosted latency. One good
run does not establish model reliability. Partial/invalid outputs fail closed with no automatic retries.
Travel is estimated, hours may be unknown, budget/interests remain soft. First/last-day arrival/departure
windows are not separately supported. The input re-read is not a database transaction spanning model work;
subsequent input changes still invalidate plans via the existing fingerprint. No migration or deployment.

## Sources

Implementation follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
The selected [GPT-4.1 mini snapshot](https://developers.openai.com/api/docs/models/gpt-4.1-mini) is configurable;
the selection is provisional pending the planned evaluation. [Design/setup](../../docs/operations/itinerary-ai.md),
[benchmark method](../../evals/itinerary/README.md).

# Automatic itinerary repair — 21 September 2026

Implemented on fix/BE12-itinerary-repair. No migration required.

## Behavior

The shared provider orchestrator makes at most two calls within a 40-second budget, with a 25-second
per-call limit and 8,000 output tokens per call. A rejected proposal gets one repair request containing
bounded compiler issues, the schema-valid rejected proposal (or null), and the unchanged original inputs.
The repair must pass the same compiler. Bookings, durations, IDs, hours, travel, breaks, dates and version
checks remain enforced. Refusal, transport, malformed API response and timeout failures are not retried.
Failed repairs preserve the prior saved itinerary; no heuristic fallback is used.

Prompt itinerary-v2 clarifies travel after breaks and known closed places. Saved provenance records attempts
and combined token usage. Benchmark runs use this same orchestration and retain per-attempt results, including
failures; --max-attempts 1 permits raw-provider comparison. Quotas count generation requests, each now allowing
up to two calls. Missing token usage stays unknown. Future adapters must pass repair as untrusted user data
and cancel their own transport on timeout.

## Verification

- 433 automated tests across 34 files passed; all workspace typechecks passed.
- Production Next.js build passed.
- Planning validator passed; API reference regenerated.
- Regression tests cover the reported 12:30 start versus 12:45 arrival, one-call success, two-call failure,
  fixed bookings, malformed feedback, provider failures, shared deadlines, unknown usage, benchmark budgets,
  persistence after repair and changed inputs during repair.
- Live synthetic test injected the invalid 12:30 proposal, then called real OpenAI for the repair only.
  gpt-4.1-mini-2025-04-14 returned visits at 11:00–12:00 and 12:15–13:15 with 15 minutes travel.
  Compiler result: valid; both places retained. Live usage: 1,318 input and 50 output tokens.
- One fresh live closed-venue case passed with itinerary-v2. This small development test is not a formal
  benchmark, a provider comparison, or proof of reliability on all trips.

No real saved trips were read or modified for testing. The exact user trip and an authenticated browser
regeneration remain unverified. Hosted deployment and independent human review are pending.

## Frontend request and place-ID follow-up

The frontend client was traced through the contract router and real itinerary handler using isolated test
storage and an injected provider. It makes one same-origin POST to the trip generation endpoint with only
expectedVersion. The server reads saved inputs; it does not accept a client-supplied place list.

The affected trip's current saved inputs were read narrowly: four distinct confirmed IDs and no bookings.
A read-only live replay using those inputs passed after one repair and did not create or update an itinerary.
The exact earlier invalid model output was not retained, so its specific offending ID cannot be recovered.
Browser inspection was unavailable; request routing was checked through local server logs and integration tests.

The compiler now distinguishes PLACE_UNKNOWN, PLACE_DUPLICATE and PLACE_BOOKED. Repair feedback includes the
reference ID and, for duplicates, both dates/times. Human-facing messages identify the place and problem
instead of the previous ambiguous generic sentence. The uniqueness/booking rules themselves are unchanged.
Frontend-through-router tests cover one HTTP request with two model attempts, precise failure propagation,
and preservation of a saved version when repair remains invalid.

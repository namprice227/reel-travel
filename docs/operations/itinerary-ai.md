# Itinerary generation and interchangeable providers

## Use OpenAI now

Set server-side environment variables on the web app (local `apps/web/.env.local`, or Vercel):

```dotenv
ITINERARY_PROVIDER=openai
OPENAI_ITINERARY_MODEL=gpt-4.1-mini-2025-04-14
OPENAI_API_KEY=your-private-key
```

An existing OpenAI key can be reused. Never expose these as `NEXT_PUBLIC_*` values. Model selection is
independent from transcription and place extraction. Blank `ITINERARY_PROVIDER` selects OpenAI when
`AI_PROVIDER=openai`, otherwise the offline `baseline`. An explicit unknown provider fails closed.
The UI still uses the existing Generate button. The local import worker is not involved in generation.

The backend reads saved trip dates, timezone, daily start/end times, pace, transport, budget, interests,
must-visits, accommodation, confirmed places and fixed bookings. Save changes in Trip details first.
Pending/unverified/rejected places never enter the planning input. Separate first-day arrival/last-day
departure windows are not currently in the trip contract; the daily time window applies to every date.

## Flow and validation

1. Owner check, expected-version check, then read a snapshot of saved inputs.
2. Build an allowlisted JSON input, including estimated travel minutes. Omit account details, source
   transcripts, photo/review payloads, booking notes and private browser notes.
3. Send the versioned [prompt](../../packages/ai/prompts/itinerary-v3.ts) and shared JSON schema to OpenAI
   Responses, `store:false`, strict structured output. At most two calls, a shared 40-second generation deadline, at most 25 seconds and 8,000 output tokens per call (16,000 output tokens maximum with repair).
4. The model arranges dates, starts and flexible planned visit durations, plus meal blocks and suggested
   activities. Saved place names, coordinates, booking ends, source references and known travel come from
   stored data. Suggestions carry an area and rationale, never coordinates or a confirmed-place ID.
5. Reject unknown/duplicate IDs, missing or moved bookings, incorrect dates, overlap, insufficient travel,
   closed hours, midnight overflow and daily-window overflow. Pace and rest minutes are preferences,
   not enforced counts; rest can be split or included in meals. Places that do not fit remain in the computed unscheduled list. Unknown travel/hours stay
   explicitly partially checked; budget and interests are soft preferences.
6. Re-read inputs after the call. Changed inputs return `STALE_TRIP`; concurrent itinerary saves use the
   existing atomic expected-version check. Failed proposals/provider errors never overwrite a saved plan.
7. Save an immutable version with provider/model/prompt version, request hash, latency and token counts.

If the compiler rejects a returned proposal, send its bounded validation feedback and schema-valid proposal
back to the same provider for one automatic repair. The original trip inputs and all validation rules stay
unchanged. Malformed proposal objects are replaced with null in feedback. Provider errors, refusals, timeouts
and malformed API responses are not retried. The repaired proposal must pass the full compiler; otherwise
return GENERATION_FAILED without saving. No heuristic fallback is used.

Saved generation metadata records attempts (1 or 2), total latency and combined token usage; missing usage
in either call makes the relevant total unknown. Older saved plans may lack attempts. The prompt is versioned
as itinerary-v3. Each user generation consumes one quota unit, with up to two provider calls (up to 6 calls/minute
and 40/day at the existing quotas). `ITINERARY_PROVIDER=baseline` explicitly
retains the old greedy generator for offline development; it is not described as an AI plan. AI quotas are
3 requests/minute and 20/day per account using the shared database limiter. Requests are limited to 50
confirmed places, 30 bookings, seven days and 100,000 input characters. These are usage bounds, not a dollar cap.

Input re-reading is a pre-save guard, not a transaction spanning the external model call and every trip edit.
A later input change still marks the saved version stale through the existing fingerprint mechanism.

## Plug in another provider

Implement [ItineraryProvider](../../packages/ai/src/itinerary.ts). The adapter receives the same serializable
input, system prompt, prompt version, JSON schema and `limits` (timeout/output-token budget). Honor those
limits and cancel timed-out transport in every adapter. When request.repair is present, include it as untrusted
user data alongside the original input; return a full replacement proposal. The shared wrapper also bounds
waiting for adapters that ignore limits, but cannot cancel their external requests itself. Return parsed JSON as `proposal` plus the actual
model identifier and token usage; use null for metrics the provider does not supply.

```ts
import type { ItineraryProvider } from "@reel/ai/itinerary";

const provider: ItineraryProvider = {
  id: "your-provider",
  async generate(request) {
    // Translate request.systemPrompt/input/jsonSchema to the provider's API here.
    // Apply a timeout, reject refusals/incomplete output, keep credentials server-side.
    // Return { proposal, model, usage: { inputTokens, outputTokens } }.
    throw new Error("Adapter not implemented");
  },
};
export default provider;
```

This example is deliberately a non-working scaffold. OpenAI is implemented; Gemini and Ollama transports
are not implemented or tested yet. Adding them does not require changes to the proposal schema, schedule
compiler, UI or saved itinerary format. For the web app add the adapter in the server-owned
[registry](../../apps/web/src/server/itinerary-provider.ts) and the supported config values. For experiments,
the benchmark CLI accepts a trusted local adapter module directly. A local Ollama instance must be reachable
from the process running it; Vercel cannot reach your laptop's localhost.

## Benchmark later

See [benchmark instructions](../../evals/itinerary/README.md). Use the same inputs, prompt version, schema,
validator, call budget and repeated-run count across providers. Keep prompt-development cases separate
from a held-out dataset. Latency, token counts, coverage and hard-rule acceptance are recorded; real cost,
human preference/route quality and winner claims require separate measurements.

Official API reference: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Schema conformance is only a format guarantee; the backend separately validates schedule feasibility.

## Practical trip planning (itinerary-v3)

The user can generate from a destination and dates even without confirmed places when an AI provider is
configured. The prompt groups places into neighbourhood outings, allows longer visits/day trips, plans meals
around bookings and considers budget, transport and interests. Planned visit durations are 15–480 minutes;
null retains the supplied typical duration. Those estimates survive later edits. The baseline stays an offline
confirmed-place planner and still requires a place or booking.

Sparse days may include meal and suggestion stops. They are explicitly unverified, not automatically added
to the confirmed-place library, not mapped with guessed coordinates, and show Google Maps search links for
review. Known-hours and route checks do not cover these suggestions; plans remain partially checked. This
feature does not call Google Places to validate generated recommendations. It is not a booking service.

Seasonal advice is generated from destination and trip months, labeled AI guidance rather than a live forecast
or verified climate dataset. The prompt asks for weather-appropriate timing and indoor alternatives, avoids
invented temperatures/alerts and allows null advice when uncertain. Accuracy requires user verification.
The daily start/end window still applies to every date; individual arrival/departure windows remain unmodeled.

The planner fingerprint changed, so old itineraries become stale until regenerated. No SQL migration is
needed; deploy matching code to all readers before using the new meal/suggestion stop kinds.

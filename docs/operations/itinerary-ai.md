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
must-visits, dated or whole-trip accommodations, confirmed places and fixed bookings. Save changes in Trip details first.
Pending/unverified/rejected places never enter the planning input. Separate first-day arrival/last-day
departure windows are not currently in the trip contract; the daily time window applies to every date.

## Flow and validation

1. Owner check, expected-version check, then read a snapshot of saved inputs.
2. Build an allowlisted JSON input, including estimated travel minutes and one accommodation start node per date.
   Omit account details, source
   transcripts, photo/review payloads, booking notes and private browser notes.
3. Send the versioned [prompt](../../packages/ai/prompts/itinerary-v1.ts) (`itinerary-v2` after multi-stay support)
   and shared JSON schema to OpenAI
   Responses, `store:false`, strict structured output. One attempt, 40-second deadline, 8,000 output tokens.
4. The model proposes date, kind, reference ID and start time only. The shared compiler supplies names,
   coordinates, visit duration, booking end times, source references and travel estimates from stored data.
5. Reject unknown/duplicate IDs, missing or moved bookings, incorrect dates, overlap, insufficient travel,
   closed hours, midnight overflow, daily-window overflow, excess pace and missing required breaks.
   With two or more activities, a day requires one break of the requested duration; single-activity days
   may omit it. Places that do not fit remain in the computed unscheduled list. Unknown travel/hours stay
   explicitly partially checked; budget and interests are soft preferences.
6. Re-read inputs after the call. Changed inputs return `STALE_TRIP`; concurrent itinerary saves use the
   existing atomic expected-version check. Failed proposals/provider errors never overwrite a saved plan.
7. Save an immutable version with provider/model/prompt version, request hash, latency and token counts.

There is no silent heuristic fallback or automatic repair loop. `ITINERARY_PROVIDER=baseline` explicitly
retains the old greedy generator for offline development; it is not described as an AI plan. AI quotas are
3 requests/minute and 20/day per account using the shared database limiter. Requests are limited to 50
confirmed places, 30 bookings, seven days and 100,000 input characters. These are usage bounds, not a dollar cap.

Input re-reading is a pre-save guard, not a transaction spanning the external model call and every trip edit.
A later input change still marks the saved version stale through the existing fingerprint mechanism.

## Plug in another provider

Implement [ItineraryProvider](../../packages/ai/src/itinerary.ts). The adapter receives the same serializable
input, system prompt, prompt version, JSON schema and `limits` (timeout/output-token budget). Honor those
limits in every adapter. Return parsed JSON as `proposal` plus the actual
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

# YouTube reel classification (local experiment)

Public YouTube URL -> Gemini speech and timestamped visual observations -> OpenAI classification/extraction -> validated JSON.

## Run

From the repository root:

```powershell
npm run analyze:youtube -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

Use a real public video ID. This makes billable Gemini and OpenAI requests.
The command loads ignored `apps/web/.env.local`; shell values take precedence.
It uses existing `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `GEMINI_TRANSCRIPTION_MODEL`,
`GEMINI_TRANSCRIPTION_TIMEOUT_MS`, `OPENAI_EXTRACTION_MODEL`, and `OPENAI_TIMEOUT_MS`.
Defaults remain the existing integration choices: Gemini `gemini-3.6-flash`,
OpenAI `gpt-4o-mini`, 120 seconds and 60 seconds respectively. Account access and
quality for this new task are unverified. No Places key is required.

Progress and 15-second waiting notices are written to stderr; stdout remains JSON.
HTTP 400 reports a rejected request, HTTP 503 reports provider unavailability, and HTTP 429
reports rate/quota limits. No automatic billable retry is added.

For clean JSON on stdout use `npm run --silent analyze:youtube -- "<URL>"`.
To save a result, create a private output directory, then supply a new filename:

```powershell
New-Item -ItemType Directory -Force evals/private
npm run analyze:youtube -- "<URL>" --output "evals/private/reel.json"
```

The command prints the complete result and writes UTF-8 JSON only after both stages validate.
The parent directory must exist. Existing files are never overwritten.
Recovery/failure never writes an output file. If writing fails after API success, the command
reports OUTPUT_WRITE_FAILED; the billable provider work has already happened.
Keep source transcripts and outputs private unless permissioned and sanitized.

## Output

Success contains:

- `status: "ok"`, normalized `source_url`.
- `evidence.audio`: generated transcript and language.
- `evidence.visual_observations`: application-assigned IDs, approximate seconds from video start,
  literal visible text, descriptions and uncertainties; chronological order.
- `result`: exactly `type: "itinerary"` or `type: "place"`, matching the
  [extraction schemas](../../packages/ai/src/reel-schema.ts).
- Provider/model/prompt provenance, explicit unverified/unvalidated flags, limitations,
  and evidence/classification elapsed milliseconds.

Itinerary fields follow the supplied reference: title, summary, total_days, destinations and
stops, transport_notes, estimated_budget_tier and tags. Destinations always use `days: []`
rather than inconsistent `day` versus `days`. Unknown total_days is null; no missing days
are filled in. Source order is preserved by instruction; schema validation is not semantic verification.

Place fields follow the reference: place_name, category, location, summary, highlights,
practical_info, recommended_for and tags. `additional_places` retains other named venues
for collections without a route. Coordinates are always null; this command performs no factual lookup.

Every non-null content leaf requires `field_evidence`, for example:

```json
{
  "field": "destinations.0.stops.0.name",
  "source_id": "visual_1",
  "quote": "Hoshi Coffee"
}
```

This is a synthetic fictional example, not a real venue assertion. References use `audio`
or a `visual_N` ID. The validator checks that paths refer to populated content and quotes
exist literally in the indicated source. It does not prove that a quote supports the model's
interpretation. Classification explanations and uncertainties are model judgments, not verified facts.

## Forced two-category behavior

- Explicit route, ordered visit plan or day itinerary: `itinerary`, basis `route`.
- One clearly featured venue/attraction: `place`, basis `single_place`.
- Collections without a route: `place`, main/first genuine place plus additional_places.
- Ties, non-travel content or no identifiable place: `place`, basis `fallback`,
  `uncertain: true`, unsupported fields null/empty. No third successful category.
- Unsupported/inaccessible URLs: SOURCE_INACCESSIBLE recovery, not fabricated classification.
- Provider refusal, malformed output and truncation remain explicit errors.

The model is instructed to use these rules. Offline tests mock its answers and do not establish
real classification accuracy, prompt-injection resistance, or source-order correctness.

## Frame and factual boundaries

Gemini processes the video remotely; no download, FFmpeg, screenshot files, or local frame
selection exists. We request observations, not an exhaustive frame inventory. Google's video
documentation describes default visual sampling and warns that brief/rapid content can be missed.
Exact frame coverage, timestamp accuracy and image-level duplicate removal are not guaranteed.

Only identical observation records at the same timestamp are deduplicated locally. Changed
captions or occurrences at different times are retained. Source claims about fees, accessibility,
hours and travel advice remain unverified; unknowns remain null. Conflicting speech/visual claims
should be recorded as uncertainties and disputed fields left null.

The extracted creator itinerary is not the user's saved itinerary, does not validate travel
times/bookings, and cannot bypass existing place confirmation or planner validation.

## Integration boundary and verification

The first version is a CLI/server-module experiment, not a web/API/database change.
Existing transcription, YouTube-to-Places commands, fake providers and web imports retain
their existing contracts and behavior. Input is YouTube URLs only.

The [synthetic cases](../../evals/datasets/youtube-reels.json) and offline tests cover two
category shapes, caption-only input, forced fallback, conflicting evidence, source restrictions,
citation coverage, invalid days, refusal/truncation, masked failures, and CLI output protection.
They are development fixtures, not held-out evaluation.

Before enabling this flow in the web app, independently label representative videos and compare
audio-only versus audio-plus-visual accuracy, missed captions, hallucinations, latency and cost.
Stage timing fields support individual run inspection; no quality or performance improvement
has been measured. Full token/cost telemetry and a comparison runner remain future evaluation work.

References:
[Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).


## Schema compatibility correction (2026-09-21)

The provider-facing Gemini schema now carries shape, required fields, enums and nullability,
without nested string/array/range bounds or the JSON Schema dialect declaration. The full
original Zod schema is still enforced locally before OpenAI sees any evidence. This avoids
the full-schema HTTP 400 reproduced even on a text-only request. No secret/configuration
change or model migration is required.

One corrected video run reached OpenAI but its result failed local validation. Later capture attempts
were blocked by provider 503 responses/timeouts; no successful final JSON was produced. Safe validation
diagnostics now identify the failed check on the next reproducible response. The complete live flow
remains unverified. [Verification record](../../deliverables/evidence/be01-reels-schema-fix-2026-09-21.md).

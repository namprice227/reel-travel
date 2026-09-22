# YouTube schema compatibility and progress correction

Date: 2026-09-21. Tasks: BE01/BE02. AI-assisted; human review pending.

## Changes

- packages/ai/src/gemini-schema.ts generates a reduced Gemini JSON schema containing
  shape, required fields, enums and nullability. String/array/range limits and dialect
  metadata are omitted from the provider schema only.
- packages/ai/src/youtube.ts uses the reduced schema and retains full local Zod validation.
  Errors distinguish rejected requests (400), rate/quota limits (429), and unavailability (503).
  Raw provider bodies and credentials are not exposed.
- packages/ai/src/reel.ts emits evidence/classification/validated progress callbacks.
- scripts/analyze-youtube.ts prints stage changes and 15-second waiting notices to stderr,
  clearing timers on completion, recovery and failure. Stdout remains JSON.
- packages/ai/src/reel-schema.ts now reports safe validation reasons rather than a single
  undifferentiated malformed-output error. No validation requirement was removed.
- Regression checks cover provider schema shape, locally enforced observation limits,
  properties whose names resemble schema keywords, HTTP guidance and CLI progress.

## Verification actually performed

- npm run check: PASS, including 256 tests across 19 files, root/workspace typechecks,
  generated API documentation consistency, and planning/local-link validation.
- git diff --check: PASS; Windows line-ending notices only.
- Live diagnostics used existing credentials without displaying them or changing .env.local.
- Before correction, configured gemini-3.6-flash returned 200 for plain text and a small schema,
  but 400 INVALID_ARGUMENT for the original evidence schema even without a video.
  The provider did not identify one exact offending schema keyword.
- After correction, one run of the user's B0mSzDK3MiA video completed Gemini observation
  generation and reached OpenAI. OpenAI returned an output rejected by the then-generic
  local schema/evidence/classification/day validator. The exact failed check is not known;
  this run's response was not retained. Later code adds safe validation diagnostics.
- Subsequent attempts to capture a reproducible response returned Gemini 503 UNAVAILABLE
  or timed out. A provider error explicitly reported high demand.
- A model-metadata read succeeded. A one-run gemini-3.5-flash diagnostic alternative timed out;
  the configured/default model was not changed.
- A JSON-mode diagnostic without provider-side schema compilation also timed out.
  This alternative was NOT adopted in production code.
- Small text-only corrected-schema checks have not yet yielded a validated success.
  The real-video Gemini success demonstrates acceptance for that run, not general reliability.

## Remaining work and explicit limits

The full pipeline is NOT yet verified successful on the user's video. The downstream rejected
OpenAI result remains unresolved until a response can be captured and replayed. No validated
final JSON artifact was produced by the correction verification.

Once Gemini is available, run the full CLI and inspect any safe validation reason. Capture
provider outputs only in ignored private storage if more diagnosis is needed; never weaken
citation validation merely to accept a model result. Do not claim measured classification
quality, timestamp accuracy, injection resistance or performance improvements.

No HTTP API, database, planner, web UI, credentials, saved model setting or automatic billable
retry behavior was changed. Earlier implementation-only statements about no live calls are
superseded by this follow-up. Human content accuracy review remains pending.

[Command guide](../../docs/operations/youtube-reels.md).


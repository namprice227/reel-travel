# AI workflow resilience fixes

24 September 2026. A live test of the AI workflow with two public YouTube Shorts found three failures.
Claude Code (Opus 5.5) implemented and tested the fixes. Human review is still pending.

## Problems found in live testing (before the fix)

- **Busy Gemini reported as an unreadable video.** Gemini HTTP 503 and 429 replies were thrown as
  `TRANSCRIPTION_FAILED`. The import job mapped that code straight to `SOURCE_INACCESSIBLE` ("Could not access… YouTube
  video"), so the durable job retry never ran. The account-reel job did the same for every Gemini error, including
  timeouts. Measured: 4 of 7 CLI reads failed with 503 or a timeout, and each video worked on a later try.
- **Adding details did not recover a failed link.** A TikTok save asked the traveler to "Add details". After details
  were added, the save failed again with 0 places: the multimodal import path ignored `inspiration.details` for link
  saves. Unit tests run the legacy workflow, which does handle details, so this path had no test.
- **Itinerary generation failed on repeated places.** When the model scheduled a confirmed place twice, the planner
  rejected the draft. The single model repair often repeated a place again. Measured: 2 of 4 generations failed for a
  5-day Tokyo trip with 15 confirmed places.

## Changes

- `packages/ai/src/youtube.ts`:
  - HTTP 429/500/502/503/504 and network failures now raise `PROVIDER_UNAVAILABLE`.
  - These are retried in-process after 2 s, then 6 s (configurable with `retryDelaysMs`).
  - Timeouts are not retried in-process, so one attempt stays within the job's time bound.
  - `isTransientYouTubeError` marks `PROVIDER_UNAVAILABLE` and `TRANSCRIPTION_TIMEOUT` as transient.
- `packages/ai/src/provider-request.ts`:
  - `providerJson` accepts an opt-in `retryDelaysMs` for 429/5xx replies and network errors.
  - Import-path calls use it with delays of 1 s and 3 s: OpenAI stop extraction, audio transcription, image
    extraction, text extraction, and Google Places text search.
  - Itinerary calls keep their existing 40-second interactive budget, with no added retry.
- `apps/web/src/server/jobs/import-inspiration.ts`:
  - A link save that has traveler details is extracted from those details. No scraping, and no second Gemini call.
  - Transient errors are thrown, so the queue's 10 s/60 s retry applies.
  - Genuine access failures still end in `SOURCE_INACCESSIBLE`.
- `apps/web/src/server/jobs/account-reel.ts`: transient errors now use the job's existing retry.
- `packages/planner/src/schedule.ts`: a repeated saved-place visit keeps the first visit and leaves the later slot free.
  The planner still recomputes all times. Unknown IDs, model-authored facts and booking errors still fail validation.

No API contract, failure code or database change. `compileProposal` (not used by the app) is unchanged.

## Verification

- `npm run check`: 633 tests in 60 files pass. Workspace typecheck, API docs and planning validation pass.
- New or updated synthetic tests (no network calls):
  - Gemini retry, then recovery, then exhaustion; 4xx replies are not retried.
  - `providerJson` retry bounds.
  - Instagram save recovered from added details, through the real job runner.
  - Unreadable YouTube save recovered from added details without another Gemini call.
  - A busy Gemini reply leaves the save `queued` with no failure code.
  - Account-reel retry.
  - Repeated place kept once; a draft that always repeats a place still saves a checked plan.
- Live providers (OpenAI, Gemini `gemini-3.5-flash-lite`, Google Places), using the real server services with an
  isolated temporary file store and a synthetic account (no Supabase data touched):
  - Imports: 4 of 4 succeeded on the first pass (two Shorts, one text note, one TikTok link).
  - TikTok recovery with details reached `needs_confirmation` with 1 place.
  - Itinerary generation succeeded 6 of 6 times for Tokyo (22 confirmed places, all scheduled, no warnings, 11–15 s)
    and 1 of 1 for Osaka (6/6 scheduled).
  - CLI `analyze:map-places` succeeded 6 of 6 times (3 per Short).
  - Not confirmed: whether Gemini was busy during these runs. Retries are silent, so the live retry path itself is
    shown only by the synthetic tests.

## Not addressed

- Extraction varies between runs (16–22 stops for the Tokyo Short).
- On-screen section titles such as "DAY 1: SHINJUKU" can become district-level stops.
- Stops outside the destination (Hakone, Mt Fuji) are not flagged.
- The `analyze:youtube` CLI citation validator rejected 4 of 4 live outputs. The app does not use that path.
- The browser UI was not exercised: the Supabase dev server requires the owner's sign-in.

## Follow-up: saves stuck in development (24 September)

The user reported that YouTube extraction "takes forever" on the Supabase development server (inline imports, no
worker). Read-only checks of the development database found three stuck jobs:

- A Home reel and a trip import queued with 0 attempts: never claimed.
- A trip import queued after "Gemini timed out": its retry was never run.

**Cause 1, clock race.** Submit stamps `runAfter` with the database clock. The inline claim compares it with this
machine's clock, which measured 243–431 ms behind Supabase (60 timed requests, 138 ms median RTT). A claim made
right after submit sees the job as not yet due, and inline mode never tried again.

**Cause 2, retries never run.** Inline mode ran only the first attempt; retries waited for `npm run worker`, which
was not running. The earlier change that queues busy-Gemini retries made this path common.

**Fix.** `apps/web/src/server/jobs/inline.ts` (`runJobInline`) replaces the one-shot inline call in the import,
account-reel and place-verification handlers:

- After a declined claim or a scheduled retry, it waits until the stored `runAfter` plus a 2 s clock allowance,
  then runs the job again.
- It stops when the job succeeds or fails, or when another runner (the worker) has claimed it. At most 8 passes.
- Claim semantics and SQL are unchanged, so no future timestamps are written.

`tests/integration/inline-jobs.test.ts` covers the skew, retry, claimed-elsewhere and store-lookup cases.
`npm run check`: 659 tests pass. Not verified live: the running dev server picks the change up on reload, but jobs
already stuck still need `npm run worker` or a new save.

A second finding: `reel_record_account_reel_format` was missing from the development database. It had been added
to an already-applied migration, so it was moved to `database/migrations/202609240002_account_reel_format.sql`.

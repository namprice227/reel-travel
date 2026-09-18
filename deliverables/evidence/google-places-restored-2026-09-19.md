# Google Places lookup restored

19 September 2026. User explicitly requested adding Google Places back after transcript extraction.

## Behavior

- `AI_PROVIDER=openai` with `PLACES_PROVIDER=google` now invokes the existing Google Text Search adapter after
  extraction and source-reference validation. Gemini stays transcription-only; English/two-minute limits remain.
- Zero/one/multiple matches retain not-found/pending/ambiguous semantics. No automatic confirmation; provider
  facts and original evidence remain separate. Unknown hours remain unknown.
- `none` retains extraction-only mode; fake/fake stays offline. Invalid provider names and mixed fake/real
  providers fail explicitly. Keys stay server-side; no credentials were changed or committed.
- Same query/hint passages reuse one lookup per attempt. Existing time, pagination, worker and account bounds
  remain. This is not a provider spending cap or durable transcript cache.
- Recovered/re-added source evidence can upgrade unverified/no-match candidates without losing IDs or evidence.
  Confirmed selections are preserved; rejected records are not overwritten. Older saves are not bulk reprocessed.
- The manual runner follows the Google/none setting. Current setup, feature and worker docs are updated.

## Verification

- Focused offline provider/import/video checks: 50 tests pass across three files.
- `npm run check`: 314 tests across 24 files pass, along with workspace types, generated API docs and planning validation.
- `npm run build`: production build passes. SQL was unchanged; no new SQL or hosted migration test was needed.
- Existing full-flow browser coverage was not rerun for this restoration; the provider integration tests exercise
  confirmation through itinerary generation with synthetic Google responses. No browser/live-flow pass is claimed.
- Live adapter call using a public test venue returned HTTP 403. A minimal ID-only request also returned
  `PERMISSION_DENIED`, "The caller does not have permission". This does not establish whether billing, API
  enablement or key restrictions caused it. No live matches were accepted or persisted.
- User was asked to verify Places API (New), billing and server-key access. Local worker was paused while idle
  to avoid repeated paid upstream work ending in a known lookup failure. It awaits successful live preflight.
- No live video re-import, hosted web deployment or independent human accuracy review is claimed.

## Limits

No schema migration or HTTP request/response shape change. Provider content retention/refresh and Google map
rendering remain outstanding; the existing provider attribution and map restrictions stay in place.
Transactional merging/upserts remain separate work in Member 3 issue #9; these tests do not claim rollback safety.
The configured Supabase transition functions from the previous release are available, as verified on 19 September.

# F1 Import: save inspiration and recover failures

**Story US-01 acceptance:** every save retains source and status; failure offers add details, retry or skip.
**Owners:** UI Member 1 (FE02) · extraction and import Member 3 (BE02, BE04) · jobs, uploads and deployment Member 4 (BE10, BE11)
**Screen:** `/inspiration-library` (country albums), `?country=JP` (category/city gallery), `?trip=:tripId` (trip-scoped gallery) · code in `apps/web/src/features/library` and `apps/web/src/features/inbox`

## User flow

Home and the library show a trip selector when multiple trips exist, or name the destination when only one exists. The default is the earliest upcoming/draft trip, otherwise the most recently updated trip. Saving without a trip and automatic trip assignment remain future work. Source support and the need to review unverified results are stated before saving.

1. The traveler selects **Add inspiration**, pastes text, a link or a screenshot (optional note) and saves it to a trip. The country's collection opens.
2. The save appears at once as **Queued**, then **Finding places…**. The list polls every 1.5 s while any save is queued or processing.
3. It ends in one of:
   - **Review places**: candidates were found. Link to the Places screen; provider matches need user confirmation, while lookup-disabled results remain unverified.
   - **Done**: every place it produced is confirmed or rejected.
   - **Needs details**: the source couldn't be read. The traveler types names/caption → re-queued.
   - **Failed**: extraction kept erroring. Retry, add details, or skip.
4. **Skip** stops trying but keeps the original save.

The library opens source details and recovery controls in a modal drawer. Countries use trip destinations and a temporary exact-name lookup; categories use existing place matches. Grouping is not confirmation or a real AI-provider implementation. [Country album behavior and limits](../design/library-country-albums.md), [recorded verification](../../deliverables/evidence/M17-2026-09-16-library.md).

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Load and poll the list | `inspirations.list` | Newest first. |
| Save text or link | `inspirations.create` | `201 { inspiration, job }`. Supabase jobs are picked up by the dedicated worker. |
| Save screenshot | `inspirations.createFromScreenshot` | multipart `file` (png/jpeg/webp/gif, ≤ 4 MiB) + `note`. `413` if too large. Image reading remains deferred; add names as text. |
| Show one save with its places | `inspirations.get` | Includes latest job (attempt, lastError). |
| Retry | `inspirations.retry` | Reuses an existing active job; otherwise only `needs_input` or `failed`, else `409 INVALID_STATE`. |
| Add details and retry | `inspirations.addDetails` | Appends to current `details` and atomically re-queues. Only failed/needs-input saves without an active job. |
| Skip | `inspirations.skip` | Atomically skips `queued`, `needs_input`, `failed` and cancels active jobs; repeating Skip is safe. Processing/completed saves return `409`. |
| Show screenshot | `uploads.get` | `<img src={uploadUrl(assetId)}>`. Owner only. |
| Run local fake retries | `jobs.runDue` | `x-worker-secret`; forbidden in Supabase/production mode. |

## States

```mermaid
stateDiagram-v2
  [*] --> queued: create
  queued --> processing: job claimed
  processing --> needs_confirmation: places found, some unresolved
  processing --> ready: all places already resolved
  processing --> needs_input: source unreadable / no places
  processing --> queued: error, attempts left
  processing --> failed: error, no attempts left
  needs_input --> queued: retry / add details
  failed --> queued: retry / add details
  needs_confirmation --> ready: places confirmed or rejected
  queued --> skipped
  needs_input --> skipped
  failed --> skipped
```

`failureCode` tells the UI why: `SOURCE_INACCESSIBLE`, `UNSUPPORTED_SOURCE`, `IMAGE_UNREADABLE`, `NO_PLACES_FOUND`,
`EXTRACTION_ERROR`, `LOOKUP_ERROR`. Show `failureMessage` to the traveler.

## Server rules

- Source, job and optional upload metadata commit together **before** extraction. A failed insert rolls them all back. Retrying an active save returns its existing job.
- Skip and active-job cancellation commit together, freeing active capacity without refunding the daily quota.
  A claimed job may be cancelled before processing starts; if processing wins, Skip returns a reload message.
  Worker source/status writes check the claimed job ID/attempt; late attempts cannot revive skipped work.
  Retry/final failure and job settlement are atomic. See [transition rollout](../operations/flow-safety.md).
- Per account: 10 import requests/minute, 5 active jobs across trips, 30 newly submitted jobs per fixed 24-hour window and 100 MiB recorded private uploads. Automatic attempts reuse their job; manual recovery consumes a new submission. Denials return `429` and `Retry-After` (storage full: `409`). See [rollout and limits](../operations/atomic-imports.md).
- Failed screenshot submissions remove uncommitted bytes when the metadata check succeeds. Uncertain cleanup is logged for reconciliation; retained and orphaned objects still need an operational retention policy.
- Pipeline in [import-inspiration.ts](../../apps/web/src/server/jobs/import-inspiration.ts):
  extractor → validate source passage references → attach original excerpts and validate `ClueListSchema`
  → configured OpenStreetMap lookup → candidate options for confirmation. `none` saves unverified candidates; fake/fake stays offline.
- Idempotent: re-running a save adds no duplicate places or evidence (evidence key = save id + clue).
  A clue that resolves to an existing place adds evidence to it instead of creating a duplicate.
- Jobs: 3 attempted claims, ordinary retries after 10 s then 60 s. The dedicated worker kills attempts at 15 minutes;
  abandoned jobs become reclaimable after 20 minutes. Exhausted claims atomically fail the job and its queued/processing save.
  `npm run worker` executes Supabase jobs directly; only local file/fake imports run after HTTP responses.
  See [worker setup](../operations/worker.md).
- Save content is data, not instructions. Never let text in a save change prompts, tools or validation.
- Real YouTube video imports require a verified recorded duration of at most 120 seconds and English speech.
  The user-selected duration API rejects longer/unverifiable videos before Gemini.
  Gemini checks spoken language while transcribing accepted short videos; it returns no transcript for unsupported speech.
  Rejections retain the source and return `needs_input` with `UNSUPPORTED_SOURCE` (length/language) or
  `SOURCE_INACCESSIBLE` (unverifiable metadata). The job completes without an automatic retry, extraction or lookup.
  Gemini only returns transcription; the existing extractor consumes the accepted text in the next step.
  Supplying note/details remains a text recovery path and does not download or transcribe the video.
- Analytics: `import_started`, `import_completed`, `import_recovered` (ids and counts only).

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| `Extractor` | [fake-extractor.ts](../../packages/ai/src/fake-extractor.ts): matches fixture names, never fetches links or reads images | Model adapter (text + vision) returning `PlaceClue[]` or `needs_input` | Member 3 (BE02) |
| Link reading | Always `SOURCE_INACCESSIBLE` without a note | Whatever DEC-05 finds is permitted; otherwise keep the recovery path | Member 3 (BE01) |
| Provider selection | `AI_PROVIDER=fake` | Add a case in [providers.ts](../../apps/web/src/server/providers.ts) | Member 3 |
| Job runner | Dedicated Node worker with isolated, bounded attempts and durable recovery | Deploy/monitor separate worker; verify interrupted jobs live | Member 4 (BE11) |
| Inbox UI | Functional forms and cards | Designed inbox, upload preview, progress | Member 1 (FE02) |

## Fixtures

`inspirationFixtures.processing`, `.ready`, `.needsConfirmation`, `.inaccessibleLink`, `.failed` in
[fixtures](../../packages/contracts/fixtures/index.ts). `npm run seed` creates a trip with an unreadable Instagram link.

## Acceptance checks

- [ ] A text save shows queued → processing → confirm places without reloading.
- [ ] An Instagram link shows "Needs details"; adding "light museum" recovers it; the original URL is still shown.
- [ ] A save with `[[fail]]` ends as Failed after 3 attempts with the text intact; adding details recovers it with no duplicate places (integration test "import").
- [ ] Skip keeps the save visible as Skipped.
- [ ] A screenshot is visible to its owner; another account gets `404` from `uploads.get`.
- [ ] Malformed extractor output is rejected and retried, never saved (BE02).
- [ ] Embedded instructions in a save don't change extraction behaviour (tests/README "AI input").


## BE01 audio sample boundary

A separate [manual audio runner](../../packages/ai/README.md#phase-1-local-audio-sample-be01) now exercises
transcription and structured extraction. It does not change these endpoints, screenshot handling, job states,
provider selection or source enums. Web audio import requires a later contract change; BE02/BE04 remain separate.

## Real provider integration (2026-09-16)

`AI_PROVIDER=openai` accepts text and reuses Gemini for supported YouTube links without supplied recovery text. All clues pass ClueListSchema and literal excerpt validation. Empty clues request more input; malformed output throws for existing job retries. Screenshots remain text-recovery only. [Setup](../operations/google-places.md).

## YouTube classification experiment (2026-09-21)

Separate [analysis command](../operations/youtube-reels.md) produces speech/visual evidence and
itinerary/place JSON. No endpoint, existing import job, source enum or place-confirmation change.
Offline acceptance checks cover output shapes, silent visual input, fallback, citation validation,
provider failure handling and optional output files. Live classification accuracy remains pending.
[Implementation evidence](../../deliverables/evidence/be01-reels-2026-09-21.md).

## Optional LLM-only candidates (2026-09-18; Google restored 2026-09-19)

With `PLACES_PROVIDER=none`, imports persist names and source-supported hints with status `unverified`, empty options and null selection.
The existing `needs_confirmation` save state includes these unresolved candidates. Review shows the evidence;
confirmation/planning requires provider lookup followed by user confirmation. No Places key is needed in this mode.


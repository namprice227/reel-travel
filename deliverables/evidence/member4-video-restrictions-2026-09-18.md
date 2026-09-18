# Member 4: short English video restrictions

Date: 2026-09-18. User-authorized resource limits and user-selected duration service.

## Behavior

- Gemini only transcribes speech. Accepted English transcript text feeds the existing OpenAI extractor;
  place lookup remains a separate subsequent stage. No transcript storage/UI or new media pipeline added.
- Before Gemini, send the normalized single-video URL to `https://ytplaylistlength.one/api/calculate`
  as multipart `search_string`, `range_start=1`, `range_end=1`. No API keys, notes or account data are sent.
- Require one complete result matching the requested ID, positive numeric per-video seconds matching its
  total, and no unavailable/truncated/unconsidered entries. Reject more than 120 seconds; accept exactly 120.
  Unknown or malformed duration data blocks transcription. Provider requests have a 10-second/2 MB bound.
- Gemini is instructed to reject unsupported speech without transcription/translation. The adapter checks
  its returned language too. Non-English, mixed or unidentified speech never passes into extraction.
- Policy rejection persists `needs_input` and a clear message while retaining the source. The worker marks
  the job complete so it is not automatically retried, and candidate extraction/lookup does not run.
- Gemini output is capped at 8192 tokens and 12000 transcript characters. Gemini 3 uses low thinking and
  temperature 1. The existing request timeout and incomplete-output rejection remain.

The existing contract's UNSUPPORTED_SOURCE and SOURCE_INACCESSIBLE cover these recovery states. The endpoint
description and generated API reference were updated; no database migration or new failure-code enum is needed.
No secrets or local provider selections changed. No additional API key is required.

## Live observations

| Check | Result |
| --- | --- |
| Duration API for cW2Lu-N98B0 | 60 seconds, matching single-video result |
| Duration API for Waj-dq9WmBo | 2736 seconds (45:36), matching single-video result |
| Updated adapter on Waj-dq9WmBo | needs_input / UNSUPPORTED_SOURCE with the two-minute message; one duration call, zero Gemini calls |
| Updated adapter on cW2Lu-N98B0 | status ok, English, 1014 transcript characters; 73331 ms including duration check |
| Existing OpenAI extraction of that accepted short transcript | MALFORMED_OUTPUT: schema or exact-source evidence validation failed; no place results accepted |

Live calls used the actual updated adapter, without the diagnostic overrides from the earlier probe.
No full transcript, private provider output or credentials are committed. Local diagnostic artifacts remain ignored.
No database records were created by these live probes. Non-English rejection was exercised with synthetic
provider responses, not an additional live short video. No independent audio accuracy review is claimed.

## Acceptance checks

Offline provider checks cover duration boundaries, Shorts aliases, zero/invalid/mismatched/partial responses,
provider failure and timeout, normalized multipart fields without credentials, English variants, rejected
languages, empty language rejection, output bounds, and the accepted transcript reaching the next extractor.
Service-level job checks establish source retention, exact rejection messages, no candidates and no automatic
retry after length/language rejection. Existing real-import mocks now include the duration service response.

`npm run check` PASS: all workspace typechecks, 270 tests across 22 files, generated API-doc consistency,
and planning/link validation. `git diff --check` PASS. The first full run identified seven older import
mocks missing the new duration response; those fixtures were updated and the complete check then passed.
No production build, hosted browser run or live short non-English test is claimed.

## Limits and deferred work

Duration accuracy/availability depend on the third-party service; unavailable duration never falls back to
unrestricted Gemini input. The service has no audio-language field, so eligible-duration non-English videos
still require a bounded Gemini request. Language detection is model-based and is not a perfect classifier.
Supplied note/details remain a text recovery route and do not transcribe video.

The live next-step extraction failure remains a separate quality issue; this is not a passed end-to-end
import, Places lookup, worker deployment or browser acceptance test. Hosted retries, billing measurements,
transcript quality and independent human review remain pending.

See [setup and limits](../../docs/operations/youtube-transcript.md),
[duration service](https://ytplaylistlength.one/) and
[Gemini generation settings](https://ai.google.dev/gemini-api/docs/gemini-3).

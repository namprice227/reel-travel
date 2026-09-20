# LLM transcript candidates — 2026-09-18

Scope: user-requested removal of Google Places from active real imports. Local app and
Supabase verification, not a hosted deployment or human accuracy evaluation.

## Implementation

- Gemini transcribes accepted short English videos; OpenAI extracts place names and hints.
- OpenAI cites numbered source passages. The server validates reference bounds and copies
  original text into evidence, bounded to 300 characters per passage. This avoids model-written
  ellipses/paraphrases that previously failed literal-quote validation. ClueListSchema remains
  the downstream contract. A real source quote does not establish that the model interpreted it correctly.
- Candidates persist as `unverified`, with empty provider options and null selection.
  UI shows source context and unknown location facts; confirmation returns 409 and the planner excludes them.
- Existing Google settings cannot enable lookup. The isolated adapter remains for future work;
  the fake/fake demo and existing provider-backed records remain supported.
- Same extracted name/context can merge evidence; conflicting hints remain separate.
- Two-minute and English-only resource limits are unchanged. No migration is required.

## Checks actually run

- `npm run check`: PASS (typechecks, 279 tests, generated API documentation and workspace validation).
- Typecheck across all workspaces: PASS.
- Offline tests: 279 passed in 22 files. Includes source-reference bounds, original-text preservation,
  malformed output, unverified persistence, deduplication, conflicting hints, rejection,
  confirmation denial, planner exclusion and video-policy gates.
- Generated API documentation refreshed and checked.
- Live app: temporary synthetic Supabase account, password sign-in, trip creation, URL submission,
  isolated worker, inspiration detail/list API and Places page HTTP 200.
- Input: `https://www.youtube.com/shorts/cW2Lu-N98B0` (user-supplied public Short).
- Final successful attempt: enqueue 907 ms; worker 13,440 ms; job `succeeded`, attempt 1;
  save `needs_confirmation`; original URL retained; 7 candidates with evidence, no provider options.
- Candidate names: Ginza, Harajuku, Takeshita Street, Asakusa, Gyukatsu Motomura, Suzukien,
  Sensō-ji Temple. These are model extractions, not independently verified identities.
- Instrumented worker calls: duration 1, Gemini 1, OpenAI 1, Google Places 0.
- API status filter returned all 7 unverified candidates; confirmation was rejected with 409 for each.
- Temporary accounts/trips/jobs and test email quota rows were removed; cleanup verified.

## Failures and limits

The first live attempt failed because the old free-form quote output added an ellipsis.
Numbered source references fixed that failure without accepting invented quote text. An intermediate
successful worker run encountered an old development-server contract (HTTP 500); restarting Next
loaded the new status schema. Deploy the web app and worker together when rolling this out.

Cached-transcript and fresh-transcription extractions returned different counts (6 and 7), so these
checks establish operational success, not exhaustive extraction or measured accuracy. No human
audio comparison, browser visual review or hosted verification is claimed. Google Places and branch
verification remain intentionally deferred. The standalone manual runner was typechecked; its full
live pipeline was exercised through the app worker instead of making duplicate provider calls.

Full transcripts, keys and account identifiers are excluded from committed evidence.

# Verify previously extracted places

19 September 2026. Requested addition to the existing Places review flow; AI-assisted implementation by Codex.

## Behavior

- Each unverified card offers **Verify location**. The server checks ownership and queues a `verify_place` job.
- The local worker searches the saved clue/hint and trip destination through the configured provider. No source
  re-download, transcription or LLM extraction occurs. OSM uses its existing persistent cache/shared request gate.
- One result is pending, multiple results ambiguous, zero results not found. Only the user's explicit confirmation
  enables planning. Candidate identity and evidence remain intact; no hours or coordinates are inferred by the LLM.
- Progress survives reload, with polling while queued/running. Failure preserves unverified state and permits retry.
- Concurrent submissions share the active-target constraint. Account request limits are 10/minute and 30/fixed day;
  one attempt per job. An atomic full-candidate comparison prevents overwriting concurrent rejection/evidence edits.
- Reuses existing job storage and RPCs; no new SQL migration. Web and local worker must understand the new job kind.

## Verification

- `npm run check`: 343 tests in 27 files pass; workspace types, API docs and planning/link checks pass.
- `npm run build`: Node 24 production build passed.
- New service tests cover 0/1/multiple matches, confirmation, duplicate clicks/claims, ownership, sanitized failures,
  retries, rejection, evidence changes, obsolete attempts and minute/day quotas. All provider input is synthetic;
  automated tests make no real provider calls.
- Live Supabase adapter probe: concurrent enqueue deduplicates, existing claim/settlement accepts verification,
  PostgREST JSON compare-and-update succeeds, stale updates are rejected. A temporary synthetic account and its
  trip/place/jobs were removed afterwards. No location/LLM/transcription calls were made by the probe.
- Chromium: eight checks passed for the real Places page with synthetic intercepted API responses: verify
  action, duplicate prevention, reload persistence, failure/retry, running progress, pending confirmation,
  confirmed group and absence of runtime errors. `tests/e2e/place-verification.mjs` reproduces the check.
  Screenshots/results stay in `.local/verification-browser`. No deployed UI or human identity-accuracy review claimed.

Member 3's transactional confirmation/merge issue #9 remains separate. Failed or incomplete location coverage
still needs user review; no bulk reprocessing, autocomplete or automatic confirmation was added.

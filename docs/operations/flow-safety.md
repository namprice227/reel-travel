# Skip, unknown travel and stale-view release

Prepared 18 September 2026. This release passes local application, SQL, HTTP and Chromium browser acceptance;
hosted migration and independent human acceptance remain pending. See [verification evidence](../../deliverables/evidence/member4-flow-safety-2026-09-18.md).
The worker remains local by user choice. No Render deployment is required.

## Release order

1. Pause web use/import submissions and stop **all older workers**, including local processes. Old workers use
   unconditional writes and must not run alongside this release.
2. Back up Supabase. If not yet applied, follow [atomic import preflight](atomic-imports.md) and apply
   `202609180001_atomic_imports.sql` first. Do not rerun the original schema migration.
3. Apply [202609180002_import_transitions.sql](../../database/migrations/202609180002_import_transitions.sql)
   once as database owner. It adds three service-only functions and cancels active jobs attached to sources
   already explicitly skipped. Source content, evidence and daily quota counters are preserved.
4. Deploy the matching web revision and restart the local worker from that same revision.
5. Verify Skip on queued imports, five skipped saves followed by a new save, processing/Skip contention, a
   partially checked unknown-location booking, and share hiding/restoration after changing dates and regenerating.
   Repeat cross-account denial and share revocation checks before reopening the pilot.

The API now includes `Job.status = cancelled`, nullable `travelMinutesBefore`, the `TRAVEL_UNKNOWN` conflict,
and `SharedTripView.stale`. Web, worker and clients must move together. Do not roll back to a client that rejects
cancelled jobs or null travel while those records exist. Keep additive migrations; prefer a forward fix.

## Semantics

- Queued, failed and needs-input saves can be skipped; repeated Skip is idempotent. Skip atomically cancels
  their queued/running job before source processing starts. If processing wins, Skip is rejected with `409`.
  This does not abort an already-running provider request; there is no promise of in-flight cancellation.
- Conditional source updates and job settlement check the claimed job ID/attempt. Obsolete attempts cannot
  overwrite source status, retry state or completion. Candidate merging/upserts remain separate operations;
  [Member 3 issue #9](https://github.com/namprice227/reel-travel/issues/9) covers their transactional design.
- Skip frees active capacity but does not refund a daily submission. Retrying or final failure updates both
  job and source in one transaction; an interrupted transaction leaves the claimed job recoverable.
- Missing coordinates mean travel is unknown, represented by null. Provisional schedules still respect known
  fixed times and overlaps but show `partially_checked` when only travel/hours uncertainty remains. A break
  stays at the current location; an unlocated booking makes the following origin unknown.
- The planner fingerprint now includes a rules revision and destination. Existing immutable plans become stale
  and must be regenerated to adopt the new validation. No saved version is rewritten. Old public plans are
  withheld until regeneration, and the owner preview explains that behavior.
- Shared views recheck revocation before returning. Stale responses contain current public trip metadata,
  `stale: true`, no itinerary and no scheduled places. Link tokens, private sources and uploads remain excluded.

The rollout does not implement place merging, Google Places verification, auth recovery, transcript caching or
analytics delivery. See [Member 3's concrete merge proposal](member3-transactional-merge.md).

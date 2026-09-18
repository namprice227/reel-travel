# Member 4: Skip transitions, unknown travel and stale shares

18 September 2026. User-requested follow-up to the full-flow audit. All acceptance data is synthetic.

## Implemented behavior

- Skip atomically marks the source skipped and cancels active jobs. Active capacity is released; daily allowance
  is retained. Repeated Skip is idempotent. If source processing wins the race, Skip returns a clear `409`.
- Worker source writes check the claimed job ID/attempt; cancelled and superseded attempts cannot overwrite
  source status. Retry/final-failure settlement updates job and source together. Development file behavior and
  Supabase RPCs implement the same service boundary. Processing provider requests are not forcibly cancelled.
- Unknown travel is null and produces `TRAVEL_UNKNOWN`/`partially_checked`; known overlaps still produce errors.
  Unlocated bookings invalidate the next origin; breaks preserve location. Timeline, magazine and map expose
  unknown arrival checks. The measurement script returns null aggregate travel/idle metrics when legs are unknown.
- Sharing computes staleness against the planner fingerprint. Dates, destination, timezone, preferences, bookings,
  places and planner-rule changes can withhold the public itinerary/places. The owner preview explains this;
  regeneration restores the same link. Old immutable versions are never rewritten.

## Verification

- `npm run check`: 305 tests in 24 files; workspace types, generated API docs and planning/link validation pass.
- `npm run test:db -- --hookTimeout=60000`: 21 tests pass on a new disposable PostgreSQL 16 database (2.54 seconds).
  New SQL coverage includes Skip versus claim/start, lost attempt ownership, cancellation/settlement rollback,
  active-capacity release, retained daily usage and browser-role denial.
- `npm run build`: Next.js production build passes with Node 24.
- Application regressions exercise Skip ordering, cancelled-job startup, stale attempts, seven stale-share
  triggers with regeneration/revocation, ungenerated shares and unknown-travel validation.
- Fresh browser/phone/keyboard checks and hosted rollout are not performed. Existing Home browser expectations
  still need the separately identified trip-picker update. No live AI/provider calls or hosted data writes ran.

## Member 3 coordination

[Issue #9](https://github.com/namprice227/reel-travel/issues/9) records the reproduced merge/reference failure,
proposed repository transaction, locking/idempotency requirements and acceptance checks. The detailed
[handoff](../../docs/operations/member3-transactional-merge.md) is included in this change. Member 3's GitHub
username is not in the repository and has been requested; the issue is unassigned and no human agreement is
claimed. Transactional place merging and candidate upserts remain outstanding.

## Rollout and limits

Follow [flow-safety release order](../../docs/operations/flow-safety.md). Apply
`202609180002_import_transitions.sql` after the earlier migrations, with web use paused and old workers stopped.
Deploy matching web/worker code together; older clients do not understand cancelled jobs/null travel.
The migration cancels jobs belonging to already-skipped sources without deleting content or refunding quotas.
The hosted migration and deployment remain pending. Worker hosting stays local, and Google Places stays deferred.

SQL acceptance uses minimal Auth/Storage schema doubles. State transitions are atomic, but candidate upsert/merge
is a separate persistence operation covered by the Member 3 handoff. Unknown legs remain provisional scheduling
lower bounds; this change does not supply real routing or missing coordinates. A changed planner fingerprint
requires existing plans to be regenerated, including before their public viewing links show itinerary content.
Independent human review remains pending.

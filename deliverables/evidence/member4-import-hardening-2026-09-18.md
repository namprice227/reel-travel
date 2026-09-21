# Member 4: atomic imports and resource controls

Date: 18 September 2026. Synthetic local acceptance; hosted rollout and human review pending.

## Problem and changes

The repository audit reproduced source/job split writes, two jobs from concurrent retries, and lost concurrent
trip edits. This tranche replaces import submission with one database transaction and rejects stale trip writes.
It also bounds import submissions and private uploads. The Claude reference artifact could not be accessed, so
this is a repository-based repair, not a verified comparison with that artifact.

- Contracts: `expectedUpdatedAt`, `STALE_TRIP`, documented quota errors and 4 MiB screenshots.
- Database/repositories: atomic source/job/asset metadata submission, per-user serialized quota checks, one-active-job
  index, idempotent active retries and checked trip updates that retain the latest itinerary pointer.
- Services: shared burst limit, screenshot cleanup after confirmed failed commits, and no deletion of committed
  bytes when the submit response is lost.
- UI: explicit Home destination trip, truthful source-support/review/queue messages, stale-edit guidance and
  an itinerary load-error state.
- Policy: 10 import requests/minute, 5 active jobs, 30 submissions per fixed 24 hours, 100 MiB recorded assets,
  4 MiB per screenshot. Automatic attempts keep their existing job allowance.

## Checks actually run

| Check | Result |
| --- | --- |
| `npm run check`, Node 24 / Python 3.12 | PASS: 288 tests in 23 files; workspace types, generated API docs and planning/link validation |
| PostgreSQL 16, fresh disposable `reel_test_*` database | PASS: 16 tests, including rollback, concurrent submissions/retries, quota expiry, role denial and trip conflicts |
| `npm run build` | PASS: Next.js production build |
| Fresh browser/phone/keyboard acceptance | Not run; connected browser unavailable |
| Hosted Supabase migration and Vercel release | Not performed for this tranche |

One SQL rerun timed out in its 10-second setup hook while other checks were running; no assertions ran in that
attempt. A fresh database run with `npm run test:db -- --hookTimeout=60000` passed all 16 tests in 2.68 seconds.
No test credentials or private source material are committed. SQL tests use minimal Auth/Storage schema doubles,
not the live Supabase services. Application tests use synthetic data and no real model/provider requests.

Key regressions are in `tests/integration/import-transactions.test.ts`, `tests/integration/supabase-adapter.test.ts`
and `tests/database/supabase.test.ts`. Real-import fixture tests now isolate each synthetic account so quota
enforcement stays enabled instead of depending on shared unlimited test state.

## Rollout and remaining limits

Apply [the new migration](../../database/migrations/202609180001_atomic_imports.sql) using the
[preflight and rollout guide](../../docs/operations/atomic-imports.md) before deploying this web revision.
Duplicate active jobs must be reviewed before migration; old orphan saves are reported, not automatically changed.
The user-selected local worker remains the operating model; no Render service is created.

Storage object writes cannot share a PostgreSQL transaction. Process termination or uncertain cleanup can leave
orphan bytes, and retention/account-deletion cleanup remains unfinished. Limits are per account and do not impose
a global spend cap. Development file persistence remains single-process only.

Google Places verification remains intentionally deferred, so extracted candidates cannot yet enter confirmed
planning. Stale itinerary/share content after trip changes, unknown-location planning validation, missing planner
edit UI, server-persisted notes, auth recovery and production analytics remain separate audit items. This tranche
does not complete the full product or establish extraction accuracy. Independent human review remains pending.

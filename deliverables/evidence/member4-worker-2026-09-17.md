# Member 4: bounded import worker

Date: 17 September 2026. Scope: BE11 job execution and recovery; AI-assisted implementation, human review pending.
Branch: `feat/member4-supabase-platform`, updated from merged main `841df2b`.

## Behavior and decisions

- Supabase imports only enqueue in HTTP handlers. The old HTTP executor rejects production, Supabase and real
  provider modes. Local file/fake imports still run inline for the demo.
- `apps/worker` executes the existing server pipeline directly against Supabase, one child at a time. No second
  API or extraction implementation. Separate always-on Node hosting is required.
- Each attempt is killed at 15 minutes; abandoned jobs become reclaimable after 20 minutes. Child deadline and
  parent-disconnect handling bound orphaned work. Shutdown stops polling and terminates the child.
- An additive SQL migration caps attempted claims at `maxAttempts`, including process crashes. Exhaustion updates
  the job and queued/processing save together; source content, uploads, partial candidates and skipped saves survive.
- A caught final failure updates the save before finalizing the job, leaving recovery possible if interrupted.
- Deployment instructions retire the earlier Cron-to-web trigger and describe migration/worker rollout.

## Verification

Local Windows checks on Node 24.21.0, Python 3.12 and PostgreSQL 16:

| Command/check | Result |
| --- | --- |
| `npm run check` | PASS: 227 tests across 20 files, all typechecks, generated API docs and planning/link validation |
| `npm run test:db` | PASS: 11 PostgreSQL tests, both migrations applied in order |
| `npm run build` | PASS: production Next.js build |
| `npm run smoke`, local file/fake server on port 3107 | PASS: all 13 HTTP checks |
| Production server on port 3108, old job endpoint with valid synthetic secret | 403 FORBIDDEN, dedicated-worker message |
| `npm run docs:api` | PASS: 31 endpoints, 55 shared types |

Acceptance coverage:

- Supervisor: actual child termination, shutdown, process failure and serial polling.
- Worker entry point: real server imports and Supabase SDK with offline mocked fetch, outside Next.js.
- Handler boundary: all four enqueue paths avoid `after()` in Supabase mode; old execution is rejected.
- Recovery: exhausted crashed claims, live-claim protection, skipped saves, partial-result deduplication and interrupted final failure updates.
- PostgreSQL 16: 11 database tests passed, applying both migrations, including concurrent exhaustion and rollback.

## Limits

No live provider calls, new hosting accounts or hosted worker were exercised. The process deadline uses seconds
in automated tests, not a 15-minute real provider run. Recovery uses controlled timestamps. Supabase Auth/Storage
remain schema doubles in SQL tests. No performance/cost improvement or remote deployment is claimed.

Retries can repeat provider requests and costs. Existing candidate reuse is not exactly-once execution or a
distributed fencing guarantee. Killed attempts wait for the abandoned threshold; no worker means queued imports
do not advance. Hosted monitoring and the acceptance checks in [worker operations](../../docs/operations/worker.md)
remain required. Provider algorithms, frontend features and unrelated Member 4 tasks are unchanged.

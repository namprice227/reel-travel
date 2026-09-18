# Dedicated import worker

Implemented for BE11 on 17 September 2026. Hosted deployment remains unverified.

## Why the worker is separate

YouTube imports first check the 120-second content limit via the user-selected duration service (10-second request timeout).
Only eligible videos reach Gemini; transcription defaults to a 120-second timeout, followed by extraction and sequential place lookups.
The web API has a 60-second budget. Next.js `after()` shares the route budget, so imports now only enqueue on the
web app. A separate Node process runs the existing server pipeline against the same Supabase repositories.
No additional public API or duplicate extraction implementation is introduced.

## Configure and start

1. Stop any old HTTP-trigger workers. Unschedule `reel-import-retries` if it was installed using
   [the retirement SQL](../../database/operations/schedule-imports.sql).
2. Apply [the attempt-limit migration](../../database/migrations/202609170001_import_job_attempt_limit.sql)
   after the initial Supabase migration. Never rerun the initial migration on populated projects.
3. Deploy the web version which disables inline Supabase imports and the production HTTP executor.
4. On a separate always-on Node 24 host, check out the same commit and run `npm ci` from the repository root.
5. Configure the process environment below and start `npm run worker`. Keep the repository root/all workspaces
   available; the worker imports the server services directly. TypeScript runs with the locked `tsx` dependency.
6. Configure the host's service manager to restart the worker on failure. Do not run it as a Vercel function or
   a short-lived HTTP cron. No listening port or inbound public access is required.

| Variable | Worker use |
| --- | --- |
| `NODE_ENV` | `production` when hosted |
| `DATA_BACKEND` | Required: `supabase` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Same database as the web app; privileged key stays private |
| `AI_PROVIDER`, `PLACES_PROVIDER` | `fake` for smoke; `openai`/`none` for real unverified imports (no Places call) |
| `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY` | Real extraction/lookup |
| `GOOGLE_AI_API_KEY` | Real YouTube transcription |
| Existing model/provider timeout overrides | Same names documented in `.env.example`; cannot extend the overall attempt deadline |
| `WORKER_INTERVAL_MS` | Idle/error poll delay; 15000 by default, valid range 1000–60000 |

Locally, the workspace start command also reads `apps/web/.env.local`. Keep it untracked. `SITE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `WORKER_SECRET` and `WEB_URL` are not needed by the dedicated worker.
The multiprocess worker refuses file mode, whose store is single-process only. The local file/fake demo retains
inline imports and the secret-protected HTTP retry endpoint; real imports need Supabase even locally.

## Execution and recovery

- A poll lists one due job. A child atomically claims it; competing workers cannot claim the same live attempt.
- Each attempt has a hard 15-minute deadline. The supervisor kills and waits for the child to close before
  starting another attempt. The child also has its own deadline and exits when its supervisor disconnects.
  SIGINT/SIGTERM stops polling and kills active work; job state remains durable for recovery.
- The abandoned threshold is 20 minutes from the claim, leaving a margin after the process deadline.
  All workers must run the same version and have synchronized clocks. Stop old executors during upgrades.
- Caught provider failures retry after 10 seconds, then 60 seconds, plus poll delay. A killed process cannot run
  its catch handler: it remains `running` until the abandoned threshold, not merely the normal retry delay.
- At three attempted claims, the next due recovery poll marks the job failed without a fourth provider call.
  The same transaction makes its queued/processing save recoverable. Skipped/finished saves remain untouched.
- Source content, private upload references and partial candidates remain stored. Retry reuses the existing
  idempotent candidate logic. Earlier provider calls may be repeated and billed; this is not exactly-once execution
  or a checkpointed pipeline. Requests already sent to providers cannot be recalled by killing the child.
- A provider request already accepted by Supabase may commit as the child exits. The recovery window gives these
  requests time to settle; this is not a distributed fencing guarantee against arbitrarily delayed writes.

## Acceptance after deployment

Use synthetic or permissioned sources. Record the commit and timestamps, without private content or keys.

1. Keep the worker stopped; enqueue a save and verify the API returns promptly with a queued job.
2. Start the worker; observe extraction, explicit place confirmation and a generated itinerary.
3. Run two workers against one queued job; only one attempt should execute.
4. Terminate an attempt after a partial result; wait for recovery and verify no duplicate candidate/evidence loss.
5. Interrupt all three attempts; after final recovery, confirm `failed`, attempt=3 and user Retry/Add details.
6. Confirm the production HTTP job endpoint returns 403 even with the old valid secret.
7. Verify SIGTERM stops the worker and its child, and the service manager restarts the worker.

Monitor worker availability and the age of queued/running jobs. With no worker, imports stay queued. Start with
one worker and measure throughput before adding processes. Host setup, alert delivery and live provider timings
are still deployment work; local mocked tests do not establish them.

Process control follows [Node's child-process API](https://nodejs.org/api/child_process.html), including waiting
for `close` after termination. Local acceptance evidence is recorded separately from hosted verification.

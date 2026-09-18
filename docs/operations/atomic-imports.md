# Atomic imports and resource limits

Prepared 18 September 2026. Tested on disposable PostgreSQL 16, not yet applied to hosted Supabase.
Keep the worker local as selected by the user. This change requires a database migration before web deployment.

## Rollout

1. Back up the project and pause import submissions and the local worker for this short rollout.
2. In Supabase SQL Editor, check for duplicate active jobs:

   ```sql
   select target_id, count(*) as active_jobs
   from public.reel_jobs
   where status in ('queued', 'running')
   group by target_id having count(*) > 1;
   ```

   This must return no rows. If it returns rows, review which job should continue before changing anything.
   The migration fails on duplicates; it does not delete saved content or arbitrarily cancel work.
3. After the two earlier migrations, run the complete
   [202609180001_atomic_imports.sql](../../database/migrations/202609180001_atomic_imports.sql) once as database owner.
   Do not rerun the initial schema migration. Stop if any statement fails.
4. Deploy the matching web commit to Vercel, then restart `npm run worker` locally from that commit.
5. Verify one save progresses, concurrent retry requests return the same job, stale trip edits show a reload
   message, oversized screenshots are rejected, and account isolation still holds. Fresh browser and hosted
   acceptance for this release remain pending.

The migration adds two server-only functions and an index, and lowers the private bucket limit to 4,194,304 bytes.
Existing larger objects are not deleted. Keep the additive schema if rolling the web code back; older code does
not provide these atomic submission guarantees.

## Limits and behavior

| Limit, per account | Enforcement |
| --- | --- |
| 10 import requests per minute | Shared database counter before reading/uploading screenshot bytes |
| 5 queued/running import jobs across all trips | Serialized database submission transaction |
| 30 new jobs per fixed 24-hour window starting at first accepted submission | Same transaction; failed submissions roll back this counter |
| 100 MiB recorded private assets | Same transaction before committing metadata |
| 4 MiB per screenshot | UI, service and Storage bucket; leaves multipart room within Vercel's request limit |

Repeated retry requests reuse active work and consume no additional daily job slot. Explicit retry after failure
creates a new job and consumes one slot. Each job can still make up to three automatic attempts; the daily limit
is not a token, dollar or provider-call cap. The burst counter also counts rejected/duplicate requests. Active
jobs wait while the local worker is off; a `Retry-After: 30` response is a suggested check interval, not a promise
that a worker will finish within 30 seconds. A full storage allowance returns `409 INVALID_STATE`; use text or
arrange reviewed retention cleanup. There is no user-facing asset deletion flow yet.

The database enforces one active job per saved inspiration. New source, job and optional asset metadata commit
together. If upload submission fails, the service removes bytes only after confirming that metadata did not
commit; unavailable checks leave an object for later reconciliation. Storage bytes and PostgreSQL cannot share
one transaction, so process termination can still leave an orphan object.

Trip forms send `expectedUpdatedAt`; the service rejects stale forms. A database comparison against the loaded
trip also rejects overlapping edits, while preserving the latest itinerary pointer. `409 STALE_TRIP` asks the
traveler to reload and review their unsaved changes. This does not resolve stale itinerary content after trip
dates change; that is separate work.

## Older orphan saves

This read-only query identifies queued saves without any active job:

```sql
select i.id, i.trip_id
from public.reel_inspirations i
where i.data->>'status' = 'queued'
  and not exists (
    select 1 from public.reel_jobs j
    where j.target_id = i.id and j.status in ('queued', 'running')
  );
```

Review any results before a targeted recovery (for example marking a proven interrupted save failed so its
owner can retry). No bulk repair is run automatically. The new transaction prevents this particular source/job
split on new submissions; it does not silently rewrite historical data.

Resource policy constants live in `apps/web/src/server/jobs/import-limits.ts` and the SQL migration. Future policy
changes must update both adapters and use a new migration. Development file mode is single-process only.

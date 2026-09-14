# Background jobs

Member 4 owns execution, job persistence and bounded retries; Member 2 owns AI job logic.

Job state and the import pipeline live in the web app (`apps/web/src/server/jobs`). In development each import runs
right after its request. This process only asks the app to run due jobs (retries after 10 s and 60 s, and runs
abandoned for 5 minutes) by calling the `jobs.runDue` endpoint every `WORKER_INTERVAL_MS`.

```bash
npm run worker   # reads apps/web/.env.local: WEB_URL, WORKER_SECRET, WORKER_INTERVAL_MS
```

In deployment a hosted cron calling `POST /api/internal/jobs/run-due` with the `x-worker-secret` header can replace
this process. Record the choice in docs/operations. Avoid creating a second API.

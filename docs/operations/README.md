# Operations workspace

Owner: Member 4, reviewed by Member 1.

Add local setup commands, environment-variable names without values, deployment instructions,
job retry limits, access controls, rollback steps, and demo recovery after the stack is chosen.
Record analytics events for import started/completed/recovered, place confirmed, plan accepted,
stop moved and share created. Avoid raw source text, trip details and uploads in event payloads.
Validate event delivery before inviting pilot users.

## Current development setup (2026-09-14)

- Commands: `npm install`, `npm run dev`; optional `npm run seed` and `npm run worker`. See the root README.
- Environment variable names (values only in `apps/web/.env.local`, never committed): `REEL_DATA_DIR`,
  `ENABLE_DEV_SIGN_IN`, `WORKER_SECRET`, `AI_PROVIDER`, `PLACES_PROVIDER`, `FAKE_AI_DELAY_MS`, `WEB_URL`,
  `WORKER_INTERVAL_MS`. Documented in [.env.example](../../apps/web/.env.example).
- Job retries: 3 attempts, retried after 10 s and 60 s; a running job is reclaimable after 5 minutes.
- Analytics events are only logged (`trackServer`, `track`) until a provider is connected.
- Not deployable as is: JSON file store, email-only sign-in, no rate limits, no hosting chosen.

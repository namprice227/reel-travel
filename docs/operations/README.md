# Operations workspace

Owner: Member 4, reviewed by Member 3.

**Current setup:** [Supabase and Vercel connection guide](supabase-vercel.md). Database/auth/private-storage
adapters, migration, distributed quotas, CI and job scheduling configuration are implemented. User account connection
and hosted acceptance are pending. The older development notes below describe the retained local file mode.

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
- Not deployable as is: JSON file store, email-only sign-in, no hosting chosen. Sharing limits now run through the
  repository interface; the deployed database must enforce them atomically across instances.

## Member 4 implementation update (2026-09-16)

- Runtime: use Node 24 for the locked test tooling. Python 3 must be on PATH for `npm run check`.
- Sharing limits: 10 link creations per owner per 10 minutes; 120 public reads per valid link per minute.
  A 429 includes `Retry-After`; denied calls do not prolong the window. Revocation bypasses read quota checks.
- Required database operations: transactional `itineraries.saveVersion`, monotonic `shares.revoke`/`markViewed`,
  and atomic expiring `rateLimits.consume`. See [F0](../features/F0-foundation.md).
- The Supabase implementation now supplies these database operations, real identity and private object storage.
  Use the connection guide above to install credentials and deploy. Hosted verification, scheduled worker delivery
  and analytics-provider connection remain outstanding.

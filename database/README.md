# Database workspace

Owner: Member 4; reviewed by Member 3.

Supabase is selected (DEC-04). Set `DATA_BACKEND=supabase` to use the server adapter; local development defaults
to the JSON file store. Production rejects file mode. Both implement `Repositories` in `apps/web/src/server/db/types.ts`.

Private screenshots and user-uploaded trip covers store bytes in the `reel-private-uploads` Storage bucket.
`reel_assets` stores only owner/trip/content metadata; inspirations or trips retain the asset id. Browser code
never receives a Storage service key or a public bucket URL.

- `migrations/`: [initial Supabase migration](migrations/202609160001_supabase.sql), with RLS, explicit grants,
  relational constraints, atomic RPCs, database-backed quotas and the private bucket.
- `operations/`: [minute-level job schedule](operations/schedule-imports.sql), configured after adding Vault secrets.
- `seeds/`: [seed-dev.ts](seeds/seed-dev.ts) loads synthetic demo data through the services (`npm run seed`).

Apply access controls by trip owner; keep the read-only share projection separate.
The adapter must implement transactional itinerary version saves, atomic share revocation/view timestamps,
and shared fixed-window rate limits in addition to atomic job claims. See `server/db/types.ts` for method contracts.
Do not commit production exports or private uploads. Requirements for a real store: [F0](../docs/features/F0-foundation.md).
Account connection, migration instructions and local SQL tests: [Supabase/Vercel setup](../docs/operations/supabase-vercel.md).

## Import worker upgrade (17 September 2026)

Apply `migrations/202609170001_import_job_attempt_limit.sql` after the initial migration. Existing projects must
not recreate their tables. Exhausted claims atomically fail the job and its queued/processing save.
The database suite applies all SQL migrations in filename order. See [worker rollout](../docs/operations/worker.md).

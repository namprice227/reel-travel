# Connect Supabase and Vercel

Prepared 16 September 2026 for Member 4. The code and local PostgreSQL tests are implemented; accounts, live
credentials, email delivery, Supabase Storage and hosted scheduling have not been connected or verified.

## 1. Create the Supabase project and database

1. Create a Supabase project in your account. Use a dedicated project for this application.
2. Open its SQL editor and run [202609160001_supabase.sql](../../database/migrations/202609160001_supabase.sql)
   **once**, as the database owner. It runs in a transaction; stop and resolve any error before continuing.
3. Check that the eleven `reel_*` tables exist and RLS is enabled on every table.
4. Check the private `reel-private-uploads` bucket exists, is not public, and limits uploads to 5 MB and the four
   supported image MIME types. Do not add public read policies or browser access policies for this bucket.

The adapter stores the existing contract documents in JSONB. Generated columns provide owner/trip relationships,
lookup indexes and unique itinerary versions. Sessions contain only token hashes. The `reel_users.auth_user_id`
foreign key links app users to Supabase Auth; deleting an Auth user cascades their application rows.

All database calls use the server key through Next.js services. Browser roles have no direct table or function
grants. Ownership checks remain in the services; RLS with no browser policies provides another boundary.
Database functions use `security invoker`, with execution granted only to `service_role`.
[Supabase function security](https://supabase.com/docs/guides/database/functions),
[RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 2. Configure authentication

1. Enable Supabase's email/password provider and keep email confirmation enabled.
2. In Auth URL configuration, set the Site URL to the final HTTPS application origin.
3. Add `http://localhost:3000/sign-in` for local development and `https://YOUR_APP/sign-in` for the hosted app to
   the redirect allowlist. Add only preview origins you intend to test.
4. Configure the email sender/SMTP settings required by your Supabase project, then test delivery to your test users.

The sign-in screen supports registration and password sign-in. Signup asks the user to check their email and then
sign in; it does not create an application session from the signup response. After successful confirmed sign-in,
the app issues its existing 30-day opaque `reel_session` cookie (HttpOnly, SameSite=Lax, Secure in production).
Passwords and Supabase access/refresh tokens are never returned to the browser or stored in the application database.
Sign-out deletes the current application session. Password-reset/MFA/account-management UI is outside this slice;
Supabase password changes do not automatically revoke these independent application sessions.
[Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup),
[password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

## 3. Connect locally

Copy [apps/web/.env.supabase.example](../../apps/web/.env.supabase.example) to `apps/web/.env.local`, and replace
the placeholders locally. Do not commit this file or paste secret values into task logs.

| Variable | Value |
| --- | --- |
| `DATA_BACKEND` | `supabase` |
| `SUPABASE_URL` | Project HTTPS URL |
| `SUPABASE_SECRET_KEY` | Server secret key, or legacy `service_role` key |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key, or legacy `anon` key, for the separate auth client |
| `SITE_URL` | `http://localhost:3000` locally; exact HTTPS origin when hosted |
| `WORKER_SECRET` | A random value of at least 32 characters, shared only with the job trigger |
| `ENABLE_DEV_SIGN_IN` | `false` |
| `AI_PROVIDER`, `PLACES_PROVIDER` | `fake` until the separately owned real adapters are available |

The app never falls back to local files when Supabase configuration fails. Production rejects `DATA_BACKEND=file`,
and development sign-in is disabled whenever Supabase is selected, regardless of `ENABLE_DEV_SIGN_IN=true`.

Use Node 24 and Python 3.12, then run from the repository root:

```sh
npm ci
npm run check
npm run dev
```

Create two real test accounts through `/sign-in`, confirm their emails and verify account isolation. Supabase
uploads are downloaded server-side after `getOwnedAsset` checks ownership; viewers never receive public bucket URLs.
[Private storage](https://supabase.com/docs/guides/storage/serving/downloads).

## 4. Deploy to Vercel

1. Push the prepared branch to your Git provider when ready. The assistant's requested commit is local; no push or
   account connection is assumed.
2. Import the repository into Vercel. Select **Next.js**, root directory **`apps/web`**, and Node **24.x**.
3. Allow build access to files outside that root so the npm workspace packages are available.
4. The checked-in [vercel.json](../../apps/web/vercel.json) installs at the repository root and runs the workspace
   production build. Keep the output directory at the Next.js default.
5. Set the variables above in Vercel's environment settings. Use the deployed HTTPS origin for `SITE_URL`, and add
   its `/sign-in` URL to Supabase's redirect allowlist. Redeploy after changing build-time/site metadata settings.
6. Test the published `/sign-in` flow, saved trips, private uploads and share revocation before inviting users.

Workspace/root settings follow [Vercel's monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq).

The production API has a 60-second function budget and processes one due job per worker request. Provider calls
must fit that budget; timed-out jobs are reclaimable after five minutes. The real AI/place providers remain separate
work. The `fake` adapters contain fictional venues and must be described as demo data.

## 5. Schedule retries with Supabase Cron

Vercel Hobby cron runs only daily, which does not match import retry needs. The prepared setup instead uses
Supabase Cron and `pg_net` to call the existing POST worker endpoint every minute.
[Vercel cron limits](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
[Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions).

1. Enable `pg_cron`, `pg_net` and Vault through the Supabase dashboard.
2. In Vault create `reel_web_url` containing the HTTPS origin without a trailing slash, and `reel_worker_secret`
   containing the same value as Vercel's `WORKER_SECRET`.
3. Run [schedule-imports.sql](../../database/operations/schedule-imports.sql). It contains secret **names**, not values.
4. Check the named `reel-import-retries` job in Supabase Cron. Re-running the schedule script updates the named job.
5. Inspect both Cron run status **and the pg_net HTTP response**. Cron successfully queuing a request does not prove
   Vercel accepted it. Confirm a due job advances in `reel_jobs` without a browser open.

If Vercel deployment protection blocks server calls, configure access for this endpoint on the chosen deployment;
do not expose the worker secret in a URL. Retry delays remain 10 and 60 seconds, but cron dispatch adds up to its
one-minute interval. Production processes one job per request; increase capacity only after measuring provider times.

To pause the trigger: `select cron.unschedule('reel-import-retries');`. Rotate WORKER_SECRET in Vercel and Vault
together. Scheduling is prepared, not verified against your accounts.

## 6. Verify the connected deployment

- Register/confirm account A; create a trip and screenshot. Restart/redeploy and verify both survive.
- Sign in as B: A's trips are absent, and A's trip/upload endpoints return 404.
- Sign out: protected endpoints return 401; `auth.devSignIn` returns 403.
- Generate/edit concurrently: one save wins, the other gets `STALE_VERSION`; versions stay immutable.
- Create/view/revoke a link, then reload the viewer. Check private fields/uploads never reach it.
- Exhaust a share quota and verify 429/Retry-After; repeat from another app instance to check shared enforcement.
- Trigger a retry and observe Cron, pg_net response and the job state.
- Check Supabase's security advisor for unintended grants/policies, especially on pre-existing project objects.

For the existing fixture-based HTTP smoke flow, use **two dedicated confirmed accounts**, set `SMOKE_AUTH=supabase`,
`SMOKE_ALICE_EMAIL`, `SMOKE_ALICE_PASSWORD`, `SMOKE_BOB_EMAIL`, `SMOKE_BOB_PASSWORD`, and `SMOKE_BASE_URL` in the shell,
then run `npm run smoke`. This creates a new synthetic trip and share records each run. It requires the fake AI/place
adapters; it verifies real auth/storage paths only when actually pointed at the connected app. Never enable dev
sign-in to make a production smoke test pass.

## Database tests and rollback

`npm run test:db` applies the migration to a **new disposable PostgreSQL database named `reel_test*`** supplied in
`TEST_DATABASE_URL`. It uses minimal Auth/Storage schema doubles; it tests actual SQL and concurrent connections,
not live Supabase Auth/Storage or pg_net. The CI workflow provides a fresh PostgreSQL 16 service automatically.
For local reruns, create another empty test database; the suite deliberately does not drop existing schemas.

Deployments can roll back to a previous version that supports these tables. Do not roll back production to the
file-store build. Back up the Supabase database before later migrations; this initial migration has no automatic
destructive down migration. Private object cleanup after account deletion/failed uploads needs a retention policy;
database row deletion alone does not delete stored object bytes. Expired app sessions should be periodically purged
with `delete from public.reel_sessions where expires_at <= to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');`.

Analytics is still console-only; connecting a product analytics provider is not part of the Supabase database swap.

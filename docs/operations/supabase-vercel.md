# Connect Supabase and Vercel

**Deployment update, 18 September:** https://reel-travel.vercel.app is live against the existing Supabase
project. The user selected a local worker instead of paid worker hosting. Hosted authentication, production
access guards and Short import through the local worker passed; see [deployment evidence](../../deliverables/evidence/member4-vercel-deployment-2026-09-18.md).
The setup instructions below remain useful for subsequent releases. Run `npm run worker` locally for imports.

Prepared 16 September 2026 for Member 4. The code and local PostgreSQL tests are implemented; accounts, live
credentials, email delivery, Supabase Storage and the hosted worker have not been connected or verified.
Updated 17 September: real imports execute in a separate Node worker, not a Vercel request.

**Connection update, 18 September:** live Supabase is now connected locally. Authentication, database writes,
private image uploads, cross-account isolation and persistence across an application restart passed manual
checks against the real services. See [sanitized live evidence](../../deliverables/evidence/member4-supabase-live-2026-09-18.md).
The automated accounts were admin-confirmed; independent email-delivery verification, Vercel deployment and
hosted worker verification remain pending. This supersedes the initial connection status above.

## 1. Create the Supabase project and database

1. Create a Supabase project in your account. Use a dedicated project for this application.
2. Open its SQL editor and run [202609160001_supabase.sql](../../database/migrations/202609160001_supabase.sql)
   **once**, as the database owner. Then apply [202609170001_import_job_attempt_limit.sql](../../database/migrations/202609170001_import_job_attempt_limit.sql).
   Then apply [202609180001_atomic_imports.sql](../../database/migrations/202609180001_atomic_imports.sql)
   using the [import rollout guide](atomic-imports.md). Existing projects apply only migrations not already installed.
   Then follow the [flow-safety release guide](flow-safety.md) for `202609180002_import_transitions.sql`.
   These are transactional; stop and resolve any error before continuing. Apply all required migrations before the matching web/worker release.
3. Check that the eleven `reel_*` tables exist and RLS is enabled on every table.
4. Check the private `reel-private-uploads` bucket exists, is not public, and limits uploads to 4 MiB and the four
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
| `WORKER_INTERVAL_MS` | Worker idle poll interval, default `15000` (allowed `1000` to `60000`) |
| `ENABLE_DEV_SIGN_IN` | `false` |
| `AI_PROVIDER`, `PLACES_PROVIDER` | `fake` for platform smoke tests; `openai`/`google` for real imports with location matches; set server-only `GOOGLE_PLACES_API_KEY` on web and worker |

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

The production API retains its 60-second request budget, but only persists/enqueues imports. It does not execute
provider work in `after()`. Even Supabase-backed fake imports need the separate worker below. Local file mode with
fake providers retains inline execution for the demo.

## 5. Run the dedicated import worker

Follow [worker deployment and recovery](worker.md). On an always-on Node 24 host with this repository checked out:

For a prepared hosted configuration, use the [Render background-worker guide](render-worker.md).
The web app and worker must connect to the same Supabase project and run compatible commits.

```sh
npm ci
npm run worker
```

Set `NODE_ENV=production`, `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the provider variables
on that host. The worker talks directly to Supabase and executes the existing import pipeline in child processes.
It needs no public HTTP listener, web URL, auth publishable key or worker endpoint secret. Configure the host to
restart it on failure and monitor its logs. Hosting/account setup remains the user's step.

**Upgrade:** stop older workers/triggers, apply the new migration, deploy the web changes, then start the new worker.
If the earlier Supabase Cron job was installed, run the now-retirement script
[schedule-imports.sql](../../database/operations/schedule-imports.sql) to unschedule `reel-import-retries`.
The old HTTP executor returns 403 in Supabase/production mode. Do not keep Cron calling it.

Each worker executes one attempt at a time, with a hard 15-minute process deadline. A job left running by a timeout
or crash becomes reclaimable after 20 minutes from its claim. At three attempts, the next recovery poll atomically
marks the job and its still-queued/processing save failed. Ordinary caught errors retain 10/60-second retry delays.
See the worker guide for limitations and acceptance checks; hosted process supervision has not been verified.

## 6. Verify the connected deployment

- Register/confirm account A; create a trip and screenshot. Restart/redeploy and verify both survive.
- Sign in as B: A's trips are absent, and A's trip/upload endpoints return 404.
- Sign out: protected endpoints return 401; `auth.devSignIn` returns 403.
- Generate/edit concurrently: one save wins, the other gets `STALE_VERSION`; versions stay immutable.
- Create/view/revoke a link, then reload the viewer. Check private fields/uploads never reach it.
- Exhaust a share quota and verify 429/Retry-After; repeat from another app instance to check shared enforcement.
- Trigger a retry, terminate a worker attempt, and observe recovery in the worker logs and job state.
- Check Supabase's security advisor for unintended grants/policies, especially on pre-existing project objects.

For the existing fixture-based HTTP smoke flow, use **two dedicated confirmed accounts**, set `SMOKE_AUTH=supabase`,
`SMOKE_ALICE_EMAIL`, `SMOKE_ALICE_PASSWORD`, `SMOKE_BOB_EMAIL`, `SMOKE_BOB_PASSWORD`, and `SMOKE_BASE_URL` in the shell,
then run `npm run smoke`. This creates a new synthetic trip and share records each run. It requires the fake AI/place
adapters; it verifies real auth/storage paths only when actually pointed at the connected app. Never enable dev
sign-in to make a production smoke test pass.

## Database tests and rollback

`npm run test:db` applies the migration to a **new disposable PostgreSQL database named `reel_test*`** supplied in
`TEST_DATABASE_URL`. It uses minimal Auth/Storage schema doubles; it tests actual SQL and concurrent connections,
not live Supabase Auth/Storage or the hosted worker. The CI workflow provides a fresh PostgreSQL 16 service automatically.
For local reruns, create another empty test database; the suite deliberately does not drop existing schemas.

Deployments can roll back to a previous version that supports these tables. Do not roll back production to the
file-store build. Back up the Supabase database before later migrations; this initial migration has no automatic
destructive down migration. Private object cleanup after account deletion/failed uploads needs a retention policy;
database row deletion alone does not delete stored object bytes. Expired app sessions should be periodically purged
with `delete from public.reel_sessions where expires_at <= to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');`.

Analytics is still console-only; connecting a product analytics provider is not part of the Supabase database swap.


## GitHub Actions production deployment

The `Check` workflow runs type checks, application tests, disposable PostgreSQL tests and a Next.js build.
Its `Deploy production` job runs only after those checks pass, for a push to `main` (including a merged PR)
or a manual workflow run on `main`. Feature branches and pull requests never receive the Vercel token or deploy.
Deployments are serialized; superseded commits are skipped before deployment starts.

One repository Actions secret is required: `VERCEL_TOKEN`, created in the Vercel account token settings with
access to lilduckling's projects. Add it under GitHub Settings → Secrets and variables → Actions.
The non-secret organization/project IDs are pinned in the workflow to the existing reel-travel project.
No Supabase or AI keys need to be copied into GitHub. Vercel performs the production build using its existing
Production environment variables and `apps/web` project root. This intentionally repeats CI's environment-free
build so production secrets stay configured at Vercel and public build-time settings are baked in correctly.

After merging the workflow, inspect GitHub Actions → Check → Deploy production. The job fails clearly when
the token is missing or expires. A failed check prevents deployment, and the previous production version remains
live when a build fails. Public-page smoke checks run after deployment; they do not test signed-in trip workflows
and do not automatically roll back a release. For a rerun, use Run workflow on main; CI runs again first.

This deploys the web app only. Update/restart the worker on its host separately and apply required Supabase
migrations before releasing code that depends on them. Keep native Vercel Git auto-deployment disconnected to
avoid a second deployment path bypassing the check dependency.

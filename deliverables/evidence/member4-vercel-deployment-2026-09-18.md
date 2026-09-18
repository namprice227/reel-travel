# Vercel deployment with local worker — 2026-09-18

## Release

- PR: https://github.com/namprice227/reel-travel/pull/8 (open; no merge performed).
- Deployed code commit: `cd2fff5611ab83a2a659aaf8702226abba08e1b8`.
- Production: https://reel-travel.vercel.app
- Deployment: `dpl_BBkm8TdK2iYwMEE7fJ1no8fBaVoU`, READY.
- Vercel project: `lilducklings-projects/reel-travel`, Next.js, `apps/web`, Node 24.
- Existing Supabase project reused. Required Supabase variables are encrypted production environment
  settings on Vercel; AI provider keys remain on the local worker machine.
- User chose **Vercel only; keep worker local** after reviewing Render's paid compute plan.
  No Render service was created or hosting plan purchased. `render.yaml` remains optional prepared setup.
- The user reported updating Supabase Site URL and `/sign-in` redirect allowlist to the production origin.
  Email delivery itself was not exercised by this test; synthetic test accounts were admin-confirmed.

## Checks actually run

- `npm run check`: PASS, 279 tests plus workspace typechecks, API docs and planning metadata validation.
- Local Node 24 production build: PASS; Vercel production build: PASS.
- GitHub CI for code commit above: PASS, including disposable PostgreSQL checks and production build.
- Render Blueprint: valid against the official JSON schema; URI-format checking was not enabled.
  This validates the optional file, not a hosted worker deployment.
- Hosted `/sign-in` and authenticated Places screen returned HTTP 200.
- Anonymous trip access returned 401; development email-only sign-in and the old HTTP worker endpoint returned 403.
- Hosted password sign-in returned a Secure, HttpOnly session cookie.
- Submitted the user's public Short through the Vercel API: `https://www.youtube.com/shorts/cW2Lu-N98B0`.
- Enqueue: 1,555 ms. A local isolated worker processed the job against the same Supabase database:
  14,352 ms, succeeded on attempt 1, eight unverified candidates with original source evidence.
- Instrumented calls: duration 1, Gemini 1, OpenAI 1, Google Places 0.
- The hosted detail/list APIs returned candidates with empty options and null selection. Confirm attempts
  returned 409 for all eight. Original source URL survived; sign-out invalidated the old session.
- Temporary synthetic account, trip, jobs and account-specific quota row removed; cleanup verified.

## Upload correction

The first CLI deployment included `.local` test files because Vercel upload exclusions differ from Git ignores.
That deployment (`dpl_49avM4LLfjHQoFuHaARoTyF5pupf`) was deleted. Its source file inventory contained only
example env files, not credential-bearing `.env` files. Explicit `.vercelignore` exclusions were then committed.
The replacement downloaded 211 source files; its source manifest was checked and contained no `.local`,
environment files, private directories or uploads. This records the correction rather than claiming the
initial upload never occurred.

## Operating limits

The web app is hosted; import processing depends on this Windows computer running `npm run worker` with
Node 24 and `apps/web/.env.local`. Sleeping/shutting down the computer or stopping the worker leaves new
imports queued. Do not run incompatible worker versions against the same database.

The one-shot hosted test initially tried to claim before its scheduled time because this machine's clock
lagged the web host by a few seconds. Waiting until `runAfter` resolved it; the normal polling worker retries
on its next poll. No scheduler or database clock configuration was changed.

Extraction counts vary across model runs; the eight candidates included the broad city mention Tokyo.
This is not an exhaustive accuracy evaluation or real-world place verification. Human review, Google Places
verification and continuous hosted worker operation remain deferred. No public sharing/privacy guarantees
beyond the checks listed here are claimed.

Deployment was through the authenticated Vercel CLI from the feature branch. Automatic Git deployments are
not configured. Future releases should deploy the web app and restart the local worker at matching commits.
## Render Free attempt cancelled (2026-09-18)

The user subsequently requested Render Free. A health-only web service and bounded wake integration were
implemented and passed 287 offline tests plus a production build. Render rejected service creation because
it could not access the private repository; no Reel Travel Render service was created and no Vercel wake
environment variable was set. The user then cancelled the rollout and chose the local worker again.
The Free-host change was reverted, preserving the existing Vercel deployment and local-worker architecture.
The local worker was restarted and its startup message observed. This startup check is not a new live import test.
After reverting, `npm run check` passed: 279 tests across 22 files, workspace typechecks, API docs and planning validation.

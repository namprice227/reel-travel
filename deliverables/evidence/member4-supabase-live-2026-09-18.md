# Member 4: live Supabase connection verification

Date: 2026-09-18. Scope: BE10, with hosting still pending under BE11.
AI-assisted manual verification against the user's connected Supabase project.

## Environment and method

- Local Next.js production server, Node 24.21.0, with real Supabase Auth, PostgREST and private Storage.
- Used the existing production build from the preceding implementation checks. No application code changed.
- Credentials loaded from ignored `apps/web/.env.local`; no secrets or identifiers recorded here.
- Two temporary synthetic Auth accounts were created with admin-confirmed email addresses. This bypassed
  email delivery for the automated checks; it does not test the signup confirmation email journey.
- The user reported readiness after the local signup/confirmation/sign-in instructions. Email delivery and
  their browser journey were not independently observed by the agent.
- A synthetic four-day Tokyo trip and one tiny synthetic PNG were created through application HTTP endpoints.
- Fake extraction/place providers were selected, but no worker or extraction was run. The save was skipped.
- The test server was separate from the user's development server. Windows denied the first fixed port;
  selecting an available OS-assigned port resolved startup before any test accounts were created.

## Results actually observed

The manual live harness completed **16 grouped checks**, exit code 0:

| Check | Result |
| --- | --- |
| Both accounts sign in through the application | PASS; HttpOnly, SameSite=Lax and Secure cookie flags |
| Both application sessions persisted | PASS; database IDs are SHA-256 hashes, no raw cookie token in the session row |
| Create trip and update preferences | PASS through application API |
| Upload synthetic PNG | PASS through screenshot API to Supabase Storage |
| Read preferences and image before restart | PASS; byte-identical image with image/png and private/no-store headers |
| Account B lists trips | PASS; account A's trip absent |
| Account B reads/patches A's trip or downloads A's upload | PASS; all return 404 |
| Signed-out trip and upload requests | PASS; both return 401 |
| Development sign-in | PASS; returns 403 |
| Public Storage object URL | PASS; download denied |
| Direct authenticated browser-role database/storage access | PASS; all eleven tables return permission-denied code 42501; image download denied |
| Restart the isolated application process and reuse the session | PASS; preferences and byte-identical private image still readable |
| Sign out and replay the old cookie | PASS; session row deleted and replay returns 401 |

Preflight checks from the same connection session also passed: server-key access to all eleven tables,
anonymous-role permission denial for all eleven tables, private bucket metadata with a 5 MiB image limit,
email/password provider enabled, signup enabled and email confirmation required.

## Cleanup

The synthetic Storage object was explicitly deleted and subsequent admin download confirmed it was absent.
Both temporary Auth users were deleted; queries confirmed their app users, trips and sessions were absent.
Their per-email test quota rows were deleted. The shared global auth quota was left intact to expire normally.
The isolated server was stopped. The user's development server and actual account were left untouched.

## Boundaries and next checks

This establishes local application integration with real Supabase services, including persistence across an
application process restart. It does not establish Vercel deployment, a hosted restart, worker supervision,
provider extraction quality, complete RLS/security-advisor review, multi-instance quota enforcement or a
full browser journey. Hosted sharing/revocation and itinerary concurrency still need deployment acceptance.
SMTP delivery to other users and independent human review remain pending.

No product behavior or contracts changed. The harness stayed in ignored `.local` as a manual live check;
normal automated tests remain offline. Follow the [deployment guide](../../docs/operations/supabase-vercel.md)
for Vercel and the separate worker rollout.

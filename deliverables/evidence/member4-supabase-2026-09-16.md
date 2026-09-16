# Member 4: Supabase platform implementation

Date: 2026-09-16. AI-assisted implementation; independent human review pending.
Scope: BE09/BE10, deployment preparation for BE11, and database enforcement for BE13.
The user chose Supabase and requested prepared Supabase/Vercel setup; they will connect the accounts.

## Implemented

- Supabase repository and private Storage adapters behind the existing interfaces; no file fallback in production.
- SQL migration for eleven application tables, foreign keys/indexes, RLS and server-only grants, plus a private
  image bucket. Browser roles cannot directly query application tables or execute application functions.
- Atomic SQL functions for itinerary saves, trip pointer preservation, share revocation/view timestamps,
  due-job claims and fixed-window quotas. Itinerary versions are immutable through the runtime database role.
- Confirmed email/password sign-in and registration, hashed opaque application sessions, signup/sign-in quotas,
  and development sign-in disabled in production or Supabase mode. Foreign-origin HTTP mutations are rejected.
- Server-mediated upload/download after ownership checks; image MIME types passed to Storage.
- Vercel workspace build settings, CI application and PostgreSQL checks, and Supabase Cron/Vault scheduling script.
- A [connection guide](../../docs/operations/supabase-vercel.md) with environment, migration and hosted checks.

Earlier planner/edit/share work is retained and separately documented in
[planner implementation evidence](member4-implementation-2026-09-16.md).

## Checks actually run

Local Windows environment: Node 24.21.0, Python 3.12, PostgreSQL 16.

| Check | Result | What this establishes |
| --- | --- | --- |
| `npm run check` | PASS; 84 tests across 8 files | Workspace types, contract/service/adapter regressions, generated API docs, planning validation |
| `npm run test:db` | PASS; 8 tests | Migration and SQL behavior on actual PostgreSQL with concurrent connections |
| `npm run build` | PASS | Next.js production compilation and route build |
| `npm run smoke` against local development server `:3106` | PASS; 13 HTTP checks | Synthetic development sign-in/import/confirm/plan/edit/share/revoke flow |
| Production server `:3105`, `/sign-in` | 200; password input present, development banner absent | Production auth form renders without real account credentials |
| Production `POST /api/auth/dev-sign-in` | 403 | Production cannot use development identity |
| `npm run docs:api` | PASS; 31 endpoints, 55 shared types | Generated contract reference updated |

Database tests use disposable `reel_test*` databases and minimal Supabase Auth/Storage schema doubles. They cover
browser-role denial, private bucket configuration, persistence across connections, Auth deletion cascades,
concurrent version saves and stale details, transaction rollback, immutable version permissions, revocation races,
quota concurrency/reset, due/abandoned job claims, and asset owner/trip constraints. The first run exposed a test
fixture UUID/text parameter cast mismatch; the fixture was corrected and all eight tests passed on a fresh database.

Supabase adapter tests use the real JavaScript SDK with mocked HTTP transport for scoped pagination, atomic RPC
mapping, masked provider errors, private storage headers and MIME handling. Authentication tests mock the provider;
they check confirmed sign-in, wrong/unconfirmed rejection, no signup app session, quotas and disabled dev bypass.
Service tests check that another account cannot download a synthetic private screenshot.

## Remaining verification and limitations

- No Supabase or Vercel account connected, secrets installed, branch pushed or app deployed in this session.
- Real email delivery/confirmation, PostgREST integration, hosted Storage, multi-instance HTTP quotas and
  Cron/pg_net delivery require the connection guide's hosted acceptance checks.
- CI configuration is prepared; no remote workflow run is claimed.
- The smoke run used the development adapter and fictional AI/place fixtures; it does not establish live provider quality.
- Independent application sessions do not automatically expire when a Supabase password changes. Password-reset,
  MFA and account-management UI, object-retention cleanup and hosting-level abuse controls remain follow-up work.
- Analytics remains console-only. No real provider cost, hosted latency, availability or security audit is claimed.
- Other members' tasks were not completed or marked done. The minimal auth form change supports the requested backend identity flow.

# F0 Foundation: identity, persistence, access

**Scope acceptance:** sign-in restores that user's trips and preferences; cross-account access is rejected.
**Owners:** server Member 4 (BE09, BE10) · UI Member 1 (FE05) · reviewer Member 3
**Screens:** `/sign-in`, site header · code in `apps/web/src/features/auth`, `apps/web/src/server/auth`, `apps/web/src/server/db`

## Behaviour

- Signing in creates a session cookie (`reel_session`, httpOnly, SameSite=Lax). Only a hash of the token is stored.
- Every `user` endpoint loads the user from the cookie before the handler runs. No session → `401 UNAUTHENTICATED`.
- Every trip-scoped service calls `getOwnedTrip(user, tripId)` first. Another account's trip returns `404 NOT_FOUND`,
  never `403`, so ids can't be probed. Child rows (saves, places, bookings, shares) must also belong to that trip.
- Signed-in pages (`/home`, `/my-trip/...`, `/inspiration-library`, `/discover`) redirect signed-out visitors to `/sign-in?next=...`.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Sign in | `auth.signIn` | Supabase email/password verification, then a hashed application session. |
| Register | `auth.signUp` | Requests email confirmation; does not issue an app session. |
| Local demo sign-in | `auth.devSignIn` | File mode outside production only. Supabase always disables it. |
| Sign out | `auth.signOut` | Always succeeds. |
| Who am I | `auth.me` | `401` means signed out. |

## What the base does, and what to replace

| Piece | Now | Replace with (BE10) | Where |
| --- | --- | --- | --- |
| Identity | Supabase email/password plus opaque app sessions; local demo mode retained | Connect email provider and verify live flow | `server/services/auth.ts`, `server/auth/session.ts`, `features/auth` |
| Persistence | Supabase adapter and SQL migration; file mode only for development | Apply migration and connect project | `server/db/supabase.ts`, `server/db/index.ts` |
| Uploads | Supabase private bucket, owner-checked server downloads | Verify live upload/download and isolation | `server/db/supabase.ts` |

Keep the function signatures (`requireUser`, `currentUser`, `repos()`, `assetStorage()`): all features call them.
The file store has no transactions and assumes one process; don't deploy it for the pilot.

Repository rules a real database must keep:

- `itineraries.saveVersion` atomically compares `expectedVersion`, inserts a unique `(tripId, version)` and advances
  the trip pointer. Conflicts return `STALE_VERSION` with `details.currentVersion`; other trip fields are preserved.
- `trips.update` preserves the latest itinerary pointer even if the supplied trip snapshot is older.
- `shares.revoke` and `shares.markViewed` update only their own fields; a viewer must never clear `revokedAt`.
- `rateLimits.consume` atomically enforces fixed windows and expires old keys. A deployed adapter must share limits
  across instances. The Supabase RPC uses the database clock and row locks; file mode remains single-process only.
- `jobs.claim` is atomic: `UPDATE ... WHERE status = 'queued' AND run_after <= now ... RETURNING`.
- Queries that list rows are scoped by `ownerId` or `tripId`.

## Acceptance checks

- [ ] Sign in as `alice@example.test`, create a trip, reload: the trip is still there.
- [ ] Sign in as `bob@example.test`: Alice's trip is not listed; opening its URL shows "Trip not found".
- [ ] Bob calling any Alice trip endpoint gets `404` (covered in [core-flow.test.ts](../../tests/integration/core-flow.test.ts) "identity" and `npm run smoke`).
- [ ] Signed-out `GET /api/trips` returns `401` with the error envelope.
- [ ] After the real auth swap, the same tests pass without changing feature code.

## Open decisions

- DEC-04: Supabase selected; Vercel setup prepared. User will connect accounts.
  Follow [setup](../operations/supabase-vercel.md) and record actual live acceptance results.
- Auth requests have database-backed account/global quotas. Mutating HTTP requests reject foreign Origin headers.
- The custom app session lasts 30 days; Supabase password changes do not automatically revoke it. Account-management
  and password-recovery UX remain outside this implementation slice.

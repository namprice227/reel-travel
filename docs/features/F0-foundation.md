# F0 Foundation: identity, persistence, access

**Scope acceptance:** sign-in restores that user's trips and preferences; cross-account access is rejected.
**Owners:** server Member 4 (D01, D02) · UI Member 1 · reviewer Member 1
**Screens:** `/sign-in`, site header · code in `apps/web/src/features/auth`, `apps/web/src/server/auth`, `apps/web/src/server/db`

## Behaviour

- Signing in creates a session cookie (`reel_session`, httpOnly, SameSite=Lax). Only a hash of the token is stored.
- Every `user` endpoint loads the user from the cookie before the handler runs. No session → `401 UNAUTHENTICATED`.
- Every trip-scoped service calls `getOwnedTrip(user, tripId)` first. Another account's trip returns `404 NOT_FOUND`,
  never `403`, so ids can't be probed. Child rows (saves, places, bookings, shares) must also belong to that trip.
- Pages under `/trips` redirect signed-out visitors to `/sign-in?next=...`.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Sign in | `auth.devSignIn` | Email only. Creates the user on first use. Disabled in production unless `ENABLE_DEV_SIGN_IN=true`. |
| Sign out | `auth.signOut` | Always succeeds. |
| Who am I | `auth.me` | `401` means signed out. |

## What the base does, and what to replace

| Piece | Now | Replace with (D02) | Where |
| --- | --- | --- | --- |
| Identity | Email-only dev sign-in | Real auth provider chosen in DEC-04 | `server/services/auth.ts`, `server/auth/session.ts`, `features/auth` |
| Persistence | One JSON file in `.local/dev-data/db.json` | A database implementing `Repositories` | `server/db/types.ts` (interface), `server/db/index.ts` (swap point) |
| Uploads | Files in `.local/dev-data/uploads` | Private object storage implementing `PrivateAssetStorage` | same |

Keep the function signatures (`requireUser`, `currentUser`, `repos()`, `assetStorage()`): all features call them.
The file store has no transactions and assumes one process; don't deploy it for the pilot.

Repository rules a real database must keep:

- `itineraries.insert` rejects a duplicate `(tripId, version)` with `STALE_VERSION` (unique constraint).
- `jobs.claim` is atomic: `UPDATE ... WHERE status = 'queued' AND run_after <= now ... RETURNING`.
- Queries that list rows are scoped by `ownerId` or `tripId`.

## Acceptance checks

- [ ] Sign in as `alice@example.test`, create a trip, reload: the trip is still there.
- [ ] Sign in as `bob@example.test`: Alice's trip is not listed; opening its URL shows "Trip not found".
- [ ] Bob calling any Alice trip endpoint gets `404` (covered in [core-flow.test.ts](../../tests/integration/core-flow.test.ts) "identity" and `npm run smoke`).
- [ ] Signed-out `GET /api/trips` returns `401` with the error envelope.
- [ ] After the real auth swap, the same tests pass without changing feature code.

## Open decisions

- DEC-04: auth provider, database and hosting. Record the choice in [decisions.md](../../planning/decisions.md).

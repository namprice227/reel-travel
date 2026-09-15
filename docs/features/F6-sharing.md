# F6 Sharing: revocable read-only links

**Story US-07 acceptance:** the owner creates and revokes viewing access; viewers can't edit or retrieve private uploads.
**Owners:** server Member 4 (BE13) · UI Member 2 (FE11) · reviewer Member 3
**Screens:** `/trips/:tripId/share` (owner), `/s/:token` (viewer, no sign-in) · code in `apps/web/src/features/sharing`

## User flow

1. The owner presses **Create viewing link**. The full URL is shown **once** with Copy and Open.
2. The list shows each link as Active or Revoked, with created and last viewed times.
3. **Revoke** takes effect on the next request.
4. A viewer opens `/s/:token` and sees magazine, timeline and map, read-only. A revoked link shows "This link was revoked".

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| List links | `shares.list` | Never returns tokens. |
| Create link | `shares.create` | `201 { share, token, url }`. Only time the token exists outside the viewer's URL. |
| Revoke | `shares.revoke` | Idempotent. |
| Viewer page | `shared.get` | Public. `404` unknown token, `410 SHARE_REVOKED`. |

## Server rules

- Store only `sha256(token)`. Tokens are 32 random bytes, base64url.
- `shared.get` returns `SharedTripView`, a projection built in [shares.ts](../../apps/web/src/server/services/shares.ts):
  trip title, destination, dates, timezone, the current itinerary without `sourceInspirationIds`, and names/locations
  of scheduled confirmed places. No saves, evidence, uploads, bookings notes or ids that unlock owner endpoints.
- Viewers can't call any `user` endpoint; `uploads.get` requires the owner's session.
- The viewer page is `noindex`.
- Analytics: `share_created`, `share_revoked`.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Links | Working create/list/revoke/view | Same, on the real database | Member 4 |
| Abuse limits | None (`RATE_LIMITED` reserved) | Rate limit `shared.get` and link creation (BE13) | Member 4 |
| Expiry | None | Optional expiry if the team decides it's needed | Member 4 |
| Share UI | Plain list | Designed share sheet | Member 2 (FE11) |

## Fixtures

`shareFixtures.active`, `.revoked`, `sharedViewFixture`, `errorFixtures.shareRevoked`.

## Acceptance checks

- [ ] Create a link, open it in a private window: read-only views, no edit controls, no saves.
- [ ] Revoke, reload the private window: "This link was revoked" (integration test "itinerary", `npm run smoke`).
- [ ] The viewer can't load the owner's screenshot URL.
- [ ] Another account can't revoke the owner's link (`404`).
- [ ] `JSON` from `shared.get` contains no `sourceInspirationIds`, evidence or upload ids.

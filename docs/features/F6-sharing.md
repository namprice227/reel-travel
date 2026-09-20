# F6 Sharing: revocable read-only links

**Story US-07 acceptance:** the owner creates and revokes viewing access; viewers can't edit or retrieve private uploads.
**Owners:** server Member 4 (BE13) · UI Member 2 (FE11) · reviewer Member 3
**Screens:** `/my-trip/:tripId/share` (owner), `/s/:token` (viewer, no sign-in) · code in `apps/web/src/features/sharing`

## User flow

1. The owner presses **Create viewing link**. The full URL is shown **once** with Copy and Open.
2. The list shows each link as Active or Revoked, with created and last viewed times.
3. **Revoke** takes effect on the next request.
4. A viewer opens `/s/:token` and sees magazine, timeline and map, read-only. A revoked link shows "This link was revoked".
5. If planning inputs or validation rules changed, the viewer sees "Itinerary needs updating". The owner must
   regenerate; the same viewing link then shows the current plan again.

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
- Public staleness uses the same fingerprint as the owner endpoint. An outdated plan returns `stale: true`,
  `itinerary: null`, `places: []`; no old stops are mixed with current trip metadata. An ungenerated trip has
  `stale: false` and `itinerary: null`. The owner's share preview explains when viewers cannot see a stale plan.
- Viewers can't call any `user` endpoint; `uploads.get` requires the owner's session.
- The viewer page is `noindex`.
- Successful JSON and error responses are `Cache-Control: no-store` so HTTP caches do not retain active views.
- A view updates `lastViewedAt` atomically and rechecks revocation; it cannot overwrite an owner's revocation.
- The service applies the public schema allowlist even for direct server callers.
- Fixed-window limits: 10 creations per owner across trips per 10 minutes; 120 reads per valid link per minute,
  shared by all viewers. Exceeding either returns `429 RATE_LIMITED`, `details.retryAfterSeconds` and `Retry-After`.
  Revoked links return `410` even when their read quota was exhausted. Unknown tokens do not allocate quota records.
- Analytics: `share_created`, `share_revoked`.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Links | Create/list/revoke/view with Supabase atomic functions | Verify against connected accounts | Member 4 |
| Abuse limits | Atomic `Repositories.rateLimits.consume` on Supabase; concurrent SQL tests pass | Hosted verification and hosting-level invalid-token/IP protection | Member 4 |
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
- [ ] A view racing with revocation cannot reactivate the link.
- [ ] Creation and read quotas reject excess calls and recover at the window boundary.

Local regression coverage is in [planner-safety.test.ts](../../tests/integration/planner-safety.test.ts) and
[http-safety.test.ts](../../tests/integration/http-safety.test.ts). The development file adapter is not distributed
enforcement. The Supabase adapter implements shared database enforcement; actual PostgreSQL concurrency checks are
recorded in [platform evidence](../../deliverables/evidence/member4-supabase-2026-09-16.md). Per-link quotas also mean
a busy link shares capacity among viewers; hosting-level abuse protection
and frontend rate-limit UX remain unverified.

20 September 2026 UI refresh: Shared cover images and illustrated fallbacks now use a bounded responsive frame (maximum 280 px) so the magazine controls remain visible. [Changes and actual checks](../../deliverables/evidence/navigation-refresh-2026-09-20.md).

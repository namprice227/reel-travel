# F8 saved places — Phase 1 evidence

Date: 21 September 2026  
Status: implemented locally; human review and hosted Supabase verification pending.

## Shipped behavior

- `GET /api/places` returns only the signed-in traveller's confirmed places across all of their trips.
- `GET /api/inspirations/:inspirationId` opens original evidence by owner, even when a copied place is viewed from another trip.
- `POST /api/trips/:tripId/places/copy` copies confirmed selections and evidence into the target trip and merges repeated provider place IDs.
- Builder step 1 leads with matching saved places when available, supports select-all and bulk add, and keeps new capture collapsed below.
- A new account or a trip with no matching saved places retains the existing add-first screen.
- Place evidence links now deep-link to the original save drawer with `?save=<inspirationId>`.

No place is invented: every copied candidate retains at least one original `Evidence` record and its `inspirationId`.
Copies retain the traveller's existing `selected.providerPlaceId`; this feature does not auto-confirm extracted candidates.

## Design decisions

- Phase 1 copies place documents rather than changing storage ownership. Nullable `tripId`, `Trip.placeIds`, migration and account-level shelf creation remain Phase 2.
- Evidence stays at its original save. A new owner-scoped read makes it openable without copying uploads or source records.
- Country filtering prefers source-supported AI country evidence. Legacy records without classification fall back to their originating trip destination. Conflicting or unknown countries are not guessed.
- Repeated copies merge by provider place ID, matching existing confirmation deduplication. The test proves sequential idempotency; no cross-request database uniqueness claim is made without the deferred storage migration.

## Acceptance checks run

`npm run check` passed:

- TypeScript passed across all workspaces.
- 32 test files and 400 tests passed.
- Generated API documentation is current: 37 endpoints and 63 shared types.
- Planning metadata and local links passed validation.

Focused service acceptance, `npm test -- --run tests/integration/saved-places.test.ts`: 4 tests passed.
It covers owner isolation, places from more than one trip, original evidence retrieval, selected provider preservation,
multi-place copying, repeated-copy merging, and rejection of another account's or unconfirmed place.

Offline Chromium acceptance used installed Microsoft Edge:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node --import tsx tests/e2e/saved-places.mjs
```

Five browser groups passed using synthetic responses and real React/CSS:

- Empty account keeps the add-first screen.
- Four Japan places lead the picker; a South Korea place is excluded; new capture is collapsed.
- Adding four places shows four confirmed rows immediately after the request completes.
- No horizontal overflow at 1280, 768 or 390 pixels.
- No browser runtime errors.

Screenshots and the machine-readable result are in `.local/saved-places-browser/`; `.local` remains uncommitted test output.

## Files changed

- Contracts and API reference: `packages/contracts/src/place.ts`, `packages/contracts/src/api.ts`, `docs/api/endpoints.md`
- Server: place/inspiration services and handlers
- UI: trip builder, itinerary styles, place evidence link, inspiration-library deep link
- Tests: `tests/integration/saved-places.test.ts`, `tests/e2e/saved-places.mjs`
- Planning/evidence: this record, F8 status, decision log, task notes, M17 and contribution log

## Assumptions and intentionally deferred work

- All automated place and trip data was synthetic; no provider calls were made.
- Live Supabase persistence, hosted authentication and human usability were not retested.
- Phase 2 shelf storage, nullable provenance, trip membership, migration, Saved screen, deletion semantics and sharing changes remain deferred until Phase 1 is merged.
- Account-level confirmation is assumed, as approved for Phase 1 copying; the Phase 2 model decision remains expensive to reverse and should be reconfirmed before P2-A.

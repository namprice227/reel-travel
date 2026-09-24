# Tick places, then build the route — 23 September 2026

## Product decision

The traveler selects place ideas with checkboxes in the trip builder or Places view. The cards show the available provider photo or illustration, name, category, area or address, and a short source excerpt. A location lookup can be requested for an unresolved idea. No branch confirmation is needed before planning.

The selected IDs are stored on the trip. During generation, the server chooses among provider-returned matches using source name and area, trip destination, opening windows, and proximity to other selected places and stays. The itinerary model schedules those locations, and planner validation checks dates, bookings, hours, and timing. This ranking is a heuristic; it does not measure or guarantee the shortest route. A provider match chosen for a route is recorded on that itinerary version and does not become a traveler-confirmed place.

Unknown locations stay in the selection and are reported as unresolved. Duplicate references to one provider venue are scheduled once. A changed selection makes the previous itinerary stale. Sharing exposes only resolved, scheduled places and withholds a stale plan.

Older trips without an explicit selection retain their confirmed-place behavior. The existing confirmation API remains for stored records and older clients; the current traveler path uses `places.select`.

## Implementation

- Contracts: `packages/contracts/src/api.ts`, `place.ts`, `trip.ts`, `itinerary.ts`; generated `docs/api/endpoints.md`.
- Selection and routing: `apps/web/src/server/services/places.ts`, `route-matches.ts`, `itinerary.ts`, `trips.ts`, and `shares.ts`; planner context and fingerprint in `packages/planner/src/`.
- Traveler screens: `apps/web/src/features/trips/ChoosePlacesStep.tsx`, `TripBuilder.tsx`, `CreateTripPage.tsx`, and the Places, Itinerary, Day, Map, Share, and Setup views. The saved-place shelf also accepts unresolved ideas while retaining evidence.
- Current design and acceptance contract: `docs/features/F2-places.md`.

## Verification

Synthetic integration coverage in `tests/integration/trip-selection.test.ts` checks ambiguous and unresolved selection, source-supported branch ranking, duplicate venues, preserved place status, shared-view filtering, stale selection, and foreign-ID rejection. `tests/integration/saved-places.test.ts` checks unresolved cross-trip copying and idempotency; `tests/integration/ga4.test.ts` checks that selection analytics sends a count without private IDs. Offline Chromium coverage in `tests/e2e/saved-places.mjs` checks four cards, keyboard checkbox selection, sidebar count while ticking, one saved selection update, and 390 px containment; `tests/e2e/my-trip-ux.mjs` checks the unresolved card and the wider My Trip flow. The selection screenshots are `.local/saved-places-browser/choose-desktop.png` and `choose-mobile.png` (local ignored files). These tests use fictional places and intercepted provider responses.

Commands and results: `npm run docs:api` generated 40 endpoints and 67 types; `npm run check` passed TypeScript, 609 tests in 55 files, the generated API reference check, and planning/link validation; `npm run build` compiled and rendered the Next.js routes; `npm run test:e2e:offline` passed six saved-place groups and 21 My Trip groups with no runtime errors or unexpected requests. The isolated tests use local Microsoft Edge via Playwright with synthetic API responses. No live provider traffic occurred.

## Limits and review

No live Google lookup, hosted Supabase flow, real traveler observation, or route-time comparison was measured for this change. Provider options may be sparse or wrong; the route can be edited or regenerated, but the current selection screen does not offer a manual branch override. Human review of card clarity, route quality, and unresolved-place language remains pending.

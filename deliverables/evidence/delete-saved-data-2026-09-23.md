# Delete saved places and trips — 23 September 2026

## User behavior

- Place details has **Delete place**. A confirmation explains that the source save and copies in other trips remain. Deleting removes this trip's candidate, selection and must-visit references; a linked booking keeps its time without a place link. Its browser-local place note is removed, and affected itineraries become stale.
- Trip details and All trips have **Delete trip**. A confirmation names the records removed. The database deletes the owned trip and its saves, places, bookings, itinerary versions, shares, jobs and upload metadata; private upload bytes are removed afterward. A surviving copy in another trip remains reusable. Its original source-save link reports that the source is unavailable.
- Both endpoints check trip ownership. Another account sees `NOT_FOUND`.

## Checks actually run

- `npx vitest run tests/integration/delete-saved-data.test.ts`: three passing tests for ownership, linked booking and selection cleanup, source review status, cascade, private upload bytes, share invalidation and surviving copies.
- `tests/integration/supabase-adapter.test.ts`: mocked Supabase HTTP adapter verifies trip deletion and upload metadata read. This is an adapter check, not a hosted database run.
- `npm run check`: typecheck, 620 tests, generated API check and planning validation passed.
- `npm run test:e2e:offline`: local Edge with real React/CSS and synthetic API responses; cancel, server failure, confirmed place deletion, confirmed trip deletion and 390px layout passed with no browser runtime errors. Temporary mobile screenshots were captured outside the repository as `reel-delete-place-mobile.png` and `reel-delete-trip-mobile.png` in the system temp directory.

## Limits and review

The browser suite intercepts API responses. Hosted Supabase, live worker activity and private storage cleanup were not exercised here. Place deletion updates related records through several repository calls, so a transient data-service failure may leave the place available for a retry. If storage cleanup fails after trip deletion, metadata and access are gone but orphaned upload bytes need reconciliation. Human usability review is pending.

# Saved-reel place library

The Inspiration Library now uses `GET /api/account/library` to combine account place ideas with source-linked candidates in trips created from saved reels. `GET /api/account/reels` remains unchanged for existing consumers. The new endpoint is owner-scoped and read-only, requires no migration or worker restart, and reads existing records.

Only candidates with evidence tied to the original reel URL are included from a linked trip. Rejected candidates and unrelated later trip additions are excluded. Country classification uses explicit source evidence first, then the linked trip destination through the existing curated country lookup; unrecognised countries remain Unknown. The same stored place ID is included once; separate source records are not fuzzy-merged by name. Confirmed trip places retain that label and use the existing trip-authorized photo endpoint.

## Validation

- `npm run check`: PASS, 825 tests across 76 files; type checks, API documentation and workspace checks passed.
- New API-client/router/service integration test covers ordinary reel places, Japan/Thailand/Unknown grouping, draft-trip source places, exclusion of unrelated trip candidates, and cross-account isolation.
- Updated country model test confirms trip-linked source places are no longer hidden.
- `tests/e2e/account-library.mjs`: PASS using synthetic intercepted responses against a local file-backed app. Two known country albums, an unknown-country collection, six source places including a trip-linked place, search, detail dialog, photo display, and 390px layout without overflow.
- Browser screenshots: `.local/account-library-browser/` (local artifacts only).

No authenticated production session or live Supabase database was exercised. No deployment performed.

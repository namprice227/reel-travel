# Google Places active again ? 20 September 2026

## Behavior

User requested switching from OpenStreetMap after fixing Google API access. Real OpenAI imports now
select Google when PLACES_PROVIDER is absent or blank. Explicit google/openstreetmap/none settings
remain supported and the offline fake/fake demo remains unchanged. Local configuration selects Google;
the manual runner defaults to Google and the optional Render template includes the server-only key.
No hosted worker was created and no deployment is performed by this change.

The existing adapter uses Places API (New) Text Search, validates responses and preserves provider facts,
unknown fields and attribution. Both automatic imports and Verify location use it. Confirmation remains
required. Ten distinct clues maximum preserves the prior resource bound; repeated clues share lookup
and each search remains limited to three pages with per-request timeout. Provider failure is not no-match.

## Acceptance

- Live adapter lookup: Tokyo Tower / Minato / Tokyo, Japan returned one match. Coordinates, Google provider
  identity and Google Maps attribution checked; no provider response or credentials committed; no trip saved.
- Targeted offline checks: 65 tests passed across real import, provider adapter and place verification suites.
  Added coverage for default Google selection through import/confirmation/planning, existing-place
  verification with only one location request and no repeated AI calls, and oversized Google imports.
- npm run check: PASS; 346 tests across 27 files, all workspace typechecks, API reference and planning validation.
- npm run build: PASS (Next.js production build under Node 24).
- Local worker restarted with PLACES_PROVIDER=google; startup passed with empty stderr.

## Limits

Live end-to-end transcription, browser acceptance and production deployment were not repeated here.
Existing OpenStreetMap records are preserved; no automatic reprocessing or database migration.
Google map rendering, content retention/refresh and transactional merging remain separate work.
LLM itinerary generation and the broader architecture audit gaps are unchanged.

Reference: [Google Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search).

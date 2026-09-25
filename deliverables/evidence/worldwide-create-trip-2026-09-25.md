# Worldwide manual trip creation — 25 September 2026

The user approved the revised `.local/routelet-ui-preview/worldwide-trip-draft.html` after asking to keep the existing three-step form and seven country cards, add only a country-search dropdown, and avoid a cover explanation in the UI. They approved the neutral cover fallback for countries without dedicated artwork.

## Implemented

- `/my-trip/new` searches the existing country-code list by country name, code, accent-insensitive spelling and a small typo. The seven original cards and the city/date steps remain.
- The existing **Other** city field accepts a city for any selected country. A server-only Google Places (New) city lookup restricts results to the selected country, rejects missing or ambiguous exact city names, checks the Place Details country component, then gets an IANA timezone from Google Time Zone API. The trip is created only after that check succeeds. Curated city cards continue using their stored timezone.
- The typed-city endpoint has per-user minute and day limits. The Google key stays on the server.
- New-country trip cards use the existing neutral travel cover if no private upload exists. Home and Library already used that neutral fallback. Existing seven-country trip cards retain their current treatment.

## Acceptance run

- `npm run typecheck`: pass after regenerating stale Next route types with `npx next typegen`.
- `npx vitest run tests/integration/worldwide-trip.test.ts`: focused tests pass for country search, destination cover detection, exact city plus timezone, cross-country rejection and ambiguity rejection. Provider replies are synthetic.
- `npx tsx tests/e2e/create-trip.mjs` with the locally installed Edge executable: 10 browser groups pass, including Canada → Toronto → `America/Toronto`, keyboard selection, existing seven-country flow, 1210×620 and 1536×760 fit, 390 px overflow, and no browser errors. API responses are synthetic; screenshots and result JSON are in ignored `.local/create-trip-browser/`.
- `npm run docs:api`: generated 55 endpoints. Final `npm run check` passed with 838 tests, current API docs and workspace validation. An earlier run's validation failed while this evidence file did not yet exist.

## Limits

- Live Google Places and Time Zone responses were not tested. The deployed server key must have both Places API (New) and Time Zone API enabled. Without them, typed-city creation shows an error instead of guessing a timezone.
- The country list includes ISO-style territories as well as sovereign states; some may have no city returned by Google.
- This change applies to manual creation. Automatic itinerary-reel draft trips still use the earlier seven-country gate. A later user-approved follow-up added a small GeoNames city dropdown inside the existing Other box; see [country-filtered city catalogue](city-catalog-2026-09-25.md).
- Human review of the implemented form and hosted verification remain pending.

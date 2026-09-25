# Country-filtered city catalogue — 25 September 2026

The user approved a small dropdown inside the existing **Other** city box. The seven country cards, curated city cards and three-step trip flow remain. Home maps and trip-cover behavior were inspected separately without changing code.

## Source and transform

- Source: [GeoNames `cities500.zip` and `admin1CodesASCII.txt`](https://download.geonames.org/export/dump/), snapshot dated 2026-09-25. GeoNames' readme describes the file as populated places above 500 residents plus administrative seats down to PPLA4, and says its published counts are approximate. This downloaded snapshot contains **235,878** rows in **246** country codes. It is not a complete list of every settlement.
- Source SHA-256: `cities500.zip` `8D07609DA318268DF79D96C163FF1B6A81F14318C0CB77C3E5799119463ED713`; `admin1CodesASCII.txt` `1DA92A6323A5FEC3176F3F743BF4CF4040FD56A876DA55E46FBCA23C863AA60A`.
- `scripts/build-city-catalog.py` writes a deterministic compressed server snapshot, grouped by the source's two-letter country code. Generated SHA-256: `B085900455672F79F3FC0AFA9DF752E3CC12B190F8C68166723FE6E6ACB9EC60`. Kosovo (`XK`) was added to the app's country codes to cover the source record; the other 245 source codes were already supported. Antarctica (`AQ`), Bouvet Island (`BV`), Heard Island and McDonald Islands (`HM`) and the US Minor Outlying Islands (`UM`) have no `cities500` rows. These countries remain searchable, and a traveler can try a typed city through Google validation.
- GeoNames data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The dropdown links to GeoNames and the license and says the data is adapted. Refresh instructions and attribution are in `data/geonames/README.md`.

## Behavior

- An authenticated, rate-limited API searches the selected country only, ranking exact city names, prefixes, word prefixes and source alternate names. Suggestions display the first-level region where available to distinguish duplicate names. The existing field accepts a typed city when no suggestion is suitable.
- A chosen GeoNames ID is checked server-side against its country and name. Google Places Autocomplete (New) then searches for that city with a location bias around the GeoNames point. A Google name must match the source name or one of its alternate names, followed by Place Details country and distance checks and a Google Time Zone result. If Google cannot verify it, trip creation shows an error. No GeoNames coordinates, city IDs or Google predictions are saved on the trip; `Trip.destination` remains a free-text string.
- The existing seven quick city cards keep their stored timezones. Automatic itinerary-reel draft creation still has the separate seven-country gate.

## AI extraction audit

- Reel AI proposes `destination_city` and `destination_country`, but `resolveReelFormat` accepts them only when their literal spelling appears in source text. Other extraction paths also require quoted source evidence for a country code. The new GeoNames catalogue is **not** consulted by AI extraction.
- Account Library places store an evidence-backed country code only when an explicit country name is recognized, or when a source-named city matches one of the seven curated destination lists. Any other city-only extraction remains Unknown country. The place name and city/area clues are free text; there is no city table or canonical city ID in Supabase. Google place options are candidates, not user-confirmed branches.
- The city catalogue currently supports manual trip selection only. Inferring a country from an arbitrary city name would be unsafe for duplicate names such as Springfield; a future AI mapping step needs ambiguity handling and source evidence before saving a country or city identity.

## Checks actually run

- `npx vitest run tests/integration/worldwide-trip.test.ts`: passed with synthetic Google replies, real GeoNames snapshot search, country filtering, alternate name, region disambiguation, selected-city coordinate verification and cross-country rejection.
- `node --import tsx tests/e2e/create-trip.mjs` with local Edge: 12 browser groups passed, including Canada → Toronto, Ontario, US duplicate-city keyboard selection, original seven city cards, typo hint, compact laptop fit, 390 px width, a mobile dropdown that clears the Continue button, and no runtime errors. HTTP replies are mocked; screenshots and result JSON are ignored under `.local/create-trip-browser/`.
- `npm run build`: passed. The generated `/api/[...path]` server trace includes the compressed city snapshot.
- Final `npm run check`: passed with 843 tests, current API docs and workspace validation. An earlier check found stale generated API docs after the Kosovo code was added; `npm run docs:api` regenerated them before the final pass.

Live Google Places/Time Zone, hosted deployment and human visual review remain unverified. The 75 km point comparison is a safety bound for a selected city, not an official boundary or identity guarantee.

## Files changed for this follow-up

- Catalogue and reproducibility: `apps/web/src/server/data/geonames-cities500.json.gz`, `apps/web/src/server/services/city-catalog.ts`, `scripts/build-city-catalog.py`, `data/geonames/README.md`.
- Contract and application: `packages/contracts/src/api.ts`, `packages/contracts/src/countries.ts`, `apps/web/src/server/services/destinations.ts`, `apps/web/src/server/handlers/trips.ts`, `apps/web/src/features/trips/CreateTripPage.tsx`, `apps/web/src/app/styles/trips.css`.
- Checks and records: `tests/integration/worldwide-trip.test.ts`, `tests/e2e/create-trip.mjs`, `docs/api/endpoints.md`, `docs/features/F3-trip-setup.md`, `deliverables/evidence/worldwide-create-trip-2026-09-25.md`, `deliverables/milestones/M04.md`, `planning/decisions.md`, `planning/tasks.csv`, `planning/contributions.csv`, this file.

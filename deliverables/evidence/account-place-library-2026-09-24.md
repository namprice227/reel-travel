# Account place Inspiration Library — 24 September 2026

## User direction

The Inspiration Library should show places extracted from account reels saved on Home. It should not show reel
cards or trip-specific saves. The user approved a country-first, image-led preview: country album, then place cards,
with the original reel retained as source evidence.

## Implemented

- `/inspiration-library` reads the owner-scoped `accountReels.list` response and renders one card per extracted
  account place. Reels with no extracted place do not render.
- Country albums use `AccountPlace.country`, an ISO code plus literal source evidence. Extraction stores it only
  when the source explicitly supports the country. Missing evidence stays visible in **Unknown country**.
- Draft itinerary reels remain trips and are excluded. “Keep as ideas instead” converts them to account places.
- Place cards lazily load a fresh photo for their first-ranked stored Google candidate through an owner-scoped
  endpoint. Google Maps and photographer attribution remain visible. Ambiguous results say **Possible match**;
  unavailable photos retain the labelled illustrative fallback. Expiring photo URLs are not persisted.
- Account reel extraction now searches each country-backed place through the configured Places provider. The
  candidates retain provider addresses and coordinates with `pending`, `ambiguous`, `not_found` or `unverified`
  mapping status; no branch is silently confirmed.
- Place details show the provider candidate on an embedded Google map, including its address and alternative
  branches where lookup is ambiguous, alongside the source clue, country evidence and original reel URL.
- Country albums automatically call the owner-scoped `accountReels.mapPlaces` repair for older reel places that
  have country evidence but were stored before lookup was connected. Countryless ideas remain unmapped.
- The trip builder's **Saved ideas** list includes account-reel places whose source-supported country matches the
  trip. Continuing copies the place into the trip with its unconfirmed Google candidates and a trip-owned source
  record containing the original reel URL. Repeated additions return the same trip candidate; another account
  cannot copy it.

## Verification

- `npm run typecheck` — PASS.
- `npx vitest run tests/integration/account-reels.test.ts tests/integration/account-library-model.test.ts tests/integration/itinerary-draft-trips.test.ts packages/contracts/src/contracts.test.ts` — PASS, 56 tests.
- `npm run docs:api` — PASS; generated 49 endpoints and 74 shared types.
- `npm run check` — PASS: type checks, 64 files / 661 tests, generated API reference check and planning validation.
- `node tests/e2e/account-library.mjs` — browser check prepared, but the attempted run could not use dev sign-in
  because port 3000 was running with Supabase auth. Starting a second isolated Next dev server was blocked by the
  existing `.next` development lock. The existing process was left untouched.

- `npx vitest run packages/contracts/src/contracts.test.ts tests/integration/saved-places.test.ts tests/integration/account-reels.test.ts tests/integration/account-library-model.test.ts` passed 54 tests including account ownership, preserved provider options, source evidence and repeat-copy behavior.
- `node --import tsx tests/e2e/saved-places.mjs` with installed Microsoft Edge passed 7 browser checks. The account-reel place appears with same-country saved trip places, is copied and selected, and the picker has no horizontal overflow at 1280, 768 or 390 pixels.
- `npm run check` passed after the picker connection: type checks, 64 files / 663 tests, generated API reference check and planning validation.

## Remaining checks and limits

- Run the prepared browser check against an isolated file-backed development server after the existing Next
  process is stopped; inspect desktop and 390px screenshots in `.local/account-library-browser`.
- Existing account places created before country evidence was stored still parse with `country: null` and appear
  under Unknown country. They are not silently inferred. Older places that do have country evidence are mapped
  through the persisted repair path when their album opens.
- Provider lookup and photo quality remain dependent on live Google results. The trip picker preserves candidates
  for automatic route matching and does not treat the copied place as traveler-confirmed.

## Country cover expansion — 24 September 2026

Four previously generic supported-country albums (Singapore, Taiwan, United Kingdom and France) now use
generated illustrative photos. Other source-backed countries use one neutral cover; countryless ideas keep
the existing unknown-location treatment. The Library album, album hero, place-card photo fallback and Home
trip cover share the selection in `apps/web/src/lib/country-cover.ts`. Existing uploaded covers still win.
See [asset list and generation prompts](../../docs/design/library-country-albums.md#24-september-2026-remaining-supported-countries-and-neutral-fallback).

Verification actually run: `npm run typecheck` PASS; `npm run check` PASS (74 test files, 808 tests,
API docs current, planning validation); existing `tests/e2e/account-library.mjs` PASS against an isolated
file-backed `http://localhost:3100` server; focused regular Playwright run PASS for eight album images
and image requests (seven supported, one other country), Singapore hero, mobile overflow and zero page
errors; direct trip-cover mapping check PASS for seven supported destinations and the neutral fallback.
The Browser plugin was unavailable, so regular Playwright used the installed Edge executable. The first
browser attempt used `127.0.0.1`, which Next blocked for development assets; the passing run used
`localhost`. The synthetic fixture names and generated photos are not real venue evidence. Human visual
acceptance and deployment remain pending.

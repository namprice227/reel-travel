# My Trips overview polish ? 20 September 2026

User request: improve placement, typography and animation within My Trip, taking product objectives and UX into account. Scope for this pass is the `/my-trip` overview; existing creation, archive and trip-detail destinations are retained.

## Implemented

- Stronger Newsreader editorial headings with Figtree controls, warm paper surfaces, quieter borders and a consistent spacing scale. Reuses the existing font setup; adds no dependency.
- Current trip is the primary card, with current-day itinerary/map links, elapsed-day markers, missing-stay action and trip-details access. A current trip without an itinerary offers planning rather than a map.
- Future cards show destination, duration, dates, countdown and an explicit planning/saved-itinerary state. `Itinerary saved` means a version exists, not that all travel constraints or venue facts are verified.
- Keyboard-operable All plans / In planning / With itinerary filters. The current trip remains visible while filtering future plans; past trips remain available through All trips.
- Distinct skeleton loading, first-trip onboarding, past-only and empty-filter states. Failed loading shows an error and retry, not an empty-account claim.
- Brief entrance motion, hover elevation and arrow transitions; reduced-motion disables animation and transitions. Fixed image frames retain crop behavior regardless of image proportions.

## Files and decisions

Runtime: [TripsPage.tsx](../../apps/web/src/features/trips/TripsPage.tsx) and scoped `.trips-page` rules in [trips.css](../../apps/web/src/app/styles/trips.css). Browser acceptance: [trips.mjs](../../tests/e2e/trips.mjs). Supporting records: F3 feature spec, FE05 task, M04 milestone and contribution log.

Assumptions: retain the established blue/cream direction, existing date-grouping semantics and current routes. The day markers describe elapsed trip days, not planning completeness. No API contract, provider, itinerary-validation or authentication behavior changes. Other tabs and broader production integration remain outside this pass.

## Evidence

Synthetic fixtures only; these are isolated React browser captures, not real travel data or a live account:

- [Desktop preview](my-trip-polish-2026-09-20/desktop.png)
- [Mobile preview](my-trip-polish-2026-09-20/mobile.png)
- [16 browser acceptance checks](my-trip-polish-2026-09-20/results.json)

Chromium rendered the real components, CSS, API client and locally cached Figtree/Newsreader fonts. All HTTP requests were intercepted: API responses and image-dimension fixtures were synthetic, external photos were blocked to exercise the SVG fallback, and Next navigation was shimmed. No remote provider calls or user data were used.

Checked at 1440?900, 1280?800, 1280?600, 820?1180, 390?844 and 320?740: no horizontal overflow or horizontally clipped actions; bounded images. Also checked keyboard filtering, day-context links, 120-character titles/destinations, retry recovery, loading/empty states, missing accommodation, current trips without itineraries, and reduced motion. Portrait image frame checks ran at desktop/mobile widths. No browser runtime errors.

Reproduce with separately installed Playwright, following the existing browser-test convention:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx tests/e2e/trips.mjs
npm run check
```

`npm run check`: TypeScript, 229 tests, API-doc freshness and workspace validation passed. `git diff --check` passed. Desktop and mobile previews visually inspected by Codex. Human visual acceptance, live Next navigation/persistence and usability measurements remain pending; this is a UI improvement, not production certification.

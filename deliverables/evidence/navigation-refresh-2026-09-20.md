# Navigation and trip UI refresh - 20 September 2026

User requested a brighter production-oriented UI, better navigation, and fixes for review items 4-8. Implementation is local; deployment and human visual acceptance remain pending.

## Design and behavior

- Replaced the hover-expanding icon rail with a stable desktop header. Destination labels stay visible, the current route uses a cobalt pill, and a coral New trip action links to the existing creation flow. Mobile retains a labeled bottom dock with safe-area padding and now exposes the account menu. Account supports keyboard opening, Escape, focus return and closing when focus leaves.
- Refined trip sections into a segmented navigation surface. The phone trip title occupies its own row instead of being squeezed beside actions. Dates, share and saves remain accessible.
- Added cobalt actions and mint, coral and lilac shortcut cards. The four shortcuts use equal tracks and one, two or four columns; an intermediate three-plus-one arrangement is prevented. Decorative Home footer is hidden on short desktops to keep working controls visible.
- Replaced the persistent amber regeneration warning with an informational mint update card. The API reports only that inputs changed, so the message covers places **or trip details**, rather than claiming new places were definitely added.
- Both existing-schedule regeneration entry points open a native modal explaining that all days are rebuilt and manual schedule edits are replaced, while fixed booking times remain locked. Cancel and Escape do not write; confirmation uses the current expected version. First-time generation remains direct.
- Reorder arrows have visible blue backgrounds, borders and 44 x 44 px targets, including disabled boundary states. Removal retains its distinct warm styling.
- Shared destination artwork is 150-240 px high with a 280 px ceiling. Both loaded images and illustrated fallbacks stay inside the rounded frame; photos use cover cropping.
- Added a temporary Next redirect from `/my-trip/:tripId/details` to `/my-trip/:tripId/setup`, preserving query parameters.

## Files changed

- [Navigation component](../../apps/web/src/components/AppNavigation.tsx), [signed-in layout](../../apps/web/src/app/%28app%29/layout.tsx), and [base styles](../../apps/web/src/app/globals.css).
- [Home styles](../../apps/web/src/app/styles/dashboard.css), [trip styles](../../apps/web/src/app/styles/itinerary.css), and [shared itinerary styles](../../apps/web/src/app/styles/shared-itinerary.css).
- [Itinerary page](../../apps/web/src/features/itinerary/ItineraryPage.tsx) and [Next configuration](../../apps/web/next.config.ts).
- [Home acceptance](../../tests/e2e/home.mjs), [trip acceptance](../../tests/e2e/my-trip-ux.mjs), and [test instructions](../../tests/e2e/README.md).
- Feature notes, task evidence, M14/M16 milestone evidence, contribution log, and this evidence directory.

## Checks actually performed

- `npm run check`: 340 tests in 27 files, workspace TypeScript and generated API-reference freshness passed. The final planning/link check found an unescaped parenthesis in this evidence file; after correcting it, `npm run validate` passed. An earlier full `npm run check` also passed.
- `npm run build`: PASS - optimized Next production build and page generation.
- `node --import tsx tests/e2e/home.mjs`: PASS - 17 grouped browser checks; responsive Home, equal shortcut tracks, all three input modes at 1280 x 600, existing saving/recovery behavior. [Results](navigation-refresh-2026-09-20/home-results.json).
- `node --import tsx tests/e2e/my-trip-ux.mjs`: PASS - 21 grouped browser checks; existing editing, version conflicts, keyboard sheets, source uncertainty and stale-share protections, plus navigation at 320-1440 px, full-width mobile titles, regeneration cancellation/confirmation, 44 px reorder buttons, shared artwork and a synthetic 600 x 1800 image. [Results](navigation-refresh-2026-09-20/results.json).
- Production HTTP check: `/my-trip/synthetic-trip/details?day=2` returned **307**, with `Location: /my-trip/synthetic-trip/setup?day=2`.
- `git diff --check`: PASS.

Browser runs used installed headless Microsoft Edge through Playwright (`PLAYWRIGHT_EXECUTABLE_PATH`), real components/styles, synthetic intercepted API responses and navigation shims. External images/maps were intercepted; cached fonts were used when available. The Home harness was corrected from the old Inter variable to Figtree. Screenshots were inspected by Codex; this is not human acceptance or measured traveler usability.

The optional API smoke attempt against the local production server stopped after the signed-out check: production correctly rejects development sign-in with 403. A dedicated development-server attempt was refused because the user's existing Next process owns the development build directory. That process was left running; the temporary production server was stopped. No complete API smoke pass is claimed for this change.

## Screenshots

- [Home desktop](navigation-refresh-2026-09-20/home-desktop.png) and [Home mobile](navigation-refresh-2026-09-20/home-mobile.png).
- [Trip desktop](navigation-refresh-2026-09-20/navigation-1440.png) and [trip mobile](navigation-refresh-2026-09-20/navigation-390.png).
- [Update card](navigation-refresh-2026-09-20/planning-update.png) and [regeneration review](navigation-refresh-2026-09-20/regeneration-review.png).
- [Shared desktop cover](navigation-refresh-2026-09-20/shared-cover-1440.png) and [shared mobile cover](navigation-refresh-2026-09-20/shared-cover-390.png).

## Assumptions and deferred work

Existing routes and planner behavior remain the source of truth. Discover remains marked Soon. This request authorizes the UI refresh, not publication or a provider change. No API contract, persistence, extraction, scraping, provider integration or scheduling algorithm changed. Hosted auth/data verification, deployment, independent accessibility audit and human visual acceptance remain deferred.

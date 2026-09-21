# My Trips onboarding rollback — 21 September 2026

Status: **reverted at the user's request**. The earlier spotlight tutorial is no longer shipped.

## Requested behavior

My Trips stays focused on managing trips. Any future onboarding should be introduced from Home and teach navigation, not force a multi-stage trip-creation lesson. No Home implementation was requested or made in this rollback.

## Changes

- Removed the My Trips tour provider, spotlight overlays, animated/sample walkthroughs, guide launchers, draft handoff and tutorial-only inspiration route.
- Restored the existing creation, preferences, confirmation, itinerary and Saves navigation. Saves again opens the trip-filtered Inspiration library.
- Removed the getting-started checklist and numbered tutorial from the My Trips overview. The normal empty state retains the earlier reel-first wording and Create trip action.
- Preserved the existing vertical navigation, compact regeneration warning, trip-cover UI and private Supabase image-storage changes. No contracts, database, authentication or environment configuration were changed.
- Removed the two tutorial-specific browser scripts. The existing trip overview suite now asserts that neither tutorial controls nor inert focus locks appear for empty, single-trip or populated accounts.
- Retained the original unused GettingStarted component rather than deleting pre-existing code. It is no longer imported by the overview.
- Kept a recoverable pre-removal source snapshot at the ignored local path `.local/my-trip-onboarding-rollback.json`. It is not a committed artifact.

Primary application files restored: `apps/web/src/app/styles/trips.css`; `apps/web/src/features/trips/{CreateTripPage,GettingStarted,SetupPage,TripHeader,TripsToolbar}.tsx`; `apps/web/src/features/places/PlacesPage.tsx`; and `apps/web/src/features/itinerary/{DayView,ItineraryPage,TripChecklist}.tsx`.

The retained behavior is in [TripsPage](../../apps/web/src/features/trips/TripsPage.tsx), checked by [trip overview acceptance](../../tests/e2e/trips.mjs).

## Checks actually run for the rollback

| Check | Result |
| --- | --- |
| `node node_modules/next/dist/bin/next typegen apps/web` | PASS. Refreshed generated route declarations after removal. The first typecheck attempt had referenced the deleted tutorial routes in the old generated validator. |
| `npm run check` (after type generation) | PASS: all workspace TypeScript checks; 395 tests in 31 files; current API reference; planning and local Markdown-link validation. |
| `node --import tsx tests/e2e/trips.mjs` | PASS: 17 offline browser acceptance groups using headless Edge. Includes empty, single-trip and populated accounts without tutorial controls/focus locks; responsive layouts from 320 to 1440px; preserved cover cropping. |
| `node --import tsx tests/e2e/my-trip-ux.mjs` | BLOCKED before browser execution: the existing esbuild harness cannot bundle GooglePlacePhoto.module.css without an output path. No application or harness changes were made for this unrelated setup failure. |
| Source inspection | No remaining imports of the removed tour modules or links to the removed tutorial inspiration route. Existing Saves links target the trip-filtered Inspiration library. |
| Visual inspection | Agent inspected the synthetic small-phone empty-state screenshot. Human acceptance is pending. |
| Scoped `git diff --check` | PASS for application, trip acceptance, feature, milestone and task files. The pre-existing contribution-log conflict is outside this clean scoped result. |

Browser screenshots/results are local under `.local/trips-browser`. These are offline component checks with synthetic responses, not live persistence/provider verification. Production build was not rerun for this rollback.

## Deferred design recommendation

Home could offer a clearly marked, ready-to-explore sample trip in the normal interface, with an optional short navigation tour and an optional owned/permissioned sample video tied to precomputed sample results. Sample data should not silently create personal trips or imply live verification. Home UI, sample media and template persistence are proposals only.

## Existing limitations

Live authenticated Supabase/provider checks and human usability review were not performed for this rollback. The pre-existing unresolved merge conflict in `planning/contributions.csv` is preserved; its historical entries were not discarded.

# Trip dates, hotel nights and place selection fixes — 23 September 2026

## Behavior

- Trip date edits reject an existing booking or dated hotel stay that would fall outside the new trip. The response names the item; no booking, hotel or trip date is silently changed. New bookings must also be inside the trip dates.
- Itinerary generation checks old inconsistent records before contacting the generator and returns an actionable `INVALID_STATE` rather than a planner `BOOKING_MISSING` failure.
- Hotel inputs say **First night** and **Last night**, explain check-out morning, and cap the last night at the day before departure. Setup date saves refresh hotel-night drafts and booking date bounds without reloading the page.
- The Places page can save an empty selection after **Clear all**. An existing selection can also be cleared in the builder picker.
- Creating a trip with a custom city saves `City, Country`, retaining its country for saved-place matching. The displayed default title remains city-focused.
- `MAX_TRIP_DAYS` remains 7; this task did not change it.

## Checks actually run

- `npm run check`: passed, including 616 tests, typecheck, generated API check and planning metadata validation.
- `npm run test:e2e:offline`: passed in local Edge with synthetic API responses. It covered setup date synchronization and labels, custom-city payload, zero-place selection, builder hotel range, and existing trip/places UX groups.
- `npx vitest run tests/integration/trip-date-integrity.test.ts`: three passing date integrity cases, including a legacy inconsistent trip.
- `destinationLocation('Kobe, Japan')` returned `JP` in a direct local check.

## Limits and review

Browser checks use synthetic data and intercepted APIs. A hosted Supabase/browser run, live AI itinerary generation, and human usability review were not performed. Existing files on this branch had unrelated local changes and were preserved.

# Confirmed places to itinerary

19 September 2026. User requested a logic check and a generation/UI acceptance test.

## Findings and changes

- Confirmation already saves `status=confirmed` and the selected provider option on the existing candidate.
  The trip's confirmed list reads those same records. The planner accepts only confirmed records with a selection.
- Confirmation and generation are distinct: generation schedules confirmed places around preferences/bookings;
  places that do not fit stay unscheduled. Adding another confirmed place makes an existing plan stale until regeneration.
- The UI lacked a visible list before first generation. Added **Ready to plan**, showing saved confirmed names
  and addresses, and a confirmation count/**Plan itinerary** link from Places. No new API/schema/migration.
- The itinerary page previously ignored confirmed-place fetch failures and could display incomplete provider
  metadata. It now waits for that data and exposes an error with **Retry loading places**; generation refreshes it.

## Executed acceptance

Eleven Chromium checks passed using real local Next pages, HTTP handlers, file repositories and the planner.
Input/provider venues were fictional. The main flow had no intercepted API responses; the final load-error test
intercepted only that failure. Screenshots/results are local in `.local/confirmed-itinerary-browser`.

1. A trip with only unconfirmed candidates cannot generate.
2. UI confirmation persists across reload in the confirmed list with selected options and source evidence.
3. The itinerary page lists those confirmed places before generation.
4. Generate saves a confirmed-only plan; a locked 19:30–21:00 booking stays fixed.
5. Magazine renders the saved stops after navigation.
6. Timeline renders the same version and stops.
7. Map renders the same version and stops. Pending/rejected places are absent from all three views.
8. Remove/Add saves new itinerary versions without deleting the place from the confirmed list.
9. Another confirmation marks the old plan stale; Regenerate includes the additional place.
10. Confirmed-place load failure is visible and retry restores the UI.
11. No browser runtime errors occurred. Unknown opening hours remain visibly unchecked.

A separate live Supabase service check passed six assertions: unconfirmed rejection, persisted confirmation/list,
generation/reload with unknown hours, staleness after another confirmation, regeneration with immutable v1,
and stale-version rejection. It used a temporary synthetic account/trip/places, all removed afterwards. No paid AI
or location-provider calls were made. This is database/service acceptance, not a deployed browser test.

`npm run check` passed: 343 tests in 27 files, workspace type checks, API docs and planning/link validation.
`npm run build` passed on Node 24. Browser checks ran separately from that automated suite.

## Limits

The new UI is not deployed yet. Existing Member 3 transactional place-merge issue #9 remains unresolved;
these happy-path confirmations do not establish rollback safety of multi-record merging. OSM identity accuracy,
real opening hours and real route times are outside this check. No production user data was edited.

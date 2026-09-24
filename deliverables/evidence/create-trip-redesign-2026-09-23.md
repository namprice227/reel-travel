# Create-trip redesign: three questions and a three-step builder (23 September 2026)

**Status:** implemented locally; offline browser checks and one live synthetic walkthrough pass. Not yet reviewed by a human.
**Tasks:** FE05 (create and builder screens), FE04 (place selection).
**Design source:** the user picked these options on the create-trip design canvas
(<https://claude.ai/artifact/6SvEhN288gh6bDPAqWU7Pa>, private until shared): **1D** (one question per screen),
**P-B** (places table and add panel), **S-A** (hotel rows with nights), **D-A** (travel-style card). The canvas
mockups use fictional places and illustrative maps.

## What changed

| Screen | Before | After |
| --- | --- | --- |
| `/my-trip/new` | One long form: country grid, city chips, dates, name, summary card | Three questions, one per screen: country → city (or another city) → dates on a two-month range calendar. Earlier answers are chips that jump back. The suggested name ("Four days in Kyoto") can be renamed inline. The day limit reads `MAX_TRIP_DAYS` from contracts instead of a local copy. |
| Builder step bar | Four steps in a left rail, plus a right "Added places" column | Three steps in a horizontal bar: **Pick places**, **Add your stay**, **Plan the days**. |
| Pick places (was *Add places* + *Choose places*) | Saved-places shelf and add box on one step; tick cards on the next | One table (tick, place, type, area, details) of this trip's places plus saved places from other trips in the same country. No From or Location column. Filters: All, In this trip, From your other trips, Selected. An **Add something new** panel takes a link, text or screenshot; places found later arrive ticked. **Continue** copies only the ticked saved places (`places.copy`), then saves the selection (`places.select`). |
| Add your stay | Name plus From/To per stay | One row per hotel: name and a first-night → last-night range with a nights count. **Add another hotel** starts the night after the previous hotel ends (shortening an open-ended one). Moving a hotel's last night moves the next hotel's first night while they touch. A bar shows how many nights are covered. Shared nights, half-dated stays and dates outside the trip block saving. |
| Plan the days | Summary list and **Build my days** | Pace cards, getting-around tiles and a start-time choice (`preferences.pace`, `transport`, `dayStart`). Changed values save with `trips.update` before generation starts. |

The `/my-trip/:tripId/places` page still uses `ChoosePlacesStep`; it was not part of this redesign.
One contract fix followed (partial preference updates no longer erase saved stays; see the live check below).

## Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 609 tests |
| `tests/e2e/create-trip.mjs` (new; offline Chromium/Edge, real `CreateTripPage` and CSS, mocked `trips.create`) | 6 checks PASS: 7 countries with Japan chosen; city answer survives going back; another city; two calendar clicks make a 3-day range; a 9-day range is blocked; renamed trip POSTs `{title, destination: "Kyoto", timezone: "Asia/Tokyo", startDate, endDate}` and opens the planner; no overflow at 768/390 px; no runtime errors |
| `tests/e2e/saved-places.mjs` (rewritten for the new builder; real `TripBuilder`) | 7 checks PASS: empty account sees the table's empty state and add panel; only same-country saved places are listed and no From/Location column exists; ticking three by keyboard copies exactly those three and selects the copies; chained second hotel; shared-night block; both stays saved with nights; pace/transport/start time saved before generation; no overflow at 1280/768/390 px; no runtime errors |
| `tests/e2e/my-trip-ux.mjs` | 21 checks PASS (unchanged `/places`, itinerary, sharing) |
| `tests/e2e/trips.mjs` | **Fails before rendering, for a reason unrelated to this change.** The test bundle has no `process.env` define, and `lib/ga4.ts` (GA4 commit) reads it. With a temporary copy that adds the define, all 19 checks pass. The fix is left as a separate task. |

`scripts/run-offline-e2e.mjs` now runs `create-trip.mjs` too. Screenshots are written to
`.local/create-trip-browser/` and `.local/saved-places-browser/` (not committed).

## Follow-up after the user's review (same day)

The user ran the real app and reported three problems:

1. **Add your stay was broken:** the hotel field was squeezed to the right. Cause: `setup-share.css` (Trip details)
   already defines `.stay-row` and `.stay-foot`, and it loads after `itinerary.css`, so its grid won. The offline test
   missed it because it loaded only four of the app's ten stylesheets. Fix: builder classes renamed to `hotel-*`.
   Both offline harnesses now load every stylesheet `layout.tsx` imports, in order. `saved-places.mjs` now asserts
   the hotel field is wider than 300 px, sits beside the nights range, and lines up under its column heading.
2. **Add panel was wordy:** it is now centred with only a heading, a Link/Text/Screenshot switch, one input and
   **Find places**. The helper text and "Recently added" list are gone. One short status line appears only for the
   item just added. The test checks the panel stays at 12 words or fewer.
3. **Plan the days needed scrolling:** the card is now compact (pace and mode cards on one line each, tighter spacing)
   and vertically centred. The test asserts it is at most 500 px tall at 1440 × 760; it measures about 460 px.

Rerun: `npm run typecheck` PASS, `npm test` 609 PASS, `npm run test:e2e:offline` 34 checks PASS.
A second Next dev server could not be started for a live check: Next allows one `next dev` per project folder and
the user's server was already running on port 3000.

## Live check in the real app (same day, after the user stopped their server)

Ran `next dev` on port 3100 with `DATA_BACKEND=file`, dev sign-in, `AI_PROVIDER=fake` and `PLACES_PROVIDER=fake`
against a throwaway data directory, so no hosted data or paid provider was touched. As the synthetic Bob account at
1900 × 950: created "Four days in Tokyo" through the three questions (calendar 12–15 Oct); added a text note naming two
fictional fixture venues, which arrived in the table ticked with "Places added to the table"; saved two chained hotels
(3 of 3 nights covered); built the days. The plan card fit without scrolling at 1900 × 950 and at 1366 × 700
(build button bottom 642 px of 700; no page or panel scroll). The itinerary was generated.

**Bug found and fixed.** After building, the trip had lost both stays. `UpdateTripInput.preferences` was
`TripPreferences.partial()`, and Zod 4 still applies the `accommodations` default of `[]` to an omitted field, so any
partial preference update (here pace, transport and start time) erased saved stays. This predates the redesign, but the
new plan step triggers it on every build. `UpdateTripInput` now uses a preferences patch without that default (see
`packages/contracts/src/trip.ts`); two contract tests cover it; `npm run docs:api` regenerated. Rechecked live:
after setting two stays and then changing only pace, transport and start time, both stays remained.
`npm run typecheck` PASS, `npm test` 611 PASS.

Unrelated console errors seen: OpenStreetMap tiles on the itinerary map are blocked by the content security policy
for synthetic places.

## Not verified / limits

- The live check used the file store and fake providers only; hosted Supabase and real providers were not exercised.
- Human usability review is pending.
- **Trip length stays at 7 days.** The user asked for 20. Raising `MAX_TRIP_DAYS` also needs the itinerary planner
  changed (`ItineraryProposal` allows at most 7 days, `planningInput` rejects more than 7, the 8,000-token output
  budget and the weather lookup are sized for a week). That is not done and has not been evaluated. The UI reads the
  constant, so it will follow once those change.
- The stay step stores first and last **night**, as the `Accommodation` contract defines. The departure day is not
  covered by a dated stay; the planner's existing fallback rules apply.
- Saved places from other trips show a Details link to their original trip.

# Desktop design gallery

Date: 15 September 2026. Task: FE01. Status: proposed visual alternatives; human selection pending.

[Open the local gallery](index.html) to filter by visual direction or screen, enlarge any image, and compare two or three selected concepts. Open the HTML file in a browser; it needs no server, external scripts or external font downloads.

## Coverage and options

Twenty new desktop concepts are included in this set, in addition to the original desktop/mobile concepts.

| Direction | Coverage | Visual character |
| --- | --- | --- |
| A — Editorial Blue | All 12 main screens | Existing cream/ink/blue foundation, editorial headings, practical sidebar |
| B — Forest Journal | Home, My trips, itinerary, magazine | Ivory, forest green, sage, publication-like composition |
| C — Midnight Atlas | Home, My trips, itinerary, magazine | Dark navy, cyan, compact planning workspace |

The full screen set covers public home, trip dashboard, development sign-in, inspiration capture/recovery, place confirmation, setup/bookings, itinerary timeline, map, magazine, edit preview/conflict, sharing management, and public read-only view. The alternative directions have four screens each, rather than a full second and third implementation specification.

## Images

| ID | Direction | Screen | Image |
| --- | --- | --- | --- |
| A-HOME | Editorial Blue | Home page | [Open PNG](a-home.png) |
| A-TRIPS | Editorial Blue | My trips dashboard | [Open PNG](a-trips.png) |
| A-SIGN-IN | Editorial Blue | Sign-in page | [Open PNG](a-sign-in.png) |
| A-INBOX | Editorial Blue | Inspiration inbox | [Open PNG](a-inbox.png) |
| A-PLACES | Editorial Blue | Place confirmation | [Open PNG](a-places.png) |
| A-SETUP | Editorial Blue | Trip setup and bookings | [Open PNG](a-setup.png) |
| A-ITINERARY | Editorial Blue | Itinerary timeline | [Open PNG](a-itinerary.png) |
| A-MAP | Editorial Blue | Itinerary map view | [Open PNG](a-map.png) |
| A-MAGAZINE | Editorial Blue | Travel magazine | [Open PNG](a-magazine.png) |
| A-EDIT-PREVIEW | Editorial Blue | Edit preview and conflicts | [Open PNG](a-edit-preview.png) |
| A-SHARE | Editorial Blue | Sharing management | [Open PNG](a-share.png) |
| A-SHARED-VIEW | Editorial Blue | Public read-only trip | [Open PNG](a-shared-view.png) |
| B-HOME | Forest Journal | Home page | [Open PNG](b-home.png) |
| B-TRIPS | Forest Journal | My trips dashboard | [Open PNG](b-trips.png) |
| B-ITINERARY | Forest Journal | Itinerary timeline | [Open PNG](b-itinerary.png) |
| B-MAGAZINE | Forest Journal | Travel magazine | [Open PNG](b-magazine.png) |
| C-HOME | Midnight Atlas | Home page | [Open PNG](c-home.png) |
| C-TRIPS | Midnight Atlas | My trips dashboard | [Open PNG](c-trips.png) |
| C-ITINERARY | Midnight Atlas | Itinerary timeline | [Open PNG](c-itinerary.png) |
| C-MAGAZINE | Midnight Atlas | Travel magazine | [Open PNG](c-magazine.png) |

## Suggested review order

1. Compare A-HOME, B-HOME and C-HOME for the first impression.
2. Compare A-ITINERARY, B-ITINERARY and C-ITINERARY for day-to-day use.
3. Compare the three magazine options for the final trip presentation.
4. Review the remaining A screens for workflow completeness, then apply the selected direction consistently.

Editorial Blue has the shortest visual migration from the current app. Forest Journal explores a warmer publication style. Midnight Atlas explores a dark workspace. These are design judgments, not measured user preferences. Selecting a direction does not approve branding, providers or product scope.

## Generation and provenance

- Skill: imagegen. Mode: built-in image generation, one generation call per screen.
- Each image is a new generation with a self-contained direction and screen brief; no reference images or CLI fallback.
- Exact submitted prompts: [prompts.json](prompts.json).
- All final selected PNGs are copied into this directory; original generated files are preserved.
- No personal uploads, actual research participants, private tokens or real booking records were used.
- No app code, API contracts or frontend runtime behavior changed.

## Reading the images accurately

These are raster design explorations, not live screens or verified trips. The [frontend plan](../frontend-plan.md), [feature specs](../../features/README.md) and [API contracts](../../../packages/contracts/src/api.ts) govern behavior.

Generated text and decorative details can drift from the prompt. Before implementation:

- Replace incidental real-world venue names and generated thumbnails with labeled contract fixtures or permissioned provider data. No imagery in this gallery verifies a place, route, booking, opening window or season.
- Keep original source links/evidence in the owner flow, explicit unselected branch choices, uncertainty labels, estimated travel, breaks and protected bookings.
- Remove incidental “from anywhere” import wording. Use “Save travel links, notes or screenshots. Add details when a source can't be read.”
- Keep only the supported trip navigation: Inbox, Places, Trip setup, Itinerary and Share. Incidental Discover, Documents, Journal or extra notes features in a raster alternative do not expand MVP scope.
- Omit uncontracted search, avatar/account features and venue-photo fields unless separately designed and supported. A decorative icon or wordmark in a concept is not a final brand asset.
- A lunch break without coordinates must not gain a map pin merely because a generated map labels it. Map/list order comes from the saved itinerary and real available locations.
- Check every action against the existing state rules. A conflict preview remains unsaved; only an accepted server response updates the saved itinerary.
- Do not infer data from decorative copy, dates, weekday labels or map labels. Check real dates/timezones in code.
- Specific visual drift: A-PLACES uses a Kyoto trip heading, A-SHARE uses an Amalfi Coast example, A-EDIT-PREVIEW uses Rome, and some A screens use April dates. They are independent screen concepts, not captures of one synchronized trip. Normalize trip identity, dates, wordmark and navigation when implementing the chosen direction.
- A-SETUP labels the break field “Break between activities”; the contract stores total daily break minutes. Use “Daily break time” in implementation. Confirmed must-visit options must come from the trip's confirmed places.
- All directions require contrast, keyboard, responsive and usability checks once implemented. No accessibility measurements or participant findings are claimed here.

## Review and verification record

- Generation: **20/20 completed and copied into this directory**. Each PNG is 1586 × 992 pixels; total PNG size is 31,929,939 bytes.
- Visual inspection: all 20 images reviewed for composition, readable labels, intended screen coverage and state communication. Important prompt deviations and required implementation corrections are recorded above. These images are approved only as design explorations by the generating assistant; no human approval is claimed.
- Asset/HTML integrity: a Python standard-library check verified 20 distinct manifest filenames, valid PNG signatures/dimensions, 20 gallery cards, matching image references and all static local HTML links. Passed.
- Gallery JavaScript: extracted inline script passed `node --check` through stdin. Browser interactions have not been exercised; syntax validation is not a browser test.
- `python scripts/validate_workspace.py`: passed for 32 tasks, 160 points, 21 milestone drafts and local Markdown links.
- `git -c core.autocrlf=false diff --check`: passed.
- Application tests and API generation were not run because this task changes design artifacts and a local gallery only. Human selection, live-app accessibility checks and participant observations remain pending.

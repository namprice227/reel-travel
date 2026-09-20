# My Trip UX v2 — approved design and implementation

20 September 2026. Responds to the requesting user's critique of oversized headers, hidden actions and fragmented place details. **The user approved this design and requested implementation. My Trip UX v2 is now implemented; see [runtime evidence](../../../deliverables/evidence/my-trip-ux-v2-2026-09-20.md).** The boards remain the static proposal snapshot; the implementation uses a selected-location Google iframe with external day navigation instead of custom in-map route overlays. Existing unrelated work is preserved.

Open the [screen gallery](index.html), the [five-page PDF](review-board.pdf), or the [editable HTML source](review-board.html). The five HTML pages are annotated for Canva import. The attempted Canva import was rejected by automatic approval review because sending this local project material to Canva needs explicit authorization naming the external destination. No Canva design was created. Approval is pending for this exact review board, which contains synthetic layout examples and no credentials, uploads or identifiable account data.

## Design direction

Use screen space for a decision, an action or useful trip information. Keep the existing blue, cream and ink palette; use the existing Figtree for controls and Newsreader sparingly for trip names. The portable boards use Arial/Georgia fallbacks. Remove decorative slogans, repeated introductions and duplicate map links. Keep uncertainty, saved-source evidence and fixed-booking information visible.

The boards are static mockups, not working controls. Destinations are illustrative, venue names and opening hours are synthetic, and the map is an explicitly labelled schematic. It is not a Google Maps screenshot or real route.

## Screen proposals

| Screen | Proposed change | Why it matters |
| --- | --- | --- |
| [01 My Trips](01-preview.png) | One compact row: My trips, Overview, All trips, Create trip. Remove journal eyebrow, slogan and decorative full stop. | Starts the page with navigation and trip content. All trips has an obvious boundary and the same control size as Overview. |
| [02 Selected place](02-preview.png) | Edit day belongs beside the selected day heading. Place panel order: linked name, hours for planned day, Full details, short location, Google map, directions and source. | Edit is associated with the content it changes. The essential place information and deeper-details action appear before scrolling. |
| [03 Edit mode](03-preview.png) | Visible Editing Day N, move controls, Done and Undo. Fixed bookings show a lock without move controls. | Makes editing discoverable and communicates what changes and what stays fixed. No pretend drag handle. |
| [04 All Trips](04-preview.png) | Same toolbar as overview; compact filters/search immediately above rows. Remove Every trip and the historical summary sentence. | One navigation model and more useful rows within the viewport. |
| [05 Mobile](05-preview.png) | Horizontal day controls and visible Edit day; selected place opens a bottom sheet. | The response to selection stays in view instead of moving below the whole itinerary. |

## Issues identified in the pre-implementation audit

These are code-based UX findings and user-reported problems, not measured user-research results.

| Priority | Finding and source | Proposed resolution |
| --- | --- | --- |
| P0 | My Trips has three lines of decorative introduction and a weak archive link — `TripsPage.tsx`, `.trips-page .trips-head`. | Single toolbar, 24px heading and labelled Overview / All trips controls. Desktop toolbar target 60–72px; mobile may use two compact rows. Targets need runtime verification. |
| P0 | All Trips repeats a back link, large title and summary — `AllTripsPage.tsx`. | Reuse the same toolbar. Preserve routes so `/my-trip/all` remains directly reachable. |
| P0 | Edit days sits in its own right-aligned bar — `ItineraryPage.tsx`, `.itin-actions`. | Move it into `DayView` next to the day heading. Label Edit day, since the visible workspace edits the selected day. Keep moving to other days available within edit mode. |
| P0 | `StopPanel` places a map ahead of hours and the Full details link at the end. | Put the Google-linked title first, planned-day hours directly below it and Full details immediately after. Remove the separate boxed Google Maps/Hours rows. |
| P0 | `MapView` uses Google only when at least one marker has `provider === "google"`; otherwise it uses OSM. | Make the map experience consistent across My Trip. Provider provenance remains attached to places, separate from the chosen map renderer. |
| P1 | At widths below 1100px, `.day-panel` becomes a full-width block below the itinerary. | Open selected place details as a dialog sheet on narrow screens. Keep it mounted in a suitable overlay layer, manage focus and restore scroll position on close. |
| P1 | `.stop-handle` has a grab cursor but there is no drag-and-drop implementation. | Remove the handle. Use labelled move buttons/select until dragging actually exists. |
| P1 | All Trips hides date and status columns below 720px. | Keep date and status in a two-line mobile row; hide only redundant decoration. |
| P1 | All Trips Upcoming includes current/scheduled trips but excludes future drafts. | Temporal filters: All, Current, Upcoming, Past. Upcoming includes every future trip. In planning / Itinerary saved remains separate status information. |
| P1 | The search placeholder says places, but matching only inspects trip title and destination. | Rename it Search trip or destination. Preserve query, filter and sort when returning from a trip. |
| P1 | The shared place URL helper can use only a name despite known coordinates; a name alone can open the wrong branch. | Prefer the validated Google provider URL or confirmed Google place ID. Without these, use the confirmed coordinates; do not guess a venue or send fictional fixture names to Google. |
| P1 | Date grouping uses the browser's local day; travel may be in another timezone. | Define today and current-day selection in the trip timezone. Test travel-day boundaries before changing shared helpers. |
| P1 | “Open at this time” can be misread as live open-now information. | Say hours for the selected itinerary date and whether the planned visit fits. Unknown remains Hours unknown; never infer official hours from prose. |
| P1 | Desktop layouts use several independently scrolling regions. | Keep day controls and essential detail actions fixed within their workspace; scroll the stop list and secondary details predictably. On phones use page scroll plus one modal sheet, not nested columns. |

## Exact interaction specification

1. Clicking a stop selects it in the itinerary. Clicking its **title inside the details panel** opens Google Maps in a new tab with an external-link icon and accessible name. These remain separate actions.
2. Full details opens the app's place page. Returning restores the selected day, stop and list position. Place panels without a corresponding confirmed place do not offer a fabricated detail link.
3. Hours derive from provider `openingHours.windows` for the selected day in the trip timezone. Show all applicable windows, unknown status or a closure warning. Weekly detail can expand below the summary without an additional tab. Special/holiday hours not represented by the current contract remain a limitation.
4. Map loading/failure never blocks the title link, hours or Full details. One directions action has a distinct purpose: navigating to the selected stop. Remove duplicate Open map / Google Maps buttons that do the same thing.
5. Edits continue to use the existing validated API. Show Saving, Saved, or Edit not saved near the changed day. Do not claim a save before the server response. Locked reservations remain immutable. Preserve existing Undo and stale-version recovery. The red rejection block on board 03 illustrates the failure copy; production feedback should be adjacent to the attempted change.
6. Mobile place sheet: accessible dialog name, keyboard focus inside, Escape and visible Close, focus returned to the originating stop, no background scrolling. Use a scrollable sheet body and visible essential actions for large text and short screens.
7. Motion: 160–200ms selection/sheet transitions; no repeated entrance animation for everyday navigation. Disable motion under `prefers-reduced-motion`. Do not use animation to hide request latency or saving state.

## Google Maps implementation boundary

The desired outcome is a real Google map with English UI/labels where available, confirmed-location links and matching selected-stop highlighting. English display is a proposed assumption because the user objected to the Japanese map; it is not a request to translate place names or change country context.

The current single-location iframe cannot be assumed to preserve custom multi-stop markers and route overlays. Before replacing the renderer, verify the supported Google product against day-preview, selected-place and full-map needs. Google documents [language/region configuration](https://developers.google.com/maps/documentation/javascript/localization) and [place-ID-based Maps links](https://developers.google.com/maps/documentation/urls/guide). Follow these rather than assuming a browser locale or a text query identifies the right branch.

The Maps JavaScript API requires a browser-visible, appropriately restricted credential, as described in [Google's setup guide](https://developers.google.com/maps/documentation/javascript/get-api-key). The repository currently says provider keys must stay on the server. Do not silently reuse or expose the server Places key. Resolve that architecture decision explicitly: a dedicated restricted browser maps credential with an agreed policy exception, or a server-rendered Google map preview with a direct Google link. The latter has less in-app interactivity. No key setup, account changes or live provider calls were made for this proposal.

Keep Google's actual attribution visible in production. Schematic board geometry is not a routing result, and travel durations continue to be labelled estimates until measured by a routing provider.

## Implementation sequence

| Step | Work | Expected files | Acceptance gate |
| --- | --- | --- | --- |
| 1 — Navigation and density | Compact shared trip-list toolbar; visible All trips; simplify copy; consistent temporal filters; readable mobile rows. | `features/trips/TripsPage.tsx`, `AllTripsPage.tsx`, scoped `styles/trips.css` | Current/all views reachable by keyboard, useful content immediately below toolbar, search/filter/empty/error states, no 320px horizontal overflow. |
| 2 — Day and place hierarchy | Relocate Edit day; reorganize panel; title link and planned-day hours; promote Full details; remove duplicate map rows/links and false drag affordance. | `features/itinerary/ItineraryPage.tsx`, `DayView.tsx`, `place-info.ts`, `styles/itinerary.css`, map URL helper as needed | Edit action beside day heading; title/hours/details visible together at 1280×720; confirmed branch link; unknown/closed/missing-place cases. |
| 3 — Responsive selection | Dialog sheet, focus management, scroll restoration and selected-stop state. | Day view and scoped styles; minimal shared dialog only if the existing app has none suitable | At 390×844 and 320px, selecting a stop immediately reveals details; Close/Escape returns focus; keyboard and 200% text zoom remain usable. |
| 4 — Map and final validation | Agree supported Google renderer, English locale, selection/route synchronization, failure state and attribution. | `components/MapView.tsx`, `PlaceMap.tsx`, `lib/maps.ts`, My Trip map callers | Existing confirmed stop IDs/order and day context survive toggling itinerary/map; no secret leakage; unavailable map leaves essential actions usable. |

Reuse existing contracts first. Any required API or schema change starts in `packages/contracts/src/api.ts` and the existing schemas, then `npm run typecheck` and `npm run docs:api`. Do not add provider facts inferred from the mockups. Scope stays within My Trip.

After implementation run the relevant browser checks, `npm run check`, and the applicable authenticated runtime flow. Specifically verify fixed booking preservation, rejected edits, stale versions, unknown hours, map selection, keyboard focus, and list return state. A static board does not verify these behaviors.

## What was actually verified

- Five 1440×900 boards rendered locally in headless Chrome. [Layout check](layout-check.json): no overflow of the checked board, app, content, panel or phone frames; no browser runtime errors.
- PNGs visually inspected; header and edit layouts corrected after initial clipping was observed.
- PDF exported and all five board PNGs saved.
- `python scripts/validate_workspace.py` and `git diff --check` run for this design/documentation pass; results recorded in the contribution log.
- No runtime application code changed in this pass, so application tests/typecheck were not rerun for the static design files. Earlier test results belong to the previous implementation, not this proposal.

Rebuild: `python docs/design/my-trip-ux-v2/build-board.py`. Render with `node docs/design/my-trip-ux-v2/render-board.mjs` using the separately installed Playwright module and Chrome, matching the repository's existing local browser-tool convention. The user approved the proposal. Runtime implementation and browser checks are recorded in the evidence linked above; human review of the implemented UI, Canva upload and usability measurements remain pending.

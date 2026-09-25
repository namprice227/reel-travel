# F3 Trip setup: trips, preferences and bookings

**Story US-03 acceptance:** persist dates, timezone, accommodation, transport, pace, budget, priorities and bookings;
show estimates and unknowns.
**Owners:** UI Member 1 (FE05) · trips, preferences and bookings Member 4 (BE10, BE12) · reviewer Member 3
**Screens:** `/my-trip` (list), `/my-trip/new` (create), Trip settings dialog (gear in the trip header, `?settings=details|preferences|bookings` on any trip page) · code in `apps/web/src/features/trips`

## User flow

24 September 2026: the `/setup` page and the header's Details tab were removed. The same forms open as the **Trip settings** dialog from the gear in the trip header; `/setup` and `/details` links redirect to it. [Evidence](../../deliverables/evidence/trip-settings-and-day-editing-2026-09-24.md).

21 September 2026: the My Trips spotlight tutorial was reverted at the user's request. The overview has no getting-started guide; Saves uses the trip-filtered Inspiration library. Home navigation onboarding and sample templates are not implemented. [Rollback evidence](../../deliverables/evidence/my-trip-onboarding-2026-09-21.md).

23 September 2026: create and builder redesigned (designs 1D, P-B, S-A, D-A). [Evidence](../../deliverables/evidence/create-trip-redesign-2026-09-23.md).

1. `/my-trip`: list own trips; `/my-trip/new`: three questions, one per screen: country, city (or another city in that country), then dates on a range calendar (at most `MAX_TRIP_DAYS`, 7). A custom city's selected country is saved with its destination so same-country saved places appear. A typed city matching a listed city in any case is saved as that city; a small typo offers the listed city; other typed cities are kept as typed with a notice that spelling is not checked yet (browser only). In short laptop windows each question and the calendar fit without scrolling; typed date fields sit behind **Type dates instead**. The title defaults to "Four days in Kyoto" style and can be renamed. The trip then opens the builder, which has three steps:
   - **Pick places:** tick this trip's places and saved places from other trips in the same country; add a link, text or screenshot beside the table. Continue copies the ticked saved places, then saves the selection. A trip plans one city: a place whose every provider address leaves out the trip's city shows **Address outside {city}** and is not auto-ticked (or included by "Select all" on the Places page). This is a browser-side address text check, not validation.
   - **Add your stay** (optional): one row per hotel with its first and last night; check-out is the morning after the last night, so the trip's departure day is not a hotel night. A new hotel starts the night after the previous one ends. Shared nights, half-dated stays and dates outside the trip block saving.
     Typing three or more letters suggests hotels or areas (`stays.suggest`, the provider's autocomplete, limited to the trip's country and biased to its city), with their distance from the centre. Picking one looks it up (`stays.place`) and checks it: **In {city}** links at once; **N km from {city}** (a nearby town) needs a second click, **Use anyway**; **Not in {city}** / **Another country** grey out and cannot be picked. Arrow keys, Enter and Escape work in the list. A linked hotel shows a pin, its town and **Change** (which unlinks it); **N km from your places** warns when the median straight-line distance to the selected places is over 15 km. Without a hotel provider nothing is suggested and stays are saved by name.
   - **Plan the days:** pace, getting around and day start time, saved before the itinerary is generated.
2. Settings, **Trip details**: edit the same fields. Saving dates refreshes the adjacent hotel-night inputs and clamps an out-of-range booking draft to the new start date.
3. Settings, **Trip cover** (component kept, not mounted): optionally upload or replace a private PNG, JPEG or WebP image (at most 4 MiB).
4. Settings, **Stays & preferences**: pace, day start/end, transport, break minutes, budget, interests, **stays**
   (one row per hotel: the same in-row hotel search, optional coordinates for an unlinked stay, and optional check-in/check-out dates), must-visit places
   (from selected places with a provider location). A trip may list several stays. Each day starts where the traveler slept the night
   before (on the first day, that night's stay) and ends at that night's stay, falling back to a stay with no dates; on a hotel-change
   day the two differ, and the departure day ends nowhere known.
   The owner's itinerary map and day panel run each day's route hotel → stops → hotel, with the hotel as one bed-icon map button and
   Start/End rows (plus the estimated ride back). Shared links never show the hotel.
5. Settings, **Fixed bookings**: add a same-day booking (title, date, start, end, optional selected place with a location, locked). Delete bookings.
6. Planning-input changes make the current itinerary **stale**; changing only the cover does not.
7. **Delete trip** is available in Trip settings and All trips. Confirmation names the content removed: saves, places, bookings, itinerary versions, share links and private uploads. Copies already made in other trips remain, but their links to this trip's source saves become unavailable.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| List trips | `trips.list` | Newest first. |
| Create trip | `trips.create` | Default preferences applied. |
| Load trip | `trips.get` | Includes `currentItineraryVersion`. |
| Save details or preferences | `trips.update` | Partial: only fields sent change. `preferences` is merged field by field. |
| Suggest hotels while typing | `stays.suggest` | Autocomplete candidates in the trip's country; nothing checked or saved. One session token per run of keystrokes. 90/min, 1500/day. |
| Check a picked hotel | `stays.place` | Provider facts and fit against the destination; ends the autocomplete session. Shares place-search limits (20/min, 200/day). |
| Delete trip | `trips.delete` | Owner-only permanent delete; child rows cascade and private upload bytes are removed afterward. |
| Upload/replace cover | `trips.cover.upload` | Multipart private image. Bytes go to private asset storage; the trip stores `coverAssetId`. Stale tabs reject. |
| List bookings | `reservations.list` | Ordered by start. |
| Add booking | `reservations.create` | `start`/`end` are `YYYY-MM-DDTHH:mm` in the trip timezone. `locked` defaults to true. |
| Delete booking | `reservations.delete` | |

## Server rules

- `endDate >= startDate` and at most `MAX_TRIP_DAYS` (7) → otherwise `400` with `details.issues`.
- `dayEnd` must be after `dayStart`.
- A stay gives both of its dates or neither. Dated stays must start on or after `startDate` and end before `endDate`; `checkOut` stores the last occupied night, not the check-out morning. Invalid stays reject with `400`.
- Changing dates rejects with `VALIDATION_FAILED` when an existing booking or dated hotel night would fall outside the new window; saved trip dates and bookings remain unchanged. The message names the conflicting item so the traveler can correct it first.
- A stay linked to a provider place (`Accommodation.place`) is re-checked when its link or the trip destination changes: the server looks the place up again (Place Details), and the provider supplies location, address, town and fit. A hotel is inside the destination when its provider address names it, or it lies in the provider viewport within 15 km of the centre (the viewport alone is too large: Google's "Tokyo" contains Yokohama). Hotels in another country, or outside the destination and more than 40 km from its centre, reject with `VALIDATION_FAILED`; a nearby town needs `place.fit = "nearby"` from the traveler. A browser-supplied location for a linked stay is ignored. Unchanged links keep their saved facts without a provider call. A destination change that strands a linked stay is rejected; with no provider, new links reject with `INVALID_STATE` and existing ones become `unchecked`. The trip country comes from a `", Country"` destination suffix or the supported-country timezone.
- Submitted must-visit ids must be selected places with a provider location in this trip. Duplicates are removed; invalid ids reject the update.
- Booking timestamps reject impossible calendar dates (including February 29 in a non-leap year).
- A booking must end after it starts on the same date, within the inclusive trip dates. `placeId` must be a selected place with a provider location in the trip.
- Times are wall-clock in the trip timezone (`LocalTime`, `LocalDateTime`). The planner never converts timezones;
  the trip carries it. Server timestamps (`createdAt`) are UTC.
- A locked booking is never moved by generation or edits (see [F4](F4-itinerary.md)).
- Cover metadata and the trip reference commit atomically. Replaced metadata is removed, and storage cleanup is attempted after commit.
- Uploaded covers are owner-only through `uploads.get`. Shared links retain illustrated covers and never receive private asset ids.
- Trip deletion removes its child records; existing share links then return `NOT_FOUND`. The file adapter mirrors Supabase's foreign-key cascade. Private upload metadata is removed with the trip, then storage bytes are cleaned up. If storage cleanup fails, orphan bytes need later reconciliation but are no longer reachable through the app.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Trip and booking CRUD | Working on the file store | Same services on the real database | Member 4 (BE10) |
| Preference validation | Dates, timezone, day window, valid booking timestamps, selected provider-backed must-visits | Provider-backed pilot validation | Member 4 (BE12) |
| Setup UI | Plain forms | Designed setup flow; show estimates and unknowns clearly | Member 1 (FE05) |

## Fixtures

`tripFixture`, `reservationFixture` (locked dinner 19:30–21:00).

## Acceptance checks

- [x] Date shortening rejects a booking or hotel night outside the new trip without changing saved dates; an old inconsistent trip reports a named preflight error. Setup inputs refresh after a date save, and hotel labels use first/last night. [Synthetic service and browser evidence](../../deliverables/evidence/trip-date-and-selection-fixes-2026-09-23.md).
- [x] A stay links to a provider hotel only inside the destination (a nearby town after confirmation); another city or country is refused; linked locations come from the provider; destination changes re-check links; days start at last night's hotel; the AI gets per-day start/end stays; far-from-stay stops are flagged; the owner map runs hotel → stops → hotel. [Synthetic service, planner and browser evidence](../../deliverables/evidence/stay-place-mapping-2026-09-25.md). Live Google checked for four Tokyo hotels only.
- [x] Owner can delete a trip from All trips or Setup after confirmation; its children, share link and private upload are removed while another trip's copied place survives. [Synthetic service and browser evidence](../../deliverables/evidence/delete-saved-data-2026-09-23.md).

- [ ] Preferences and bookings survive reload and sign-out/sign-in.
- [ ] An 8-day trip and a booking ending before it starts are rejected with a readable message.
- [ ] After adding a booking, the Itinerary screen shows the stale banner.
- [ ] A cover survives reload, replaces the old private object, and is inaccessible to another account.
- [ ] Budget and interests affect ranking where provider price/category facts exist; missing facts remain unknown.
- [ ] Changing timezone makes the existing itinerary stale without changing stored booking wall-clock times.

20 September 2026 `/my-trip` follow-up: the “Happening now” destination cover no longer derives its height from a downloaded image's aspect ratio. [Runtime geometry evidence](../../deliverables/evidence/my-trip-cover-sizing-2026-09-20.md) records the desktop and mobile reduction while retaining the existing crop behavior. Human visual review remains pending.

20 September 2026 `/my-trip` overview polish: editorial hierarchy, current-day actions, draft/saved-itinerary filters, bounded covers, reduced-motion support and distinct loading/empty/retry states. [Design and acceptance evidence](../../deliverables/evidence/my-trip-polish-2026-09-20.md) records 16 isolated Chromium checks; human review and live navigation remain pending.

20 September 2026 approved My Trip UX v2: compact shared Overview/All trips toolbar, destination-timezone grouping, future drafts included in Upcoming, mobile dates/status, explicit sort/search and browser-return state. [Implementation and verification](../../deliverables/evidence/my-trip-ux-v2-2026-09-20.md) supersede the design-only status; 16 overview checks and 14 list/itinerary groups pass, including native Next navigation. Setup persistence was not changed.

# F3 Trip setup: trips, preferences and bookings

**Story US-03 acceptance:** persist dates, timezone, accommodation, transport, pace, budget, priorities and bookings;
show estimates and unknowns.
**Owners:** UI Member 1 (FE05) · trips, preferences and bookings Member 4 (BE10, BE12) · reviewer Member 3
**Screens:** `/my-trip` (list), `/my-trip/new` (create), `/my-trip/:tripId/setup` · code in `apps/web/src/features/trips`

## User flow

21 September 2026: the My Trips spotlight tutorial was reverted at the user's request. The overview has no getting-started guide; Saves uses the trip-filtered Inspiration library. Home navigation onboarding and sample templates are not implemented. [Rollback evidence](../../deliverables/evidence/my-trip-onboarding-2026-09-21.md).

1. `/my-trip`: list own trips; `/my-trip/new`: create one with title, destination, IANA timezone and dates (at most 7 days).
2. Setup, **Trip details**: edit the same fields.
3. Setup, **Trip cover**: optionally upload or replace a private PNG, JPEG or WebP image (at most 4 MiB).
4. Setup, **Preferences**: pace, day start/end, transport, break minutes, budget, interests, accommodation
   (name, optional coordinates), must-visit places (from confirmed places).
5. Setup, **Bookings**: add a same-day booking (title, date, start, end, optional confirmed place, locked). Delete bookings.
6. Planning-input changes make the current itinerary **stale**; changing only the cover does not.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| List trips | `trips.list` | Newest first. |
| Create trip | `trips.create` | Default preferences applied. |
| Load trip | `trips.get` | Includes `currentItineraryVersion`. |
| Save details or preferences | `trips.update` | Partial: only fields sent change. `preferences` is merged field by field. |
| Upload/replace cover | `trips.cover.upload` | Multipart private image. Bytes go to private asset storage; the trip stores `coverAssetId`. Stale tabs reject. |
| List bookings | `reservations.list` | Ordered by start. |
| Add booking | `reservations.create` | `start`/`end` are `YYYY-MM-DDTHH:mm` in the trip timezone. `locked` defaults to true. |
| Delete booking | `reservations.delete` | |

## Server rules

- `endDate >= startDate` and at most `MAX_TRIP_DAYS` (7) → otherwise `400` with `details.issues`.
- `dayEnd` must be after `dayStart`.
- Submitted must-visit ids must be confirmed places in this trip. Duplicates are removed; invalid ids reject the update.
- Booking timestamps reject impossible calendar dates (including February 29 in a non-leap year).
- A booking must end after it starts on the same date. `placeId` must be a confirmed place in the trip.
- Times are wall-clock in the trip timezone (`LocalTime`, `LocalDateTime`). The planner never converts timezones;
  the trip carries it. Server timestamps (`createdAt`) are UTC.
- A locked booking is never moved by generation or edits (see [F4](F4-itinerary.md)).
- Cover metadata and the trip reference commit atomically. Replaced metadata is removed, and storage cleanup is attempted after commit.
- Uploaded covers are owner-only through `uploads.get`. Shared links retain illustrated covers and never receive private asset ids.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Trip and booking CRUD | Working on the file store | Same services on the real database | Member 4 (BE10) |
| Preference validation | Dates, timezone, day window, valid booking timestamps, confirmed must-visits | Provider-backed pilot validation | Member 4 (BE12) |
| Setup UI | Plain forms | Designed setup flow; show estimates and unknowns clearly | Member 1 (FE05) |

## Fixtures

`tripFixture`, `reservationFixture` (locked dinner 19:30–21:00).

## Acceptance checks

- [ ] Preferences and bookings survive reload and sign-out/sign-in.
- [ ] An 8-day trip and a booking ending before it starts are rejected with a readable message.
- [ ] After adding a booking, the Itinerary screen shows the stale banner.
- [ ] A cover survives reload, replaces the old private object, and is inaccessible to another account.
- [ ] Budget and interests affect ranking where provider price/category facts exist; missing facts remain unknown.
- [ ] Changing timezone makes the existing itinerary stale without changing stored booking wall-clock times.

20 September 2026 `/my-trip` follow-up: the “Happening now” destination cover no longer derives its height from a downloaded image's aspect ratio. [Runtime geometry evidence](../../deliverables/evidence/my-trip-cover-sizing-2026-09-20.md) records the desktop and mobile reduction while retaining the existing crop behavior. Human visual review remains pending.

20 September 2026 `/my-trip` overview polish: editorial hierarchy, current-day actions, draft/saved-itinerary filters, bounded covers, reduced-motion support and distinct loading/empty/retry states. [Design and acceptance evidence](../../deliverables/evidence/my-trip-polish-2026-09-20.md) records 16 isolated Chromium checks; human review and live navigation remain pending.

20 September 2026 approved My Trip UX v2: compact shared Overview/All trips toolbar, destination-timezone grouping, future drafts included in Upcoming, mobile dates/status, explicit sort/search and browser-return state. [Implementation and verification](../../deliverables/evidence/my-trip-ux-v2-2026-09-20.md) supersede the design-only status; 16 overview checks and 14 list/itinerary groups pass, including native Next navigation. Setup persistence was not changed.

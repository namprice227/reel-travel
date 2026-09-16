# F3 Trip setup: trips, preferences and bookings

**Story US-03 acceptance:** persist dates, timezone, accommodation, transport, pace, budget, priorities and bookings;
show estimates and unknowns.
**Owners:** UI Member 1 (FE05) · trips, preferences and bookings Member 4 (BE10, BE12) · reviewer Member 3
**Screens:** `/my-trip` (list), `/my-trip/new` (create), `/my-trip/:tripId/setup` · code in `apps/web/src/features/trips`

## User flow

1. `/my-trip`: list own trips; `/my-trip/new`: create one with title, destination, IANA timezone and dates (at most 7 days).
2. Setup, **Trip details**: edit the same fields.
3. Setup, **Preferences**: pace, day start/end, transport, break minutes, budget, interests, accommodation
   (name, optional coordinates), must-visit places (from confirmed places).
4. Setup, **Bookings**: add a same-day booking (title, date, start, end, optional confirmed place, locked). Delete bookings.
5. Any change here makes the current itinerary **stale**; the Itinerary screen asks to regenerate.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| List trips | `trips.list` | Newest first. |
| Create trip | `trips.create` | Default preferences applied. |
| Load trip | `trips.get` | Includes `currentItineraryVersion`. |
| Save details or preferences | `trips.update` | Partial: only fields sent change. `preferences` is merged field by field. |
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
- [ ] Budget and interests affect ranking where provider price/category facts exist; missing facts remain unknown.
- [ ] Changing timezone makes the existing itinerary stale without changing stored booking wall-clock times.

# F3 Trip setup: trips, preferences and bookings

**Story US-03 acceptance:** persist dates, timezone, accommodation, transport, pace, budget, priorities and bookings;
show estimates and unknowns.
**Owners:** UI Member 1 · trips Member 4 (D02) · preferences and bookings Member 3 (C02) · reviewer Member 2
**Screens:** `/trips` (list, create), `/trips/:tripId/setup` · code in `apps/web/src/features/trips`

## User flow

1. `/trips`: list own trips; create one with title, destination, IANA timezone and dates (at most 7 days).
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
- A booking must end after it starts on the same date. `placeId` must be a confirmed place in the trip.
- Times are wall-clock in the trip timezone (`LocalTime`, `LocalDateTime`). The planner never converts timezones;
  the trip carries it. Server timestamps (`createdAt`) are UTC.
- A locked booking is never moved by generation or edits (see [F4](F4-itinerary.md)).

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Trip and booking CRUD | Working on the file store | Same services on the real database | Member 4 |
| Preference validation | Dates, day window, booking times | Add rules the planner needs (e.g. budget use) and tests | Member 3 (C02) |
| Setup UI | Plain forms | Designed setup flow; show estimates and unknowns clearly | Member 1 |

## Fixtures

`tripFixture`, `reservationFixture` (locked dinner 19:30–21:00).

## Acceptance checks

- [ ] Preferences and bookings survive reload and sign-out/sign-in.
- [ ] An 8-day trip and a booking ending before it starts are rejected with a readable message.
- [ ] After adding a booking, the Itinerary screen shows the stale banner.
- [ ] Budget, interests and accommodation are stored even though the baseline planner uses only some of them.

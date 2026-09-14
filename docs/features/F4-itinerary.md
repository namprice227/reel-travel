# F4 Itinerary: generate feasible days and edit predictably

**Story US-04 acceptance:** account for travel, visit duration, breaks and available opening windows; explain infeasible days.
**Story US-05 acceptance:** move or replace a stop, preserve fixed reservations, revalidate the affected day before saving.
**Owners:** planner and edits Member 3 (C01, C03, C04) · UI Member 1 (A04) · reviewer Member 2
**Screen:** `/trips/:tripId/itinerary` · code in `apps/web/src/features/itinerary`, rules in `packages/planner`

## User flow

1. **Generate itinerary** (or **Regenerate**) builds a new version from confirmed places, bookings and preferences.
2. The header shows the version, the validation status and the last change.
3. **Checks** lists every conflict in plain language, including unknown opening hours.
4. On the timeline the traveler can move a stop up/down, move it to another day or remove it. Bookings have no controls.
5. An edit that would break a locked booking is **not saved**; the explanation is shown.
6. Places that didn't fit are listed under **Not scheduled** with "Add to day".
7. If inputs changed since generation, a banner asks to regenerate.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Load current version | `itinerary.get` | `{ itinerary \| null, stale }`. |
| Generate / regenerate | `itinerary.generate` | Body `{ expectedVersion }`: `null` for the first, else the version on screen. |
| Edit | `itinerary.edit` | Body `{ expectedVersion, edit, dryRun? }`. Returns the new version, or the preview when `dryRun`. |

Edits (`ItineraryEdit`):

| `type` | Fields | Effect |
| --- | --- | --- |
| `move_stop` | `stopId, toDate, toIndex` | Same stop id in the new position |
| `remove_stop` | `stopId` | Place goes to `unscheduledPlaceIds` |
| `add_place` | `placeId, date, index` | Confirmed, not yet scheduled place |
| `replace_stop` | `stopId, placeId` | New stop id; old place becomes unscheduled |

Errors the UI must handle:

| Error | Meaning | UI |
| --- | --- | --- |
| `409 STALE_VERSION` | Someone saved a newer version (`details.currentVersion`) | Reload the itinerary, tell the traveler |
| `422 EDIT_REJECTED` | Would move/remove a booking, or make a locked booking unreachable (`details.conflicts`) | Show the conflicts; nothing changed |
| `409 INVALID_STATE` | No itinerary yet, place not confirmed, or already scheduled | Show message |
| `404 NOT_FOUND` | Stop id not in the current version | Reload |

## Rules (packages/planner)

- **Versions are immutable.** Every generate or saved edit creates version `n + 1`. `expectedVersion` must equal the
  current version, otherwise `STALE_VERSION`. Never silently overwrite.
- **Bookings keep their times.** Generation places them first; re-timing never moves them.
- **Re-timing** ([retime.ts](../../packages/planner/src/retime.ts)): in stop order, each non-booking stop starts at the
  later of *previous end + travel* and *its opening time that day*.
- **Validation** ([validate.ts](../../packages/planner/src/validate.ts)) produces `Conflict`s:

  | Code | Severity | When |
  | --- | --- | --- |
  | `LOCKED_RESERVATION_UNREACHABLE` | error (warning if unlocked) | Previous stop + travel ends after a booking starts |
  | `LOCKED_RESERVATION_CHANGED` | error | An edit targets a booking stop |
  | `OVERLAP` | error | A stop starts before the previous one + travel ends |
  | `OUTSIDE_OPENING_HOURS` | error | Visit falls outside known opening windows |
  | `HOURS_UNKNOWN` | info | Hours unknown; plan becomes `partially_checked` |
  | `DAY_OVERFLOW` | warning | Stops end after the traveler's day end |
  | `PLACE_UNSCHEDULED` | warning | Confirmed places didn't fit |
  | `RESERVATION_OUTSIDE_TRIP` | warning | Booking date outside trip dates |

- `validationStatus`: `has_conflicts` if any error; else `partially_checked` if any hours are unknown; else `valid`.
- **Edit policy:** reject only when the edit touches a booking or makes a locked booking unreachable that was reachable
  before. Other conflicts are saved and shown, so the traveler stays in control. Revisit this with pilot feedback.
- **Stale:** `inputFingerprint` hashes dates, preferences, confirmed places and bookings at generation. Edits keep it,
  so an itinerary stays stale until regenerated.
- Travel times are straight-line estimates (listed in `assumptions`); show them as estimates.
- Analytics: `plan_generated`, `stop_moved`.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Generation | [generate.ts](../../packages/planner/src/generate.ts): greedy nearest-open place, pace capacity (3/4/6), one break after noon, must-visit first | Improved heuristic or solver, measured first (C03, C05) | Member 3 |
| Travel | Haversine × 1.3 at fixed speeds | Provider travel times if affordable; keep the estimate label | Member 3 |
| Edits | move/remove/add/replace with rejection rules above | Keep the contract; extend edit types only via a contract change | Member 3 (C04) |
| Itinerary UI | Buttons and a select per stop | Drag and drop, previews with `dryRun`, better conflict display | Member 1 (A04) |

## Fixtures

`itineraryFixtures.valid`, `.partiallyChecked`, `.impossibleReservation`; `errorFixtures.staleVersion`, `.editRejected`.

## Acceptance checks

- [ ] Seeded trip: generate → locked dinner stays 19:30–21:00 on day 1; no place overlaps it.
- [ ] Moving a long stop before the dinner so it can't be reached is rejected with an explanation; the version doesn't change.
- [ ] Moving the dinner itself is rejected.
- [ ] Editing with an old `expectedVersion` returns `STALE_VERSION` (integration test "itinerary", `npm run smoke`).
- [ ] A place with unknown hours shows "Hours not checked" and the plan says "Partially checked".
- [ ] A venue closed on a date is not scheduled then, or is flagged if the traveler moves it there.
- [ ] Planner unit tests cover normal day, unknown hours, locked booking and impossible day ([planner.test.ts](../../packages/planner/src/planner.test.ts)).

# F4 Itinerary: generate feasible days and edit predictably

**Story US-04 acceptance:** account for travel, visit duration, breaks and available opening windows; explain infeasible days.
**Story US-05 acceptance:** move or replace a stop, preserve fixed reservations, revalidate the affected day before saving.
**Owners:** planner and edits Member 4 (BE12, BE13) · UI Member 2 (FE09) · reviewer Member 3
**Screen:** `/my-trip/:tripId/timeline` (edit controls; magazine and map at `/itinerary` and `/map`) · code in `apps/web/src/features/itinerary`, rules in `packages/planner`

23 September date integrity follow-up: [synthetic service checks](../../deliverables/evidence/trip-date-and-selection-fixes-2026-09-23.md) cover the preflight response for a legacy booking outside shortened trip dates. Live AI generation was not rerun.

## User flow

### OpenAI generation (21 September 2026)

`itinerary.generate` supports the OpenAI provider, using saved dates, timezone, daily start/end,
preferences, ticked places and bookings. Before prompting the itinerary model, the server chooses provider-backed locations from candidate options using source support and route proximity. A versioned prompt and provider-neutral proposal schema let
future adapters reuse the same input and validator. Models propose day/order/durations and reference only allowed
IDs; the server calculates flexible times, supplies factual fields and checks constraints. Invalid proposals return `GENERATION_FAILED`
without changing the saved version. Changed input during generation returns `STALE_TRIP`. Daily/minute AI
quotas are shared across web instances. Old itineraries remain readable; no migration is needed.

See [configuration/design](../operations/itinerary-ai.md), [benchmarking](../../evals/itinerary/README.md)
and [actual checks](../../deliverables/evidence/itinerary-ai-2026-09-21.md). The baseline generator described
below remains available explicitly for offline development. It is not a fallback for model failures.

1. **Generate itinerary** (or **Regenerate**) builds a new version from selected places, bookings and preferences.
   A preflight check reports an existing booking or hotel night outside the trip dates as `INVALID_STATE` with the item named, before calling the generator; no itinerary version is saved.
   The builder and Places page let travelers tick ideas without confirming a branch. Provider IDs chosen for the route are stored on the itinerary version without changing the candidate's traveler-confirmed status.
   Selected places with no provider location are reported as unresolved; duplicate provider venues are scheduled once. Overflow remains in **Not scheduled** on the Timeline.
2. The header shows the version, the validation status and the last change.
3. **Checks** lists every conflict in plain language, including unknown opening hours.
4. In **Edit day** the traveler drags a stop by its handle (or uses up/down) to reorder it, or drops it on another day
   in the rail. **Edit** on a stop opens the stop editor: length and "start no earlier than", the traveler's own name,
   which branch, move to day, swap for another place, note, remove. Bookings have no controls.
5. An edit that would break a locked booking is **not saved**; the explanation is shown.
6. Places that didn't fit are listed under **Not scheduled** with "Add to day". **Add a place** opens a picker with
   This trip (planned or not), Saved places (other trips, account library) and Search (Places provider). A place with
   several branches asks which one; the choice is confirmed in the same save.
7. If inputs changed since generation, a banner asks to regenerate.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Load current version | `itinerary.get` | `{ itinerary \| null, stale }`. |
| Generate / regenerate | `itinerary.generate` | Body `{ expectedVersion }`: `null` for the first, else the version on screen. |
| Edit | `itinerary.edit` | Body `{ expectedVersion, edit, dryRun? }`. Returns the new version, or the preview when `dryRun`. |
| Add or swap in a place | `itinerary.addPlace` | Source `trip`, `saved`, `account` or `search`; optional `providerPlaceId` branch; `at` a day (end by default) or a stop to replace. Copies/branch choice are saved first. |
| Rename / switch branch | `itinerary.updatePlace` | `customName` (null restores the provider name) and/or `providerPlaceId`; applies `refresh_place`. |
| Search places | `places.search` | Provider candidates only, nothing saved; 20/min, 200/day per user. |

Edits (`ItineraryEdit`):

| `type` | Fields | Effect |
| --- | --- | --- |
| `move_stop` | `stopId, toDate, toIndex` | Same stop id in the new position |
| `remove_stop` | `stopId` | Place goes to `unscheduledPlaceIds` |
| `add_place` | `placeId, date, index` | Selected, provider-backed place not yet scheduled |
| `replace_stop` | `stopId, placeId` | New stop id; old place becomes unscheduled |
| `set_stop_time` | `stopId, durationMinutes, notBefore` | Stores the intended length and optional earliest start; bookings refused |
| `refresh_place` | `placeId` | Re-reads the place's name, location and hours into its stops |

`add_place`/`replace_stop` may name any usable trip place; one planning did not include is selected in the same save.

Errors the UI must handle:

| Error | Meaning | UI |
| --- | --- | --- |
| `409 STALE_VERSION` | Someone saved a newer version (`details.currentVersion`) | Reload the itinerary, tell the traveler |
| `422 EDIT_REJECTED` | Would move/remove a booking, or make a locked booking unreachable (`details.conflicts`) | Show the conflicts; nothing changed |
| `409 INVALID_STATE` | No itinerary yet, selected place has no location, or already scheduled | Show message |
| `404 NOT_FOUND` | Stop id not in the current version | Reload |

## Rules (packages/planner)

- **Versions are immutable.** Every generate or saved edit creates version `n + 1`. `expectedVersion` must equal the
  current version, otherwise `STALE_VERSION`. Never silently overwrite.
- **Bookings keep their times.** Generation places them first; re-timing never moves them.
- **Re-timing** ([retime.ts](../../packages/planner/src/retime.ts)): in stop order, each non-booking stop starts at the
  later of *previous end + travel*, *its traveler-set earliest start* (`notBefore`) and *its opening time that day*.
- **Validation** ([validate.ts](../../packages/planner/src/validate.ts)) produces `Conflict`s:

  | Code | Severity | When |
  | --- | --- | --- |
  | `LOCKED_RESERVATION_UNREACHABLE` | error (warning if unlocked) | Previous stop + travel ends after a booking starts |
  | `LOCKED_RESERVATION_CHANGED` | error | An edit targets a booking stop |
  | `OVERLAP` | error | A stop starts before the previous one + travel ends |
  | `OUTSIDE_OPENING_HOURS` | error | Visit falls outside known opening windows |
  | `HOURS_UNKNOWN` | info | Hours unknown; plan becomes `partially_checked` |
  | `TRAVEL_UNKNOWN` | info | Missing origin/destination prevents checking arrival; plan becomes `partially_checked` |
  | `DAY_OVERFLOW` | warning | Stops end after the traveler's day end |
  | `PLACE_UNSCHEDULED` | warning | Selected places didn't fit |
  | `RESERVATION_OUTSIDE_TRIP` | warning | Booking date outside trip dates |
  | `VISIT_DURATION_TRUNCATED` | error | A visit cannot retain its required duration within the same calendar day |
  | `FAR_FROM_STAY` | warning | A day's first or last located stop is more than 25 km (straight line) from where the traveler sleeps; usually a place in another city, or a day trip |

- Each day starts where the traveler slept the night before and ends at that night's stay (`dayStays` in contracts); a
  hotel-change day starts at the old hotel and ends at the new one. AI prompt `itinerary-v8` receives one travel node per
  stay (`stays`) and `startStayNodeId`/`endStayNodeId` per date, and is told to build each day around those stays.
- `validationStatus`: `has_conflicts` if any error; else `partially_checked` if any hours or travel are unknown; else `valid`.
- Unknown travel is `travelMinutesBefore: null`, not zero. Provisional scheduling uses a lower bound without
  asserting reachability. Missing booking locations also make the next leg unknown; stationary breaks preserve
  the current location and use zero travel. All three views label unknown arrival checks.
- **Edit policy:** reject when an edit touches a booking, newly makes a locked booking unreachable, or newly truncates
  a visit at midnight. Other conflicts are saved and shown. The midnight rule prevents silent shortening to 23:59.
  Adding/replacing with a place already represented by a booking is also rejected as `INVALID_STATE`.
- Validation includes the first stop's travel from accommodation and the day start, and retains the latest prior end
  when bookings overlap. Booking times remain fixed even when the plan is infeasible.
- **Stale:** `inputFingerprint` hashes planner rules, destination, dates, timezone, preferences, provider ranking facts, displayed place/booking
  titles and source references at generation. Private booking notes do not affect planning. Edits keep the fingerprint,
  so an itinerary stays stale until regenerated. Exception: when the edit request itself changes a planning input
  (selects, copies, confirms or renames a place), an itinerary that was current before it is saved with the new
  fingerprint and stays current.
- Travel times are straight-line estimates (listed in `assumptions`); show them as estimates.
- Analytics: `plan_generated`, `stop_moved`.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| Generation | [generate.ts](../../packages/planner/src/generate.ts): feasible candidates ranked by priority, travel/wait and provider preferences; pace capacity (3/4/6), one break | Pilot evaluation and provider travel times (BE12, BE14) | Member 4 |
| Travel | Haversine × 1.3 at fixed speeds | Provider travel times if affordable; keep the estimate label | Member 4 |
| Edits | move/remove/add/replace with rejection rules above | Keep the contract; extend edit types only via a contract change | Member 4 (BE13) |
| Itinerary UI | Drag and drop, stop editor dialog, place picker, `dryRun` swap preview (24 Sep) | Better conflict display | Member 2 (FE09) |

## Fixtures

Ranking uses candidates waiting at most 90 minutes if any exist; otherwise it considers all feasible candidates.
Within that pool, must-visits rank first, followed by travel + waiting + soft preference penalties. Known prices above
the preferred level (low: 1, medium: 2, high: 4) add 30 minutes-equivalent per level; a category word matching an
interest subtracts 20. Ties use start time then place id. These are heuristic weights, not measured user preferences.
Unknown prices/categories remain eligible; budget is not a monetary cap. Grouping by area is not implemented.
The planner remains pure and its travel times remain estimates.

Reproduce the four fictional comparison fixtures with `npm run measure:planner -- <baseline-commit-hash>`;
see [results](../../evals/results/planner-comparison.json). These do not measure AI, lookup or retry costs.

`itineraryFixtures.valid`, `.partiallyChecked`, `.impossibleReservation`; `errorFixtures.staleVersion`, `.editRejected`.

## Acceptance checks

- [ ] Seeded trip: generate → locked dinner stays 19:30–21:00 on day 1; no place overlaps it.
- [ ] Moving a long stop before the dinner so it can't be reached is rejected with an explanation; the version doesn't change.
- [ ] Moving the dinner itself is rejected.
- [ ] Editing with an old `expectedVersion` returns `STALE_VERSION` (integration test "itinerary", `npm run smoke`).
- [ ] A place with unknown hours shows "Hours not checked" and the plan says "Partially checked".
- [ ] A venue closed on a date is not scheduled then, or is flagged if the traveler moves it there.
- [x] Local real UI/API/planner acceptance: confirmation persists, first generation appears in all three views,
  pending/rejected places are excluded, remove/add preserves the confirmed list, and new confirmations require
  regeneration. Eleven Chromium checks passed on 19 September; see [evidence](../../deliverables/evidence/confirmed-itinerary-2026-09-19.md).
- [ ] Planner unit tests cover normal day, unknown hours, locked booking and impossible day ([planner.test.ts](../../packages/planner/src/planner.test.ts)).

20 September 2026 My Trip UX v2: Edit day is adjacent to the day heading; Done, move Undo, Saving/Saved, rejection feedback and stale-version recovery use the existing validated edit API. Fixed bookings keep their locks. More retains Regenerate. Selected places open beside the day or in a modal sheet below 1100px. [Implementation and actual checks](../../deliverables/evidence/my-trip-ux-v2-2026-09-20.md) include native Next routing and controlled edit responses; the broader HTTP smoke stopped at import completion, so live end-to-end persistence is not claimed for this run.

20 September 2026 UI refresh: Both regeneration entry points for an existing itinerary now explain replacement of manual schedule edits in a native confirmation dialog. An informational update card replaces the persistent amber banner; reorder targets are 44 px. [Changes and actual checks](../../deliverables/evidence/navigation-refresh-2026-09-20.md).

24 September 2026 day editing: drag to reorder, stop editor (length and earliest start, rename, branch, swap), add from trip, saves, library or provider search. [Changes and actual checks](../../deliverables/evidence/trip-settings-and-day-editing-2026-09-24.md).

### Practical trip planning update (21 September 2026)

AI generation now accepts destination-only trips and uses flexible planned visit durations, neighbourhood
outings, meal blocks and explicitly unverified nearby suggestions. Pace/rest are soft preferences. Fixed
bookings, valid dates/IDs, known opening windows and non-overlapping schedules remain checked. Seasonal
advice is labeled model guidance, not a forecast. Suggestions do not become confirmed places or acquire
invented map coordinates. See [the current provider guide](../operations/itinerary-ai.md#practical-trip-planning-itinerary-v3).
20 September 2026 UI refresh and user follow-up: Both regeneration entry points for an existing itinerary explain replacement of manual schedule edits in a native confirmation dialog. A compact auto-fading warning replaces the space-consuming update card, while Review & regenerate remains beside Edit day; reorder targets are 44 px. [Changes and actual checks](../../deliverables/evidence/navigation-refresh-2026-09-20.md).

## Contextual nearby discovery (22 September 2026)

With real Google Places enabled, Generate uses dated weather and fits nearby meal/activity venues to the compiled timeline. Lunch searches prefer the next outing’s area. Preferences, budget, regular hours and estimated travel constrain selection. Provider outages keep provisional ideas; bookings stay fixed. Venue metadata remains a suggestion rather than creating a confirmed place. See [selection rules, configuration and limitations](../operations/itinerary-nearby.md). Acceptance covers lunch timing, travel rejection, radius/budget/hours, deduplication, weather dates/area, and offline fallback.


### Practical scheduling v6 (23 September 2026)

AI generation now uses a deterministic scheduler to recover omitted confirmed places and fit visits around
fixed bookings, opening windows, meals and estimated travel. Flexible model times are hints. Optional
`Itinerary.quality` is separate from validity and explains omitted places and practical trade-offs in the
owner's **Plan review** panel. Quality is recalculated after retrieval and edits; legacy plans remain readable.
A weak but valid draft survives failed optional repair. Suggestions and meal windows work without a nearby
provider, while actual venue retrieval still requires configured access. See [rules and verification](../../deliverables/evidence/itinerary-practical-v6-2026-09-23.md).

## Audit fixes (24 September 2026)

Confirmed worker, overnight-hours, midnight-duration, missing-coordinate and browser-harness fixes
are recorded in [implementation and acceptance evidence](../../deliverables/evidence/audit-bug-fixes-2026-09-24.md).
Live provider checks and independent human verification remain pending.

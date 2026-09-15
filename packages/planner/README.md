# Planning module

Owner: Member 4 (backend). Keep scheduling and validation independent of UI and model-provider code.

Start with a feasible itinerary for one city: visit duration, travel, available hours, breaks and fixed bookings.
A simple deterministic heuristic is acceptable as an initial team design; measure it before adding a solver.
Return conflicts and unknowns explicitly. Revalidate edits and preserve itinerary versions.

## Functions ([index.ts](src/index.ts))

| Function | Purpose |
| --- | --- |
| `generatePlan(ctx)` | Baseline greedy plan: bookings fixed, nearest open place that fits, pace capacity, one break |
| `applyEdit(current, edit, ctx)` | move / remove / add / replace, re-time affected days, reject booking changes and newly unreachable locked bookings |
| `retimeDay(day, ctx)` | Each stop starts at the later of previous end + travel and its opening time; bookings keep their times |
| `validatePlan(days, unscheduled, ctx)` | Conflicts and `validationStatus` |
| `planFingerprint(ctx)` | Detects stale itineraries |
| `toPlannablePlace(place)` | Confirmed candidate to planner input |

Pure functions: no I/O. The server loads inputs and saves versions in `apps/web/src/server/services/itinerary.ts`.
Rules and conflict codes: [F4](../../docs/features/F4-itinerary.md). Tests: [planner.test.ts](src/planner.test.ts).

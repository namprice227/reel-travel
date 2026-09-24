# Create-trip fit, calendar and one-city warnings (24 September 2026)

**Status:** implemented locally on `fix/create-trip-wizard`; offline browser checks pass. Not yet reviewed by a human,
and not checked on the live app (the running dev server needed a real sign-in).
**Tasks:** FE05 (create screen), FE04 (place selection). Frontend only: no contract, server, AI or planner change.

## Problems reported

1. All three create-trip questions looked squeezed in a short laptop window (about 1210×620 CSS px), and on questions 2
   and 3 the heading was drawn over the progress bar with the answer chips and kicker missing.
2. A typed city was never checked, and the product has one city per trip (multi-city planning is deferred in
   `docs/product/scope.md`), yet places from other cities entered a trip without any warning.
3. The calendar and date fields did not fit on one screen.

## Cause of (1)

`.ask-body` is the panel's scroll area in fit-to-screen mode (`globals.css`, from 921×600) and centred its content with
`justify-content: center`. When the question is taller than the panel, centring overflows both edges and the top part
cannot be scrolled to. Reproduced: with the previous `trips.css`, the new fit check fails with "step 1 heading starts
inside the panel at 1210x620".

## What changed

| Area | Change |
| --- | --- |
| Question panel | `justify-content: safe center`; earlier answers moved from the panel into the top row beside Back; short-window rules (`min-width: 921px` and `max-height: 820px`) tighten spacing, heading size, option padding and hide the kicker once answer chips show. |
| Dates | The calendar card carries a one-line summary (dates, days of up to 7, length bar). Typed date fields sit behind **Type dates instead**. Day cells are 28 px in short windows; the day circle uses `closest-side` so it fits any cell height. |
| City | Typed text is compared with the country's listed cities only: same name in any case/accent becomes that city; a small typo offers "Did you mean Kyoto?"; any other city is kept as typed with a notice that spelling cannot be checked yet. |
| One-city warning | `outsideTripCity` flags a place when every provider address for it leaves out the trip's city. Pick places and the Places page show **Address outside {city}**, a warning banner for flagged trip places, and neither auto-ticks nor "Select all" includes them; the traveler can still tick them. |

`outsideTripCity` is a text check on provider addresses, not validation: it can misfire when an address omits the city
name or uses another language, and it cannot see places that have no provider match yet. Source-based city extraction,
server-side flagging and planner exclusion are deferred (they need contract and server changes).

## Checks run

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, 785 tests including the 8 new ones, API docs check, planning validation) | PASS |
| `tests/integration/trip-city.test.ts` (new) | 8 tests PASS: exact/accents, typo suggestion, other cities unchecked, outside-city flag, any in-city branch keeps it, confirmed branch wins, typed "City, Country" destinations, nothing to compare |
| `tests/e2e/create-trip.mjs` (offline Edge, real `CreateTripPage` and CSS) | 9 checks PASS, including new: typo suggestion and case-insensitive listed city saved as `"Osaka"`; each question and a six-row month fit 1210×620 and 1536×760 with no inner scrolling, no clipped heading and a visible footer |
| `tests/e2e/saved-places.mjs` (offline, real `TripBuilder`) | 8 checks PASS, including new: places from Tokyo/Kyoto trips badged **Address outside Osaka** in an Osaka trip; the Osaka place is not |
| `tests/e2e/setup-date-sync.mjs` | PASS |
| `tests/e2e/my-trip-ux.mjs` | FAIL before reaching its checks with `process is not defined`; fails the same way on `main` without these changes, so the Places-page badge and "Select all" change are not browser-checked (only `outsideTripCity` is unit-tested) |

Not run: the live app (needs the user's sign-in), `npm run smoke`, keyboard-only and screen-reader passes, dark mode.
Screenshots are written locally to `.local/create-trip-browser/` and `.local/saved-places-browser/` (not committed).

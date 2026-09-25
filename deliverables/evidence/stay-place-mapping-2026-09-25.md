# Stay → Google place mapping (25 September 2026)

Branch `feat/stay-place-mapping`, from `home-popup` at `c04e798`. Requested by the user in a Claude Code session;
implemented by Claude Code (Opus 5.5). The user chose stay-picker design **1A** (search inside the row) and map design
**2A** (route starts and ends at the hotel) from three mockups each. Independent human review is **pending**.

## Problem

"Add your stay" saved only a hotel name and nights. The stay's `location` stayed `null` (unless coordinates were
typed in Trip settings), so the planner, the AI prompt and nearby suggestions, which already read
`stay.location`, planned every day as if the hotel were unknown.

## What changed

1. **Contract.** `Accommodation.place` (optional, absent when unlinked, so existing itinerary fingerprints do not
   change) holds the provider id, the search query, address, town, fit and the destination it was checked
   against. New `stays.suggest` (autocomplete while typing) and `stays.place` (facts and fit for a picked hotel, returning `StaySearchResult`) endpoints.
   New conflict code `FAR_FROM_STAY`. `dayStays()` in contracts.
2. **Checks against a city mismatch** (`packages/planner/src/stay-fit.ts`, thresholds are untuned starting points):
   - the hotel must be in the trip's country: always refused otherwise;
   - `inside` when the hotel's provider address names the destination (town, district, prefecture or country,
     compared without case, accents or "City"/"Prefecture"/"-to" suffixes), or it is in the provider viewport within
     15 km of the centre; otherwise up to 40 km from the centre is `nearby` and needs the traveler's confirmation,
     and further is `elsewhere` and refused. (The first version trusted the viewport alone; a live check showed
     Google's "Tokyo" viewport is the whole prefecture and contains Yokohama, so it was replaced.)
   - without a destination area only the country is checked (`unchecked`);
   - a linked hotel over 15 km (median) from the selected places shows **N km from your places**;
   - `validatePlan` warns `FAR_FROM_STAY` when a day's first or last stop is over 25 km from where the traveler sleeps.
3. **Server** (`apps/web/src/server/services/stays.ts`). `trips.update` looks the place up again (Place Details) for a new or changed link
   or a changed destination; the provider supplies location, address, town and fit, and browser-sent values are
   ignored. A destination change that strands a linked stay is refused. Unchanged links cost no provider call.
   Searches share the place-search limits. Destination areas are cached per server instance for 6 hours.
4. **Provider** (`packages/ai/src/google-stays.ts`): Places API (New) Autocomplete (session tokens, region code,
   location bias), Place Details and, for the destination area, Text Search, with `addressComponents` and `viewport`
   (country, town, city bounds) and English names. The existing
   result parser moved into `googleSearchOption()` with no behaviour change. `fake-stays.ts` holds four **synthetic**
   hotels and two synthetic area boxes. OpenStreetMap and `none` leave stays unlinked.
5. **Days start where the traveler slept.** Planner, scheduler, validation, retiming and nearby suggestions start a
   day at the night-before stay and end it at that night's stay (a hotel-change day starts at the old hotel; the
   departure day starts at the last hotel instead of nowhere).
6. **AI prompt `itinerary-v8`.** One travel node per stay (`stays`: name, town, located) and per-date
   `startStayNodeId`/`endStayNodeId`; told to build each day around where the traveler sleeps and never plan a day in
   a different city except as a deliberate day trip. Provider ids and queries are not sent. Stay names remain
   untrusted data.
7. **UI 1A, then type-ahead (user choice A after the first live test)** (`StayPlaceSearch.tsx`), in the builder's stay
   step and Trip settings: from three letters, Google Autocomplete suggests hotels in the trip's country biased to the
   city, with distance from the centre; picking one runs Place Details with the same session token and the fit check:
   **In {city}** links, **N km from {city}** needs **Use anyway**, **Not in {city}** / **Another country** grey out.
   Combobox keyboard support; "Google Maps" attribution under the list. No instruction copy was added. The first
   version's Find button and Text Search endpoint were removed.
8. **Map 2A** (owner views only): the route map and the day panel map run hotel → stops → hotel, with one bed-icon map
   button per hotel, Start/End rows and the estimated ride back. The shared-trip map does not show the hotel.

## Checks that actually ran

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, 857 vitest tests, `docs:api:check`, workspace validation) | PASS (see final run below) |
| `tests/integration/stay-places.test.ts` (9 tests: fit labels, linking with provider facts, other city/country refused, nearby needs confirmation, vanished result, unchanged link without a search, destination change re-check/block, no provider, trip country) | PASS |
| `packages/planner/src/stay-fit.test.ts` (15 tests: fit rules incl. antimeridian and centre-only areas, median distance, `dayStays` change/departure days, `FAR_FROM_STAY`, fingerprint unchanged for unlinked stays) | PASS |
| `packages/ai/src/itinerary.test.ts` per-day start/end stay nodes, prompt v8, no provider ids in input | PASS |
| Updated planner/proposal tests to the new "start at last night's hotel" rule | PASS |
| In-app browser, fake providers, synthetic data (port 3100): builder stay search, blocked rows, nearby **Use anyway**, linked state, save, **27 km from your places**, Trip settings search and layout (desktop and narrow), phone width 375 px (no horizontal scroll after a wrap fix), route map Start/End rows and single hotel button, day panel hotel rows, no console errors | PASS |

| `npm run test:e2e:offline` | `create-trip.mjs` PASS. `setup-date-sync.mjs`, `saved-places.mjs` and `my-trip-ux.mjs` FAIL **identically on untouched `home-popup`** (stale selectors after earlier UI simplification: dialog title "Settings", step label "Pick Places", day picker list text); not caused by this change and not fixed here |

Baseline before the change: 77 files / 833 tests PASS.

## Live Google check (dev server, real Places API, local file store, trip destination "Tokyo")

Run after the user reported "No matches" (the dev server was on the offline fixture provider, which only knows four
synthetic hotels). About ten paid Text Search calls in total.

| Query | Before the name-based fix | After |
| --- | --- | --- |
| intercontinental tokyo bay | InterContinental Tokyo Bay, inside | inside (Minato City) |
| hotel new grand yokohama | Hotel New Grand, **inside** (wrong: viewport too large) | nearby, 25.8 km (Yokohama) |
| hilton tokyo bay | not run | nearby, 21 km (Urayasu) |
| hilton osaka | elsewhere | elsewhere, 392.8 km (Osaka) |

### Type-ahead (live, same setup)

Typing "interconti" on the Tokyo trip listed five InterContinental hotels (Tokyo Bay 11 km, the Strings 10 km,
Yokohama Grand 24 km, Yokohama Pier 8 25 km, ANA InterContinental 8 km) with "Google Maps" attribution. Picking
Yokohama Grand showed **24 km from Tokyo** and **Use anyway**; picking Tokyo Bay linked at once and saving stored
Google's location, address and "Minato City" with fit `inside`.

## Not verified / pending

- Live results cover four Tokyo hotels only; other destinations (Bangkok, London, Singapore) are unchecked.
- The 40 km / 15 km / 25 km thresholds are untuned.
- Prompt `itinerary-v8` has not been benchmarked against v7 (`npm run benchmark:itinerary` not run).
- The shared map intentionally omits the hotel (privacy); owners see it.
- Supabase-backed run, hosted deployment and independent human review are pending.

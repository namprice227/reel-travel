# Trip settings dialog and richer day editing (24 September 2026)

Branch `feat/trip-settings-edit-day`, from `origin/main` at `daddbee`. Requested by the user in a Claude Code
session; implemented by Claude Code (Opus 5.5). Independent human review is **pending**.

## What changed

1. **Details tab removed; settings open in a dialog.** The `/my-trip/:tripId/setup` page is deleted. A gear button
   in the trip header opens **Trip settings** (Trip details · Stays & preferences · Fixed bookings · Delete trip)
   over the current trip page, driven by `?settings=<section>`. Old `/setup` and `/details` links redirect to
   `/itinerary?settings=details`; trip cards and the checklist link to the dialog. Sections stay mounted, so
   unsaved drafts survive switching. After a save, closing the dialog asks every mounted `useApi` to refetch
   (`invalidateApi`).
2. **Drag to reorder** (edit mode, `@dnd-kit`): drag handle on every movable stop; drop within the day or on another
   day in the rail (end of that day). Keyboard and touch sensors and screen-reader announcements included.
   Bookings are not draggable. Reuses `move_stop`.
3. **Edits may bring in unplanned trip places.** `add_place`/`replace_stop` accept any usable trip place; one not
   selected yet is selected in the same save. Freshness rule: an itinerary that was current before the request stays
   current; a stale one stays stale.
4. **Add or swap places** from This trip, Saved places (other trips and account library) or **Search**, through the
   new `itinerary.addPlace`. Saves are copied with their evidence; a branch the traveler picks is confirmed. Swaps to a
   trip place still use the dry-run preview. A stop editor (Edit button on each stop) holds time, name, branch, day,
   swap, note and remove.
5. **Length and earliest start**: new `set_stop_time` edit and `Stop.notBefore`; re-timing honours both.
6. **Search** (`places.search`, 20/min and 200/day per user): provider candidates only. Choosing one repeats the
   search on the server (client provider facts are never trusted), keeps the query as a text save
   (`Place search: …`) for evidence, and confirms that place. With `PLACES_PROVIDER=google` each search is a paid
   Google Places Text Search call.
7. **Rename / switch branch** via `itinerary.updatePlace`: `CandidatePlace.customName` is the traveler's label,
   kept apart from the provider's `selected.name` and preserved across branch changes. A new `refresh_place` edit
   re-reads title, location and hours into the place's stops.

## Checks that actually ran

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, 820 vitest tests, `docs:api:check`, workspace validation) | PASS |
| `npm run test:e2e:offline` (create-trip, setup-date-sync, saved-places, my-trip-ux; Edge headless) | PASS, including updated settings-dialog and stop-editor swap checks |
| `tests/integration/itinerary-edits.test.ts` (10 tests: selection, freshness, dry run, refusals, saved copy, branch, search, rename, branch switch) | PASS |
| `packages/planner/src/planner.test.ts` new `set_stop_time` cases | PASS |
| Local browser, file store + fake AI/places, synthetic Tokyo seed (`.local/dev-data-claude`) | Gear dialog open/switch/Escape; drag within day and to another day; add ambiguous place with branch; swap in a saved place from another trip; set 2 h from 13:00; search and add; rename + branch switch. `itinerary.get` reported `stale: false` after each edit |
| Phone width 375 px | Settings, stop editor and picker: no horizontal overflow (measured) |

The first rename/branch check in the browser ran against a dev server still holding old package modules and lost the
name; after a restart the flow passed. Itineraries saved during that window were regenerated.

## Not verified / limitations

- No live Google Places search was run; only the fixture lookup. Cost and quota behaviour with Google is unmeasured.
- No Supabase run. `customName` and `notBefore` live inside existing JSON documents, so no migration was added.
- If `itinerary.addPlace`/`updatePlace` copies a save or confirms a branch and the re-timed plan is then refused,
  the copy or branch choice remains (documented in the endpoint summary).
- `npm run seed` and `npm run seed:demo` currently stop with `RATE_LIMITED` (import request limit 10/min), so the
  local check used a partial seed plus manual confirmation and generation.
- Human usability review of the new dialogs and drag interaction is pending.

## Follow-up: AI suggestions mapped to Google listings; closable planning notes

- **Closable notes.** Seasonal planning and Weather outlook notes have a close button; dismissal is remembered
  in this browser per note text (localStorage, failures ignored).
- **Suggested activities grounded.** Root causes: generic "visitor attractions" query instead of the model's
  idea, meals using the two daily searches, rejection of listings without hours, 60-minute cap. Now each
  suggestion is searched by its own title and area; only a name-matching listing may ground it; unknown
  hours are allowed and labelled; separate meal/suggestion budgets (2 + 2 per day, 20 per generation).
  See [itinerary-nearby.md](../../docs/operations/itinerary-nearby.md).
- Checks run: `npm run check` scope — full vitest suite 824 tests PASS; new planner tests for idea queries,
  matching, unknown hours, refusing unrelated/city/closed listings and neighbourhood walks.
- **Live read-only probe** (3 Google Text Search calls, configured key, synthetic Tokyo anchor, nothing saved):
  "Stroll through Yanaka Ginza" matched *Yanaka Ginza* (no listed hours, previously rejected);
  "Visit the Tokyo National Museum" matched *Tokyo National Museum*; "Evening vintage-shop walk" in
  Shimokitazawa returned only individual shops and correctly stayed provisional. One-off observation, not a
  match-rate measurement. No full generation with OpenAI was rerun; existing itineraries change only on regenerate.

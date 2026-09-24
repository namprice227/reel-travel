# The trip workspace does its own work

**23 September 2026 update:** The user replaced the confirmation gate with tick-to-plan selection. The historical E-series confirmation designs below document the earlier implementation. Current behavior and acceptance are in [F2 Places](../features/F2-places.md).

**Status: E1 v2, E3 v2 and E7 are built (21 September 2026);** E4–E6 remain proposals. Scope: FE05
(`apps/web/src/features/trips`) and FE04 (`apps/web/src/features/places`), plus the itinerary shell where the plan
settings would live.

Built: [TripBuilder.tsx](../../apps/web/src/features/trips/TripBuilder.tsx) replaces `TripChecklist` for a trip
with no itinerary. One contract change went with it — `TripPreferences.accommodation` became
`accommodations`, an array, so a trip can change hotel part-way; `stayOn(stays, date)` in
[trip.ts](../../packages/contracts/src/trip.ts) picks the stay a day starts from, and the planner's three
starting-point reads use it.

Boards: the **E series** on the [design canvas](https://claude.ai/artifact/5qBjFKQTsnhYCNZS5NrxqB), row
*"/my-trip · DO THE WORK IN PLACE"*.

## The problem

`TripChecklist` is a dispatcher, not a workspace. Four steps, three of which leave the page:

| Step | Today |
| --- | --- |
| Save places | → `/inspiration-library?trip=:id` |
| Confirm places | → `/my-trip/:id/places` |
| Add your hotel | → Trip settings dialog, Stays & preferences (`?settings=preferences`) |
| Generate itinerary | in place |

Three different destinations, three different layouts, and the only way back is the browser. "Add a save" and
"Add hotel" landing on unrelated screens is the specific thing that reads as wrong.

## Revised 21 September: a builder, not four panels

Four expandable panels at once was still too much at once. A draft trip is now **a sequence**:

- **A planning-steps rail** on the left of the page — four numbered steps with their own sub-status, the current
  one highlighted. It replaces the four stacked panels.
- **One step's work in the middle.** Step 1 is *Add places* (renamed from "Save places"): one input that takes a
  reel link or a typed place name, a progress line, and a short "what happens next".
- **The places collected so far on the right**, always visible, scrollable, with a thumbnail, area and status
  each. **The map is gone from this screen** — it belongs on the Map tab, and it was taking the space the places
  list needed.

Boards **E1 v2**, **E3 v2** and **E7** supersede E1, E2 and E3 below; E4–E6 still hold.

Two things this model has to be honest about:

- **A typed place name is not an instant add.** It goes through `inspirations.create` and queues extraction like
  any other save, so the right-hand list must show it as still being read rather than appearing complete.
- **Thumbnails only exist once a place has a provider match.** Unconfirmed places fall back to the illustrated
  cover; the list must not look broken while they wait.

## The decision

Each step does its work where it stands:

- **Saves and hotel expand inline.** One field each; there is nothing to navigate to.
- **Confirming opens the existing sheet**, because evidence, options and photos need the room — but as a
  **queue**, with Next and Previous, not one place per open.
- **Plan settings come to the itinerary** as a popover. Only the preferences that change the days move; trip
  basics, cover and bookings stay in Details.

Nothing is deleted. The Places and Details tabs remain the full views; the workspace is the fast path.

## What each piece costs

| Piece | Endpoint | Cost |
| --- | --- | --- |
| Save composer inline | `inspirations.create` | **Very low** — `SaveComposer` already has a compact `variant="bar"` taking `trips` and `defaultTripId` |
| Hotel inline | `trips.update` | **Very low** — one field into `preferences.accommodation` |
| Bulk confirm | `places.confirm` | Medium — a loop over places that have exactly one option |
| Confirm sheet as a queue | `places.confirm` | Medium — reuses the `PlaceDetailsSheet` pattern |
| Plan settings popover | `trips.update` | Low — then the existing stale notice and regenerate dialog take over |

## Two constraints that shape the design

**1. A place cannot be un-confirmed.** The endpoints are `places.confirm` and `places.reject`; there is no way
back to pending. So bulk confirming must be **preview then apply** — show the list of what is about to be
confirmed and let the traveler press the button — not apply-then-undo. An undo toast would be a promise the API
cannot keep. Adding an un-confirm endpoint is Member 3's call and would let the toast exist.

**2. The AI does not choose the match.** `ConfirmPlaceInput` requires a `providerPlaceId`
*"even when only one option exists"*, `places.verify` states "do not auto-confirm", and US-02's acceptance is that
an ambiguous branch requires confirmation. Traceable matches are named in [scope](../product/scope.md) as the
product's differentiator.

What is allowed, and gives most of the speed:

- the likeliest option is **pre-selected** and labelled a suggestion, with the excerpt it came from beside it;
- **"Confirm these N"** handles every place that has only one option, after showing the list;
- nothing is ever written without the traveler pressing something.

## The boards

| Board | What it shows |
| --- | --- |
| **E1 v2** | Step 1 *Add places*: steps rail, one input, collected places on the right, no map |
| **E3 v2** | Step 2 *Confirm places*: one scrollable list where a row opens in place to show its evidence and options |
| **E7** | Steps 3 and 4: the hotel field, then a summary and one button |
| ~~E1, E2, E3~~ | Superseded by the three above; kept on the canvas for comparison |
| **E4** | The confirm sheet as a queue: evidence, options, pre-selected best match, Next/Previous, "3 of 9" |
| **E5** | Plan settings popover on the itinerary, with Save & replan |
| **E6** | What moves and what stays, per surface, with its endpoint and constraint |

## Build order

1. **E1 v2 — the builder shell and step 1.** The steps rail, the add input, the places list on the right.
2. **E5 — plan settings popover.** Low cost, and it removes the jump to Details.
3. **E3 v2 — the confirm list.** The largest time saving for a real trip, where most places have one match.
4. **E7 — steps 3 and 4.** The hotel field and the summary; small once the shell exists.

None of these needs a contract change.

## Rules to hold

- **One row open at a time** in the confirm list, so the page never scrolls unpredictably.
- **A failed save is recoverable here.** If a save cannot be read, the reason and the add-details field belong in
  the inline list, not back in the library.
- **The excerpt is never hidden.** A dropdown of bare place names would be faster and would break US-02.
- **Plan settings never save silently.** Changing pace or transport makes the saved days out of date; the popover
  says so and offers the replan, reusing the existing dialog.
- **One confirm path.** The sheet and the Places tab must call the same endpoint and show the same evidence, or
  they will drift.

## Open questions

- **Un-confirm** — Member 3. Without it, bulk confirming has no undo, only a preview.
- **Bookings** — a fixed booking is really a locked stop on a day. Moving them onto the itinerary was considered
  and deferred; they stay in Details for now.
- **What "best match" is allowed to claim.** Pre-selecting is fine; the label has to be supportable. If there is
  nothing real behind the ranking, it should say "Only option found" rather than "Best match".

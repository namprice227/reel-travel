# /my-trip for a new user — the design

**Status: proposal, 21 September 2026. Nothing here is implemented.** Design and user stories only; no contract,
screen or provider change has been made for it.

**Scope.** FE05 (`apps/web/src/features/trips` — the trip list, create and setup) and FE04
(`apps/web/src/features/places`). Home and the save composer belong to another owner and are treated here only as
the surface this flow hands off to and returns from.

**Assumption.** Home can accept a reel from an account with no trips. Everything below is designed on that
assumption; what it means for `/my-trip` is spelled out under "What Home's change implies" — it is not free.

Boards: the **D series** on the [design canvas](https://claude.ai/artifact/5qBjFKQTsnhYCNZS5NrxqB), row
*"/my-trip · THE DESIGN"*. Earlier rows (**M**, **U**) are the options this was chosen from, kept for context.

## The one idea

> **The trip card carries its own state.**

Everything a new user needs to be told is a property of their trip — it has no saves, or its saves are still being
read, or nine places are waiting to be confirmed, or it has no dates. So the card says that, and offers the one
action that follows. There is no separate panel, nothing to dismiss, and nothing that behaves like a lesson.

This matters because the My Trips spotlight tutorial was reverted on 21 September at the user's request
([evidence](../../deliverables/evidence/my-trip-onboarding-2026-09-21.md)); the recorded ask was that onboarding
come from Home and not force a trip-creation lesson. A status on a card is not onboarding — it is the trip
reporting on itself, and it behaves identically for someone on their twelfth trip.

## The constraint that shapes everything

A save is a child of a trip: `POST /api/trips/:tripId/inspirations`, `Inspiration.tripId` required. A trip needs
`title`, `destination`, `timezone`, `startDate` and `endDate`, all required, at most `MAX_TRIP_DAYS` (7).

So `/my-trip` cannot let saves come first. What it can do is make a trip cost almost nothing and then be honest
about what the trip is still missing. That is the whole design.

There is also no account-wide list of saves — `inspirations.list` is `GET /api/trips/:tripId/inspirations` and
nothing else. An account with no trips has no saves by construction, so `/my-trip` can never branch on "do they
already have reels?" at the account level. It branches per trip instead, which is exactly what D2 does.

## The screens

| Board | Screen | What it is |
| --- | --- | --- |
| **D1** | `/my-trip`, no trips | The empty state *is* the form: a country grid, a suggested name, one button |
| **D2** | `/my-trip`, one trip | The progress card in each of its states |
| **D3** | `/my-trip/new` | Country and name; dates deferred; primary button carries on to a reel |
| **D4** | `/my-trip/:id`, empty | Three lanes — Saves, Places, Days — with one action between them |
| **D5** | `/my-trip/:id`, saves landed | The return: what changed, and the next thing |
| **D6** | — | Every state, its condition, its copy and the call it is read from |

### D1 · `/my-trip` with no trips

The only thing an empty account can do here is make a trip, so do not make them click through to a form to do it.
Country grid, a name suggested from the country, and one button. Two escapes stay visible: **Open the full form**
(for dates, or a country not on the grid) and **Start from a reel instead**, which is the link to Home.

### D3 · `/my-trip/new`

Country, a suggested name, and `When: I'll decide later | Pick dates`. **City is not asked for** — it comes from
the first confirmed place. Timezone derives from the country. The primary button is
**Create and add a reel**, which creates the trip and continues to `/inspiration-library?trip=:tripId`; the
secondary is **Create, I'll add saves later**.

### D2 · the progress card

Replaces neither `NowCard` nor `ComingCard` — it is a third card, used for a trip that is not schedulable yet
(no dates, or no confirmed places). Status badge, three beads, one line of fact, one primary action.

### D4 / D5 · the trip page

Three lanes: **Saves → Places → Days**. Each shows a count, one sentence about why it exists, and either one
action or what it is waiting for. Lanes are never disabled — a waiting lane still explains itself and stays
clickable. On the return (D5), a banner states what came back, and the Saves lane lists the actual saves with
their own statuses, including one that failed.

## Every state

The full table is D6. In short, and in priority order:

| Condition | Status | Action |
| --- | --- | --- |
| no trips | — | Create trip (D1) |
| no saves | Needs saves | Add your first save |
| any save `queued`/`processing` | Finding places | See what we found |
| any save `failed`/`needs_input` | 1 save needs you | Fix it |
| unconfirmed places > 0 | N places to confirm | Confirm places |
| confirmed > 0, no dates | Ready for dates | Add dates |
| dates, no itinerary | Ready to plan | Plan the days |
| itinerary exists | Itinerary saved | Open itinerary (today's card) |

Two rules that make it honest:

- **Nothing is stored.** No `onboarded` flag anywhere. Every row is derived from `trips.list`,
  `inspirations.list` and `places.list`, so the card cannot claim progress the trip does not have.
- **A save is not a place.** Saves still queued or processing must not be counted toward places, or the card
  promises matches that may never arrive.

And two that keep it affordable:

- **Only the focus trip gets the extra calls.** The overview loads `trips.list` today; fetching saves and places
  for every trip is two more requests each. Render the progress card for one trip — the one needing attention
  soonest — and leave the rest on today's card.
- **Render nothing until both calls answer.** A card that flashes "Needs saves" before the saves load is worse
  than a slower card.

## What Home's change implies

If Home can take a reel from an account with no trips, Home must be creating a trip to hang it on. So `/my-trip`
must expect a trip it did not create:

- it may have a name and destination chosen by Home's inference rather than by the person;
- it will already contain saves, possibly still processing, the first time it is ever seen here;
- it will have no dates.

D2 covers all three — the card reads state from data, not from how the trip was born. The one thing worth agreeing
with the Home owner is **which field carries the destination**, since `Trip.destination` is a free string today and
the country grid in D1/D3 would be writing something more structured into it.

## Build order

1. **D1 + D3** — the cheap create path. Blocked on nullable dates (below).
2. **D2** — the progress card. UI only.
3. **D4 + D5** — the trip page lanes and the return banner. UI only.
4. **D6** — the state table is the acceptance checklist, not a screen.

Steps 2–4 need no contract change and could ship before step 1.

## The one contract change

`Trip.startDate` and `Trip.endDate` nullable while `currentItineraryVersion` is null. Needed by D1, D3 and the
"Ready for dates" state.

Do not fake dates instead. Defaulting to "next month, three days" writes an invented fact into the record and puts
a wrong "Draft · starts in 30 days" on the card, which [scope](../product/scope.md) forbids. It also breaks sorting
on the overview and `/my-trip/all`, which order by `startDate`.

Touched by the change: `tripGroup` and `tripStatusLabel` ([trip-dates.ts](../../apps/web/src/lib/trip-dates.ts))
need a "no dates yet" branch rather than computing from `startDate`; the trip card, the all-trips row and the
planner's preconditions each need the same. This is Member 4's call.

## User stories

Numbered `US-N*` so they do not collide with `US-01`–`US-08` in [scope](../product/scope.md).

| Story | Acceptance condition |
| --- | --- |
| **US-N1** A trip costs one decision | A first trip can be created from a country alone. No field a person without a plan cannot answer blocks creation. |
| **US-N2** Dates come last | A trip can exist with no dates. Card, header and status say "no dates yet" rather than computing from an invented start, and planning states plainly that it needs them. |
| **US-N3** The card says what is next | For a trip that is not schedulable yet, the card shows its state and exactly one primary action, both derived from real data. |
| **US-N4** The handoff is scoped | Adding a save from a trip opens the library already scoped to that trip, so the save cannot land somewhere else. |
| **US-N5** The return is visible | Coming back after saving shows what changed, read from that trip's own saves and places. Returning empty-handed says so plainly and offers the library again. |
| **US-N6** Failures are their own state | A save that failed is never folded into the place counts. It gets its own status and its own action. |
| **US-N7** Nothing is a tutorial | No overlay, scrim, spotlight or focus lock anywhere in the first session, and no lane or action is disabled to enforce an order. |
| **US-N8** Nothing is stored | No onboarding flag. Every state is derivable, and the same card behaves identically on a twelfth trip. |

## Open questions

- **Nullable dates** — Member 4. Blocks D1 and D3.
- **The destination field** — what Home writes into `Trip.destination`, and whether the country grid should write
  a country code alongside it.
- **Polling on the overview** — F1 polls the library every 1.5 s while a save is queued. The overview card needs
  the same while it shows "Finding places", and must stop when it leaves that state.

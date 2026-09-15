# F2 Places: confirm traceable matches

**Story US-02 acceptance:** a candidate includes source evidence and coordinates; an ambiguous branch requires
confirmation; duplicates merge safely.
**Owners:** UI and map Member 1 (FE04) · lookup and matching Member 3 (BE03) · reviewer Member 4
**Screen:** `/my-trip/:tripId/places` · code in `apps/web/src/features/places`

## User flow

1. The screen groups candidates: **Choose the right branch**, **Confirm matches**, **No match found**, **Confirmed**, **Rejected**.
2. Every card shows why it was suggested: the quoted excerpt, the source type and the clue that was looked up.
3. Pending (one option): Confirm or Reject. "Confirm all single matches" confirms every pending card.
4. Ambiguous (several options): pick one radio option, then Confirm selected. Nothing is chosen for the traveler.
5. No match: Reject, or go back to the Inbox and add details to the save.
6. The map shows confirmed (green), pending (amber) and every branch option (purple).

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Load | `places.list` | Optional `query.status`. |
| Confirm / pick branch / restore | `places.confirm` | Body `{ providerPlaceId }` must be one of `options`. Returns `mergedPlaceIds`. |
| Reject | `places.reject` | Evidence is kept. |

## States

| `status` | Meaning | Planner uses it? | UI actions |
| --- | --- | --- | --- |
| `pending` | One option found | No | Confirm, Reject |
| `ambiguous` | Two or more options | No | Choose option + Confirm, Reject |
| `not_found` | No options | No | Reject; add details to the save |
| `confirmed` | `selected` is set | **Yes** | Reject |
| `rejected` | Ignored | No | Restore and confirm |

## Server rules

- Only `places.confirm` makes a place usable by the planner. `not_found` can't be confirmed (`409`).
- On confirm, other non-rejected places that resolve to the same `providerPlaceId` are merged into the confirmed one:
  their evidence is appended, bookings and must-visit ids are repointed, and they are deleted.
- After confirm or reject, each affected save's status is recomputed (`needs_confirmation` → `ready`).
- Opening hours, address and coordinates come from the place provider (`PlaceDetails`), never from model text.
  Unknown fields are listed in `unknownFields`; show them as unknown.
- Analytics: `place_confirmed`.

## What the base does, and what to replace

| Piece | Now | Replace with | Owner |
| --- | --- | --- | --- |
| `PlaceLookup` | [fake-lookup.ts](../../packages/ai/src/fake-lookup.ts) over 17 fictional Tokyo venues | Real provider adapter (DEC-05), respecting its terms and attribution | Member 3 (BE03) |
| Matching | Exact group/name match, branch hint within 40 chars | Measured matching and dedupe (BE03, BE05) | Member 3 |
| Places UI and map | Cards, radios, Leaflet + OpenStreetMap tiles | Designed review flow and map with source details | Member 1 (FE04) |

## Fixtures

`placeFixtures.confirmed`, `.mergedDuplicate`, `.ambiguousBranch`, `.pendingUnknownHours`, `.notFound`.
Seed data includes an ambiguous "Kumo Ramen" and a not-found "Nowhere Bar".

## Acceptance checks

- [ ] "Kumo Ramen" stays `ambiguous` with two options until the traveler picks one (integration test "place confirmation").
- [ ] Confirming "Kumo Ramen Shinjuku" merges a separate "Kumo Ramen Shinjuku" candidate, keeping both saves as evidence.
- [ ] Every card and map popup shows at least one source excerpt or source type.
- [ ] Rejected places never appear in a generated itinerary.
- [ ] Fixture data is labeled "sample data" wherever it's shown.

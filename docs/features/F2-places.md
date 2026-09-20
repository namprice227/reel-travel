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
7. A saved-confirmation count and **Plan itinerary** link lead to the itinerary page's confirmed-place list.
   Use **Generate itinerary** to schedule it; confirmation alone does not rewrite an existing plan.

## Endpoints

| UI action | Endpoint | Notes |
| --- | --- | --- |
| Load | `places.list` | Optional `query.status`. |
| Confirm / pick branch / restore | `places.confirm` | Body `{ providerPlaceId }` must be one of `options`. Returns `mergedPlaceIds`. |
| Reject | `places.reject` | Evidence is kept. |
| Verify location | `places.verify` | Queues lookup for an existing unverified candidate; `202` with a job. `places.list.verificationJobs` supplies progress. |

## States

| `status` | Meaning | Planner uses it? | UI actions |
| --- | --- | --- | --- |
| `unverified` | LLM source extraction; no lookup performed | No | Verify location, Review evidence, Reject |
| `pending` | One option found | No | Confirm, Reject |
| `ambiguous` | Two or more options | No | Choose option + Confirm, Reject |
| `not_found` | No options | No | Reject; add details to the save |
| `confirmed` | `selected` is set | **Yes** | Reject |
| `rejected` | Ignored | No | Restore and confirm |

## Server rules

- Only `places.confirm` makes a place usable by the planner. `unverified` and `not_found` cannot be confirmed (`409`).
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

## OpenStreetMap location search (selected 2026-09-19)

`PLACES_PROVIDER=openstreetmap` uses Nominatim, persisted cache and a shared four-request/minute gate.
At most ten distinct clues are searched per import; larger imports ask for a shorter source before lookup.
Type-qualified OSM IDs preserve separate branches. Returned names/addresses/coordinates and attribution stay
with provider options; hours, prices and visit duration remain unknown. User confirmation is still required.
Existing Leaflet maps accept OSM results and shared views retain attribution. [Setup and limits](../operations/openstreetmap.md).

## Optional Google Places integration

`PLACES_PROVIDER=google` uses Text Search (New), preserving returned branches and provider facts. Existing pending/ambiguous/not_found states and explicit confirmation apply; confirmed places use the existing planner. Additional excerpts from repeated same-save clues are retained. Provider attribution is retained in SharedPlace via optional fields. Google-backed map previews show attributed text pending a Google Maps renderer. Live verification and production retention/refresh remain pending. [Setup](../operations/google-places.md).

## Optional extraction-only behavior (`PLACES_PROVIDER=none`)

When lookup is disabled, imports stop before lookup. The **Extracted places** group displays `unverified` names and
source-supported `evidence.hint` context. Empty options mean coordinates and provider facts are absent,
not that a search found no match. These candidates have no confirm action or map marker and never enter
the planner. Existing provider-backed records and offline fixture flows remain compatible.

## Verify an existing extracted place

The **Verify location** button queues a `verify_place` job for the saved clue, source hint and trip destination.
It does not rerun transcription or LLM extraction. Queued/running work disables the button and survives reload;
the page polls every three seconds while work is active. Provider failure keeps the candidate unverified and
offers another attempt. No match moves it to `not_found`; one/multiple options move it to `pending`/`ambiguous`.
The traveler still confirms the match. Evidence and candidate ID remain intact.

Only the trip owner can queue or read progress. Concurrent clicks reuse one active target. Requests have
separate account limits of 10/minute and 30/fixed day; retries count, and racing submissions may each consume
quota even when they reuse a job. There is one lookup attempt per job; retry is explicit. These jobs also count
toward active work when submitting a new import. The shared OSM gate/cache applies to all actual searches.

Results use an atomic compare-and-update of the complete candidate so in-flight lookup cannot overwrite a
rejection, deletion or newly appended evidence. A changed candidate stays as it is and may be verified again.
The existing job table, active-target unique index, claim and settlement RPCs support this; no new migration.
Deploy matching web/worker code before exposing this new job kind. The local worker must be running.

Acceptance: [verification evidence](../../deliverables/evidence/place-verification-2026-09-19.md).

## Transactional merge follow-up

The current multi-write confirmation/merge can leave dangling references after a failed update. Member 3 BE03
and Member 4 database support should follow [issue #9](https://github.com/namprice227/reel-travel/issues/9) and the
[concrete transaction proposal](../operations/member3-transactional-merge.md). This is outstanding work; current
happy-path confirmation tests do not establish rollback safety.

## Source classification (20 September 2026)

OpenAI extracts a country and category per clue in the same request as the place name and evidence.
Country is an ISO code only when explicitly supported by a cited source passage; a city, cuisine or trip
context alone does not establish it. Categories are food, attraction and other; missing support stays null.
Both labels carry literal source quotes in optional Evidence.classification with source=ai. Older records
remain valid. These are AI suggestions, separate from Google facts and user confirmation.

The library uses these country labels for albums and Food & drink / Attractions / Other / Unsorted filters.
A multi-country save appears once in the overview and in each relevant country album; album categories
only reflect places from that country. New unknown labels stay Unsorted; older saves retain their existing
trip/provider-based organization. Place cards show AI provenance and each label's evidence. Re-import
updates source labels without removing a user's confirmed selection. Existing saves are not backfilled.

[Acceptance evidence](../../deliverables/evidence/source-classification-2026-09-20.md).

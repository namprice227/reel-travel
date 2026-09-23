# F8 Saved places: a shelf that outlives a trip

**Goal.** A traveller keeps things for months before they book. Today a save and the place it produces are
owned by a trip, so a returning traveller starts every trip empty even though they have eleven places saved in
Japan. This makes the first step of planning **"pick from what you already saved"**, with adding something new
as the add-on.

**Status.** Phase 1 implemented locally on 21 September 2026. On 23 September, the user requested account-owned reels from Home. On 24 September, the Inspiration Library switched to the extracted places from those account reels, grouped by source-supported country, and those places became reusable from the trip picker. The full Phase 2 migration for all source types and account-level trip membership remains deferred.
**23 September update:** The trip picker now includes unresolved saved candidates from trips. `places.copy` preserves their unconfirmed status, options and evidence, and `copiedFromPlaceId` keeps repeat copies idempotent. The confirmation-only picker rules below describe the original Phase 1 design and are superseded by [F2 Places](F2-places.md) for the current trip flow. The full account-level shelf migration remains deferred.
**23 September deletion update:** `listSavedPlaces` keeps one representative per original idea; if the original place or trip is deleted, a surviving copy remains reusable. Source-save links from a deleted trip explain that the source is unavailable. [Evidence](../../deliverables/evidence/delete-saved-data-2026-09-23.md).
[Acceptance evidence](../../deliverables/evidence/f8-saved-places-phase1-2026-09-21.md). Design: [the shelf](../design/saved-places-shelf.md); canvas
<https://claude.ai/artifact/5qBjFKQTsnhYCNZS5NrxqB>, row **"THE SHELF"** (`S1-shelf`, `S2-pick-saved`,
`S3-model`).
**Screen.** `/home` saves reels to the account and shows their source, status and recovery controls. `/inspiration-library` shows the extracted place ideas, grouped by country; reels themselves remain source evidence in the place drawer. The trip picker includes account-reel places whose source-supported country matches the trip.

### 23 September account reel slice

- `accountReels.create/list` persist owner-scoped links and source-backed ideas independently of trips. A new database migration creates dedicated account reel, place and job tables. The dedicated worker polls both trip and account jobs.
- Public YouTube Shorts use the existing Gemini observation and OpenAI structured extraction stages. When the source supports a country, each extracted account place is automatically searched through the configured Places provider and retains the returned address and coordinates as unconfirmed candidates. Missing country evidence stays `unverified` instead of triggering a global guess. Other social links remain saved with `SOURCE_INACCESSIBLE` recovery status and accept traveler-supplied names or caption for text extraction.
- Deleting a trip does not delete an account reel. Trip-scoped imports remain available. Selecting an account idea in the trip picker creates a trip candidate, preserves its unconfirmed Google options and copies the reel URL into a trip-owned source record. `copiedFromAccountPlaceId` keeps repeat additions idempotent and the copied evidence remains openable after the account reel is deleted.
- `AccountPlace.country` stores an ISO code plus the literal source excerpt. Country albums use this evidence only: a source-named country, or a source-named city on the supported-destination list (the city is the excerpt). Missing evidence stays in **Unknown country**. `mappingStatus` and `options` keep automatic provider results separate from source evidence and traveler confirmation. Mapped Google candidates load a fresh place photo with Google and photographer attribution; ambiguous ideas label the first-ranked photo as a possible match. Unmapped or photo-less ideas retain labelled illustrative artwork. The detail drawer shows candidate addresses and the Google map.
- Account-place photos use the owner-scoped `accountReels.placePhoto` endpoint. The server verifies that the provider ID belongs to the saved reel place before making a paid request, shares the existing 60/minute and 300/day photo limits, and does not persist expiring photo URLs or resource names.
- The Library calls `accountReels.mapPlaces` for older account places that have country evidence but predate automatic lookup. The owner-scoped repair runs once per reel when its country album opens and persists the candidates.
- The Supabase migration must be applied before deploying the matching web/worker code. Offline synthetic checks cover account isolation and idempotent copy; hosted migration and live provider quality have not been verified.
**23 September 2026:** `AddPlacesStep` was replaced by `PickPlacesStep`, one table that lists this trip's places and same-country saved places and copies ticked saved places on Continue. References to `AddPlacesStep` and the four builder steps below describe the Phase 1 build. [Evidence](../../deliverables/evidence/create-trip-redesign-2026-09-23.md).
**Owners.** Phase 1: UI Member 1, server Member 3. Phase 2 adds Member 4 (trips, storage, sharing, migration).

---

## 1. Rules that override anything below

Breaking one of these is a failed task, not a trade-off.

1. **A place can never be invented.** `CandidatePlace.evidence` is `min(1)` and every `Evidence` carries an
   `inspirationId`. Every place traces to something the traveller put in. Suggesting places for a country is
   the deferred US-08 discovery feature and is **not** part of this.
2. **Evidence must stay openable while its source trip exists.** If a place is copied or referenced from elsewhere,
   the save its evidence cites remains readable by that traveller. A later owner-requested deletion of the source
   trip permanently removes its saves; surviving copies keep their extracted clues, and opening that source link
   shows an unavailable-source message. This explicit deletion exception was added on 23 September 2026.
3. **Automatic route choices are not traveler confirmations.** `ConfirmPlaceInput` still requires a provider ID for legacy confirmation calls; the current picker saves traveler intent with `places.select` and keeps automatic provider choices on itinerary versions.
4. **Sharing must never widen.** See task **P2-D**. A shared link must expose only the places the trip
   references, never the account's shelf.
5. **A contract change starts in `packages/contracts/src`**, then `npm run typecheck` lists every site,
   then fixtures, tests, and `npm run docs:api` with the regenerated `docs/api/endpoints.md` committed.
   Handlers stay thin; rules live in `server/services`.
6. **Prefer adding optional fields to renaming required ones** while others are building on them.
7. **`npm run check` must pass** before a task is called done, and each acceptance check below needs a test or
   a recorded manual run.

## 2. What already exists — do not rebuild it

| Thing | Where | Use it for |
| --- | --- | --- |
| `unverified` status | `PlaceStatus` in `packages/contracts/src/place.ts` | A place with no location yet. A shelf save with no country lands here. |
| `places.verify` | `packages/contracts/src/api.ts` | "Queue location-only lookup for an unverified place." Exactly what a shelf place needs when a trip finally gives it a country. |
| `SourceClassification.country` | `packages/contracts/src/place.ts` | A country code **with the excerpt supporting it**, per clue. This is the lookup context for a save with no trip. |
| `TripBuilder` step 1 | `apps/web/src/features/trips/TripBuilder.tsx` | The add box and the right-hand list already work. **Extend `AddPlacesStep`, do not replace it.** |
| `useApi(..., { pollMs })` | `apps/web/src/lib/use-api.ts` | Polling while saves are queued. Already used by the builder. |
| Country grouping | `apps/web/src/features/library/library-model.ts` | Reuse the country names and aliases. **Note:** it currently derives the country from the *trip's* `destination` string and says so ("transitional… not AI/geocoding"). Phase 2 switches it to the save's own classification. |
| Offline render harness | `tests/e2e/trips.mjs`, and `.local/render-builder.mjs` | Render real components with synthetic responses. Copy the pattern rather than starting a server. |

## 3. Phase 1 — reuse, without moving anything

No migration, no storage change. Ships board **S2** on its own.

### P1-A · An account-wide read of confirmed places · Member 3

Add a way to list the places a traveller has already confirmed, across all their trips. Either a new endpoint
or a scope on the existing one; keep the response shape `CandidatePlace[]` so the UI reuses its types.

- Owner-only. A traveller must never see another account's places.
- Confirmed places only for this task. Unconfirmed ones are noise in a picker.
- Include which trip each came from, so the UI can say "saved on your Tokyo trip".

**Acceptance:** a request from account A never returns a place belonging to account B, proven by a test; the
list returns places from more than one trip; `npm run docs:api` regenerated.

### P1-B · Keep the evidence openable · Member 3

A place picked into a new trip cites an `inspirationId` owned by a different trip. Pick one:

- copy the save alongside the place, so the new trip owns its own copy; **or**
- allow `inspirations.get` to read a save by id for its owner, without the trip in the path.

Whichever is chosen, opening "where did this come from" on a picked place must work.

**Acceptance:** a test opens the evidence of a place picked from another trip and gets the original words back;
a request for a save belonging to another account is rejected.

### P1-C · Copy a place into a trip · Member 3

A service that takes place ids from P1-A and creates them in the target trip: the place, its `selected` option,
and its evidence.

- **Idempotent.** Picking the same place twice must not create two rows — merge, exactly as confirming already
  merges places that resolve to the same provider place.
- The copy keeps `status: "confirmed"` and its `selected` option. The traveller already made that decision;
  asking again is the thing this feature exists to remove.
- Do not copy rejected places.

**Acceptance:** picking N places adds exactly N to the trip; picking one twice leaves one; the copy's
`selected.providerPlaceId` equals the original's; a test covers the merge case.

### P1-D · The picker in step 1 · Member 1

Extend `AddPlacesStep` in `TripBuilder.tsx`, per board `S2-pick-saved`:

- A list of the traveller's confirmed places, **filtered to this trip's country**, each a checkbox row with its
  name, area and when it was saved.
- "Select all" and "Add N to this trip".
- The existing add box moves **below**, behind a "Not enough? Add something new" disclosure.
- **Day one:** an account with nothing saved shows no picker at all and the add box leads, as it does now. The
  emphasis flips on data, never on a setting.
- Picked places appear in the right-hand column immediately, already confirmed.

**Acceptance:** with no saved places the screen is unchanged from today; with saved places the picker leads and
the add box is collapsed; adding 4 puts 4 in the right column; the country filter excludes places saved in
another country; no horizontal overflow at 1280, 768 and 390.

## 4. Phase 2 — the shelf itself

Contract, storage and migration. Do **not** start this before phase 1 is merged.

### P2-A · The contract · Member 4 + Member 3

- `Inspiration.tripId` and `CandidatePlace.tripId` become nullable. The field keeps its name and now means
  *where it was first saved*, not who owns it.
- `Trip` gains `placeIds: Id[]` — the places this trip uses. This is the authoritative membership.
- Add account-level list and create endpoints for saves, and an account-level list for places.
- Add endpoints for a trip to reference and unreference a place.

**Acceptance:** `npm run typecheck` clean; fixtures updated; `docs/api/endpoints.md` regenerated and committed;
a test creates a save with no trip and gets a place back.

### P2-B · Storage and migration · Member 4

Every repository method today is `listByTrip`. Add the account-scoped reads, and migrate:

- every existing place id joins its trip's `placeIds`;
- existing `tripId` values are left as they are.

**Acceptance:** after migration every trip returns exactly the places it returned before, proven against seeded
data; the migration is re-runnable without duplicating ids.

### P2-C · Lookup without a trip · Member 3

`PlaceLookupContext` requires a `destination`, which comes from the trip. For a shelf save, take the country
from `SourceClassification.country` on the clue.

- No country in the save → the place stays `unverified`. Do not guess one.
- When a trip later references it, `places.verify` runs the lookup with the trip's destination.

**Acceptance:** a shelf save naming a country resolves to a place with a location; one naming no country is
`unverified` and has no coordinates; verifying it inside a trip resolves it.

### P2-D · Sharing must not widen · Member 4 — **this one is a leak, not a task**

`server/services/shares.ts` reads `places.listByTrip(trip.id)`. Once places are account-level that returns more
than the trip. It must read the trip's `placeIds`.

**Acceptance:** a test creates two trips and a shelf place referenced by only one, opens the share link for the
other, and asserts the place is absent. Write this test *before* changing the model.

### P2-E · The Saved screen · Member 1

Board `S1-shelf`. The account's saves and places, grouped by country, with the paste box at the top and a
"Plan a trip here" offer on a country that has enough in it. The existing Saved nav entry points here; do not
leave two screens doing the same job.

**Acceptance:** grouping comes from the save's own classification, not from a trip's destination; an
unclassified save appears under "Not sorted yet" rather than being hidden; the country offer appears only when
that country has at least three confirmed places.

### P2-F · Deletion semantics · Member 4

Deleting a trip currently takes its places with it. On the shelf they should survive. Decide, write it down in
[F3](F3-trip-setup.md), and test it.

**Acceptance:** deleting a trip leaves its shelf places listed at account level and removes only the trip's
membership.

## 5. One decision to settle before P2-A

**Is confirmation account-level or per-trip?** This spec assumes **account-level**: which real venue the words
meant is a fact about the place, not about one trip, and that is what makes picking worthwhile — picked places
arrive already confirmed. If a place must be able to be confirmed for one trip and not another, `placeIds`
becomes a link record with its own status and the change grows. Agree this first; it is expensive to reverse.

## 6. How to check your work

- `npm run check` — types, 396 tests, API docs current, planning validation.
- `node --import tsx tests/e2e/trips.mjs` — offline browser acceptance. Needs
  `PLAYWRIGHT_EXECUTABLE_PATH` when the installed Chromium does not match Playwright's expected build.
- `.local/render-builder.mjs` — renders the builder's four steps offline with synthetic responses; copy it for
  the picker. Include `styles/dashboard.css` in the harness CSS list or `.sr-only` will render visibly.
- Record what actually ran in `deliverables/evidence/`, and say what you did not check.

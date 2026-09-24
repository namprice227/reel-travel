# F2 Places: choose what to visit

**Current direction (23 September 2026):** The traveler ticks places they want on a trip. Route generation chooses a provider location automatically. No branch choice or confirmation is required. This supersedes the earlier manual-confirmation interaction. Source evidence and uncertainty stay visible.

23 September follow-up: the Places page saves an explicit empty selection after **Clear all**; a custom trip city keeps its selected country for same-country saved-place reuse. [Synthetic browser checks](../../deliverables/evidence/trip-date-and-selection-fixes-2026-09-23.md).

23 September deletion follow-up: Place details can permanently remove one trip-owned place after confirmation. [Service and browser checks](../../deliverables/evidence/delete-saved-data-2026-09-23.md) cover ownership, reference cleanup, failure feedback and surviving copies.

**Screen:** `/my-trip/:tripId/places` (`ChoosePlacesStep`) and the trip builder's *Pick places* step (`PickPlacesStep`, 23 September 2026: one table of this trip's places and same-country saved places, with an add panel; see [F3](F3-trip-setup.md)).

24 September follow-up: *Saved ideas* also includes places extracted from account reels on Home when their source-supported country matches the trip. Selecting one copies its unconfirmed provider candidates and a durable reel-source record into the trip.

## Traveler flow

1. Create a trip with destination and dates; the next screen opens the builder.
2. Add a save or reuse a saved place idea, including an unresolved one. Each card shows its name, category, area when known, source excerpt, and a provider photo when one unambiguous match supports it. Missing facts remain unknown.
3. Tick any number of cards, or Select all. Clear all can save an empty selection on an existing trip. `places.select` stores the set on the trip in one owner-checked update. Changing this set makes an existing itinerary stale.
4. Build the days. The server narrows provider options using the source name, area hint and destination; proximity to other selected venues and stays breaks plausible ties. The itinerary model proposes day/order/duration, and the deterministic planner validates timing, hours and bookings. Route choice is automatic and is **not** recorded as traveler confirmation.
5. The itinerary records the provider IDs used for the route. Places without a usable location remain selected and are reported as unresolved. Duplicate references to one provider venue are scheduled once. Places that do not fit remain unscheduled with a reason. Travelers can edit the resulting days and regenerate.
6. Place details offers **Delete place** with a confirmation. Deletion removes that candidate from its trip and Saved picker, detaches it from selection, must-visit priorities and linked bookings, and keeps its source save and any copies in other trips. Affected saved plans become stale.

The location ranking is a deterministic route-aware heuristic, not a measured shortest-route guarantee. Travel times remain estimates. The model cannot invent venue coordinates, opening hours, addresses or provider IDs.

## Contracts and data

| Field or endpoint | Purpose |
| --- | --- |
| `Trip.selectedPlaceIds?: Id[]` | Traveler intent. Absence on older trips retains the legacy confirmed-place list until the first explicit selection. |
| `PATCH places.select` | Replaces the selected IDs. Rejects foreign, missing and rejected candidates; accepts unresolved candidates. |
| `DELETE places.delete` | Removes one owned trip place and its trip references. Source saves and independent copies remain. |
| `places.listSaved` and `places.copy` | Reuse saved candidates across owned trips and copy account-reel places into a trip, preserving source evidence and unconfirmed provider options. `copiedFromPlaceId` and `copiedFromAccountPlaceId` make repeat copies idempotent. |
| `Itinerary.resolvedPlaces` | Provider IDs chosen for this saved itinerary version. The candidate's `selected` field remains reserved for older traveler-confirmed records. |
| `Itinerary.unresolvedPlaceIds`, `duplicatePlaceIds` | Explain selected clues that could not be routed or that resolve to the same venue. |

Existing `places.confirm` and `places.reject` remain available for compatibility with older clients and stored records. The current traveler screens do not require them.

## Acceptance checks

- A trip owner can tick a pending or ambiguous candidate and generate without calling `places.confirm`; its status and `selected` remain unchanged.
- Matching uses only provider-returned options. A source-supported area outranks route proximity; a plausible branch near the other selected stops wins a tie.
- Unknown locations remain selected and appear in `unresolvedPlaceIds`; no coordinates or hours are fabricated.
- Repeated references to one provider venue appear once on the route, retain source evidence and are reported as duplicates.
- A changed selection marks the saved itinerary stale. Only scheduled resolved venues appear in shared views; private source text is never exposed there.
- Saved unresolved ideas can be copied into another owned trip once, while foreign and rejected places are blocked.
- A same-country account-reel place appears under *Saved ideas*, copies once into the trip, and keeps an openable source URL plus its Google candidates without becoming traveler-confirmed.
- Cards work by pointer, keyboard and at mobile width; photos retain provider attribution and fall back to illustrations.

Automated service coverage: `tests/integration/trip-selection.test.ts` and `tests/integration/saved-places.test.ts`. Browser usability and hosted provider behavior require separate review.

## Provider and source constraints

Google Places is the active location search provider; OpenStreetMap is optional. Provider credentials and privileged calls stay on the server. Google photos are fetched on demand with attribution and no persisted image bytes. Source excerpts are untrusted content and remain attached to candidates. A missing lookup (`unverified`) and a completed lookup with no result (`not_found`) are distinct states. Inaccessible social URLs still recover through `SOURCE_INACCESSIBLE`; the app does not scrape them.

See [Google Places setup](../operations/google-places.md), [OpenStreetMap setup](../operations/openstreetmap.md), and [place content](F7-place-content.md) for provider limits and display rules.

# The shelf: saves belong to you, not to a trip

**Status: Phase 1 implemented locally, 21 September 2026.** Account-wide confirmed-place reuse and the builder picker
are implemented without moving storage. The Phase 2 shelf model and migration remain a proposal.
Boards: the **S series** on the [design canvas](https://claude.ai/artifact/5qBjFKQTsnhYCNZS5NrxqB), row *"THE SHELF"*.

## What this is for

The flow is **saves → trip**, not reels → trip: a reel is the richest kind of save, not the only one, and a
typed place name is already a save today. The gap is the other end. People keep things for months before they
book, and right now there is nowhere for that to live: step 1 of the builder can only offer what this trip
already has, which for a returning traveller is nothing, even though they have saved eleven places in Japan
across two previous trips.

So step 1 should be **"pick from what you already saved"**, with adding something new folded away underneath as
the add-on.

## Why it cannot be built today

Both records are owned by a trip, and the ownership is required:

```ts
Inspiration.tripId: Id        // every save belongs to one trip
CandidatePlace.tripId: Id     // so does every place
```

Every repository method is `listByTrip`, and every endpoint is `/api/trips/:tripId/…`. There is no
account-wide list, so the question "what has this person saved?" has nothing to answer it.

(For the avoidance of doubt about a related idea: a place also cannot be *invented*. `CandidatePlace.evidence`
is `min(1)` and every `Evidence` carries an `inspirationId`, so a place always traces to something the traveler
put in. AI-suggested places for a country are the deferred US-08 discovery feature, not this.)

## The model change

| | Today | Proposed |
| --- | --- | --- |
| Save | `Inspiration.tripId` required | **nullable** — a shelf save has none |
| Place | `CandidatePlace.tripId` required | **nullable** — same |
| Membership | implied by `tripId` | `Trip.placeIds: Id[]` |
| Listing | `/api/trips/:tripId/places` | plus `GET /api/places`, `GET /api/saves` |

Existing rows keep their `tripId`, which becomes provenance ("where it was first saved") rather than ownership,
and the migration adds each place's id to its trip's `placeIds`. Nothing loses its home.

## Four things this touches

- **Lookup has no country.** `PlaceLookupContext` requires a `destination`, which comes from the trip today. A
  shelf save has no trip. It does not need one: the extractor already returns
  `SourceClassification.country` — a country code *with the excerpt that supports it* — per clue. That becomes
  the lookup context, and it is better evidence than a trip's free-text `destination` string.
- **`unverified` already exists.** A save whose words name no country stays `unverified` until a trip gives it
  one, and `places.verify` is already specified as "queue location-only lookup for an unverified place … do not
  auto-confirm". The mechanism a tripless save needs is already built.
- **Sharing must not widen.** `shares` reads `places.listByTrip(trip.id)` today. It has to read the trip's
  `placeIds` instead, or a shared link begins exposing the whole shelf. This is the one item on this page that
  is a leak rather than a task.
- **Confirming moves up a level.** Which real venue the words meant is a fact about the place, not about one
  trip. Confirm once, and every trip that references it inherits the match — which is also what makes step 1
  worth having, since picked places arrive already confirmed.

## How it lands, in two steps

**Phase 1 — reuse, without moving anything.** Add an account-wide read of places the traveler has already
confirmed (`GET /api/places`, or a scope on `places.list`). Picking one into a trip *copies* it, evidence and
all. This ships the whole of board S2 with no migration and no storage change.

One thing to get right: the copy's evidence cites an `inspirationId` owned by another trip, so either that save
is copied alongside it, or `inspirations.get` gains an account-level read. A place whose "where did this come
from" cannot be opened breaks the one claim the product makes.

**Phase 2 — the shelf itself.** Nullable `tripId`, `Trip.placeIds`, the account-wide save list, the Saved
screen, and the migration. This is a contract, storage and migration change, so it needs Member 3 (places,
extraction) and Member 4 (trips, storage, sharing), not just FE05.

## Open questions

- **Does a place need per-trip status?** This proposal says no: confirmation is account-level, and a trip only
  records membership. If a place must be able to be "confirmed for Tokyo but not for Osaka", `placeIds` becomes
  a link record instead, and the change grows.
- **What happens to a shelf place when its trip is deleted?** Today deleting a trip takes its places with it.
  On the shelf they should survive, which is a deletion-semantics decision for Member 4.
- **Does the Saved tab in the nav become this?** It exists already and points at the library. If the shelf lands,
  the two should be one screen, not two.
- **Day one is still empty.** A new account has saved nothing, so step 1 has to lead with the add box and only
  promote the picker once there is something in it. The emphasis flips on data, never on a setting.

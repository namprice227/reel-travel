# Member 3 handoff: transactional place confirmation and merge

Requested by the user on 18 September 2026. Implementation owner: Member 3 (BE03); database/repository support
and review: Member 4 (BE10/BE13). [Coordination issue #9](https://github.com/namprice227/reel-travel/issues/9)
is open and unassigned. Member 3's GitHub username has been requested; no acknowledgement is recorded.

## Reproduced failure

In `apps/web/src/server/services/places.ts`, `confirmPlace` updates the chosen place, deletes duplicates, then
calls `repointPlaceReferences`. If a later reservation update fails, the duplicate stays deleted while its
booking retains the old `placeId`. A synthetic audit probe reproduced this sequence. The import-submission and
Skip transactions do not fix place merging.

## Proposed boundary

Keep the existing `places.confirm` request/response contract. Introduce a repository operation such as:

```ts
confirmAndMerge(tripId: string, placeId: string, providerPlaceId: string): Promise<{
  place: CandidatePlace;
  mergedPlaceIds: string[];
}>;
```

The service retains ownership checks. The repository must validate current database state inside the same
transaction: source place belongs to this trip, selected provider option exists, status permits confirmation,
and all duplicates/references being changed belong to the same trip. Keep unverified candidates blocked; this
work must not restore Google Places calls or invent coordinates.

## Transaction requirements

1. Use a consistent lock protocol. Import submission and Skip lock user -> jobs -> inspiration. A merge should
   acquire the user lock before related mutable rows; serialize place confirmation and candidate upserts under
   an agreed common protocol. Lock only database work, never provider calls.
2. Re-read candidates under the lock. Select a deterministic surviving place and merge evidence without losing
   distinct excerpts, hints or inspiration references. Define the response if the requested ID was already merged.
3. Repoint `inspirations.placeIds`, `reservations.placeId`, and `trip.preferences.mustVisitPlaceIds`, deduplicating
   arrays. Preserve unrelated trip fields and the current itinerary pointer.
4. Refresh affected inspiration statuses consistently, then delete duplicates. All changes must roll back on
   any error. A better write order alone is not an adequate fix.
5. Do not rewrite immutable itinerary versions. Make the relevant planning inputs/fingerprint stale so owners
   regenerate; public stale plans are withheld by the current sharing service.
6. Implement equivalent atomic behavior in the development file adapter. Supabase RPCs remain invoker functions
   with an empty search path and execution granted only to `service_role`.

## Acceptance checks to add

- Inject failure during every reference-update stage; source/target places, evidence, bookings, inspiration IDs,
  must-visits and itinerary pointer must remain unchanged.
- Race confirmations of both duplicates: one deterministic surviving identity, no dangling references or lost evidence.
- Race an import upsert with confirmation/merge, including two sources that identify the same provider place.
- Preserve unrelated concurrent trip edits and reject attempts to merge across trips/accounts.
- Repeating an already completed confirmation is safe; document returned merged IDs.
- Keep ambiguous branch choice explicit and unverified candidates unconfirmable.
- Test actual SQL concurrently in `tests/database/supabase.test.ts`, plus service/API response validation.

Member 4 can implement/review the migration and adapter once Member 3 agrees the identity/upsert semantics.
This document is a concrete coordination proposal, not a completed merge fix or evidence of human review.

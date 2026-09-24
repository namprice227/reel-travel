# Submission product scope

Source: [team proposal](../../deliverables/references/AI_Travel_Planner_Proposal.pdf), pages 1–4 and 6.
This began as the proposed build scope. The implementation state is tracked in `planning/tasks.csv`; acceptance
conditions below remain the release standard and are not automatically satisfied merely because a screen exists.

One destination, one traveler as trip owner, a three-to-seven-day trip.
Input: text, screenshots, and supported links with recoverable unavailable content.
Output: a saved editable itinerary shown consistently as a magazine, timeline, and map.

| Story | Build acceptance condition | Owners |
| --- | --- | --- |
| US-01 | Every save retains source and status; failure offers add-details/retry/skip | Member 1 + Member 3 + Member 4 |
| US-02 | Candidate retains source evidence; traveler ticks places to visit; route generation chooses a provider location from plausible options and reports unresolved or duplicate ideas | Member 3 + Member 1 |
| US-03 | Persist dates, timezone, accommodation, transport, pace, budget, priorities and bookings; show estimates/unknowns | Member 4 + Member 1 |
| US-04 | Account for travel, visit duration, breaks and available opening windows; explain infeasible days | Member 4 + Member 2 |
| US-05 | Move/replace stop, preserve fixed reservation, revalidate affected day before saving | Member 4 + Member 2 |
| US-06 | Magazine, timeline and map read the same saved itinerary version | Member 2 + Member 4 |
| US-07 | Owner creates/revokes viewing access; viewers cannot edit or retrieve private uploads | Member 4 + Member 2 |
| Foundation | Sign-in restores that user's trips/preferences; cross-account access is rejected | Member 4 + Member 1 |

Schedule confidence: a plan with missing hours is only partially checked and must show that limitation.
Do not invent opening hours, prices, venues, or confirmed bookings.

## Deferred

US-08 licensed discovery, voice notes, group editing, multi-city planning, booking/payment execution,
subscriptions, and custom AI-generated magazine layouts. Keep proposed pricing as a hypothesis.

## Core demonstration

Save 15 ideas for a four-day trip; recover one inaccessible link; tick the places to visit;
automatically choose a route location, set priorities, create days, move a stop around a locked dinner;
show synchronized map/timeline/magazine; share then revoke a viewing link.
Use permissioned or synthetic fixtures and identify them as such.

Differentiation to validate: traceable place choices and predictable edits that preserve constraints.

23 September 2026 user direction supersedes the earlier confirmation gate for trip creation. `Trip.selectedPlaceIds` stores traveler intent separately from route-selected provider IDs on the itinerary. Automatic matching preserves original candidate status and evidence. Unknown locations remain unresolved, and travel efficiency remains estimated rather than measured optimality. See [F2 Places](../features/F2-places.md).
A proposed advantage is not an established moat or measured improvement.


## Phase 1 / BE01 audio experiment (2026-09-16)

User-authorized technical slice: a local audio filepath produces a transcript and unverified extraction JSON.
This does not add web voice notes or change the existing submission UI scope. See
[manual sample](../../packages/ai/README.md#phase-1-local-audio-sample-be01).
Video frames, vision and Google Places integration remain deferred for this slice.


User-authorized follow-up: public YouTube URL -> Gemini-generated spoken transcript, via a manual runner.
This permits provider video input for transcription; place lookup and web integration remain out of scope.
[Manual test](../operations/youtube-transcript.md).

Google Places extension (explicit user request, 2026-09-16): existing YouTube transcript -> OpenAI clues -> Google Places -> existing confirmation/storage/planner is implemented for local integration. Live Places validation, production retention/refresh and Google map rendering remain pending.

## YouTube classification experiment (2026-09-21)

User-authorized follow-up: public YouTube URL -> Gemini speech/visual observations -> OpenAI
itinerary/place JSON. First slice is a [manual command](../operations/youtube-reels.md), with strict
validation, unknowns and evidence. Successful non-travel/ambiguous inputs use uncertain place fallback;
inaccessible sources still recover. This does not change the saved itinerary/planner contract or
single-city product scope. No local frames/downloaders, web UI, or new persistence added.

User-directed update, 2026-09-19: OpenStreetMap/Nominatim replaces active Google location search. Explicit
confirmation and source evidence remain required. [Selected lookup and usage limits](../operations/openstreetmap.md).

User-directed update, 20 September 2026: Google Places is active again after live access verification.
The OpenStreetMap adapter remains optional; existing records and explicit confirmation are preserved.
See [Google Places setup](../operations/google-places.md).


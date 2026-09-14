# Submission product scope

Source: [team proposal](../../deliverables/references/AI_Travel_Planner_Proposal.pdf), pages 1–4 and 6.
This is a proposed build scope; no feature is implemented.

One destination, one traveler as trip owner, a three-to-seven-day trip.
Input: text, screenshots, and supported links with recoverable unavailable content.
Output: a saved editable itinerary shown consistently as a magazine, timeline, and map.

| Story | Build acceptance condition | Owners |
| --- | --- | --- |
| US-01 | Every save retains source and status; failure offers add-details/retry/skip | Member 1 + Member 2 + Member 4 |
| US-02 | Candidate includes source evidence and coordinates; ambiguous branch requires confirmation; duplicates merge safely | Member 2 + Member 1 |
| US-03 | Persist dates, timezone, accommodation, transport, pace, budget, priorities and bookings; show estimates/unknowns | Member 3 + Member 1 |
| US-04 | Account for travel, visit duration, breaks and available opening windows; explain infeasible days | Member 3 |
| US-05 | Move/replace stop, preserve fixed reservation, revalidate affected day before saving | Member 3 + Member 1 |
| US-06 | Magazine, timeline and map read the same saved itinerary version | Member 1 + Member 3 |
| US-07 | Owner creates/revokes viewing access; viewers cannot edit or retrieve private uploads | Member 4 + Member 1 |
| Foundation | Sign-in restores that user's trips/preferences; cross-account access is rejected | Member 4 |

Schedule confidence: a plan with missing hours is only partially checked and must show that limitation.
Do not invent opening hours, prices, venues, or confirmed bookings.

## Deferred

US-08 licensed discovery, voice notes, group editing, multi-city planning, booking/payment execution,
subscriptions, and custom AI-generated magazine layouts. Keep proposed pricing as a hypothesis.

## Core demonstration

Save 15 ideas for a four-day trip; recover one inaccessible link; resolve a branch;
confirm priorities; create days; move a stop around a locked dinner;
show synchronized map/timeline/magazine; share then revoke a viewing link.
Use permissioned or synthetic fixtures and identify them as such.

Differentiation to validate: traceable place matches and predictable edits that preserve constraints.
A proposed advantage is not an established moat or measured improvement.

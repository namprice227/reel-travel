# Practical itinerary scheduling v6 — 23 September 2026

Scope: implement the five requested improvements to itinerary generation. All automated examples and replay venues are synthetic. Existing saved versions and the dated v3/v5 model benchmark artifacts remain unchanged. This change has not been deployed or visually verified in a browser.

## Implemented behavior

| Improvement | Implementation and traveler behavior |
| --- | --- |
| Protect saved places | `scheduleProposal` schedules eligible confirmed IDs even if omitted by the model. Booked places appear through their booking, once. Saved facts remain authoritative. Missing visits remain in `unscheduledPlaceIds` and get individual explanations and alternatives. Optional suggestions cannot displace saved visits. |
| Server-calculated timelines | v6 asks the LLM for day grouping, order and durations. The existing `start` field remains an approximate compatibility hint; fixed booking starts are binding. Code searches opening windows and free intervals around bookings, reserves inbound/onward travel and return to the dated accommodation, and validates the final plan. |
| Practical meals | Reserve a provisional midday lunch before scheduling activities unless a saved dining place can supply it; recover a lunch gap afterwards if needed. Long saved visits can reclaim the reservation, with a meal trade-off explained. Lunch placement works without Google enabled. Optional Google retrieval still checks candidate hours, inbound/onward travel, budget and food interests, and nearby dated weather; the final leg now also accounts for returning to the hotel. |
| Separate usefulness and targeted repair | Optional `Itinerary.quality` contains an advisory score, saved-place coverage, repair provenance and issues. Check coverage, lunch, excessive travel, rushed visits, coarse budget/interest matches, filler and nearby dated weather. A second deterministic candidate can recover coverage and restore rushed visit durations. Weak checked drafts may receive one targeted model repair within the existing call/total deadline. Choose by priority coverage, then all saved-place coverage, then score. Failed quality repair preserves the valid draft. |
| Explain trade-offs | The owner itinerary has an expandable **Plan review** panel with omissions and options, such as keeping a long outing with lunch during it or moving a flexible visit. These are suggestions for manual edits/Trip setup, not automatically applied alternative itineraries. Impossible bookings still fail safely with an actionable setup explanation. |

Generation still rebuilds the entire trip from current inputs. It never inserts new places into the previous itinerary. Regeneration leaves historical versions unchanged; fixed bookings, expected-version checks, ownership, quotas and stale-input checks remain in place. Quality is reassessed after nearby enrichment and after edits, including dry-run previews. It is omitted from the public share projection and is optional for legacy records; no database migration is needed.

The legacy strict compiler remains available for frozen comparisons and independently testing literal schedules. Production AI generation uses the new scheduler. The explicitly selected greedy development baseline remains separate.

## Deterministic choices and limits

- A model proposal can contain at most 24 blocks/day, 7 days and 50 supplied confirmed places, with the existing input bounds. Identity, duplicate-ID, schema and booking errors still require repair; they are not silently ignored.
- Saved visits are queued by must-visit priority, model day/order, then stable ID. Candidate placement balances estimated travel, waits and model day preference (45 minute-equivalent penalty for changing its proposed day). This is a bounded greedy heuristic, not proof of global feasibility or the shortest route.
- Weather discourages outdoor categories during adverse **matching date/location** forecast hours (180 point penalty), considering later hourly starts and other gaps/days. Forecast absence does not mean good weather. Seasonal guidance remains general model advice.
- Unknown travel remains `null` and flagged. Candidate fitting reserves provisional 15-minute legs and safeguards direct travel across unlocated meal/idea blocks; it never fabricates coordinates. Known travel still uses the existing straight-line estimate, not live transit/routing.
- Lunch is normally sought around 11:30–14:30. Breakfast/dinner model blocks use their corresponding broad windows. These are soft defaults: no lunch alone causes generation failure. Known dining visits/bookings can fulfill a meal. Substantial outings retain their model-specified duration; deterministic repair does not shorten a long outing to force coverage.
- Usefulness score starts at 100. Missing saved coverage deducts up to 60 points. Per-day averaged penalties are 8 for missing lunch, excessive travel, rushed visits or weather mismatch, and 4 for preference/filler issues. Excessive travel means more than the larger of 90 minutes or 30% of available time; a rushed visit is below 75% of the supplied typical duration. A destination-only trip with no outings or activity ideas is capped at 70 and invites a targeted suggestion; free afternoons on otherwise useful trips are not penalized. These thresholds are explicit product heuristics, not validated user satisfaction predictions.
- A score below 85 with a coverage/timing/travel/weather weakness can trigger one model repair. The existing limits remain 25 seconds/call, 40 seconds total, 8,000 output tokens and two calls maximum. Quality failure is advisory; identity or incompatible booking failure is not.
- Nearby real-venue retrieval still requires configured Google Places access. With retrieval disabled/unavailable, meal/idea locations and hours remain provisional. No new claim of live venue/weather verification is made here.

## Verification and replay

Automated tests cover recovery from empty model output, canonical IDs, duplicate/unknown IDs, computed times, fixed bookings, closed-place explanations, lunch versus long outings, rushed-duration repair, lunch before an afternoon booking without retrieval, return travel, dated weather timing, flexible pace/budget, unknown travel, impossible booking guidance, bounded repair/deadlines, and safe fallback after failed quality repair. The HTTP/frontend-client add → generate → add → regenerate test verifies full replacement, quality persistence and immutable old versions.

Offline replay command:

```sh
npx tsx scripts/replay-itinerary-scheduling.ts
```

[Replay data](../../evals/results/itinerary-scheduling-2026-09-23/replay.json) compares the **same first raw v5 response** using the old strict compiler versus the new scheduler. It uses the previous manifest's exact synthetic inputs, records source/input hashes and makes no provider calls. Only cases with a returned response can be replayed. This is a scheduling regression experiment, not a fresh model comparison or an evaluation of the v6 prompt.

| Earlier response source | Feasible responses available | Strict acceptance | New scheduler acceptance | Saved IDs in accepted plans, before → after |
| --- | ---: | ---: | ---: | ---: |
| GPT-4.1 mini | 13 | 10 | 13 | 15 → 25 |
| GPT-4o mini | 13 | 7 | 11 | 11 → 19 |
| Qwen3 4B / Ollama | 13 | 5 | 8 | 0 → 13 |
| Gemini | 0 | Not measurable | Not measurable | Not measurable |

The single incompatible-booking response from each of the three working backends remains rejected. Remaining feasible-response rejections are duplicated IDs or missing bookings; those are still model-repair responsibilities. Acceptance is not a claim that every saved place fits or every itinerary is useful. Coverage totals above pool IDs across accepted cases; failed cases contribute zero. No latency, cost, human preference or new-provider reliability improvement is claimed.

The comparison runner now retains each attempt's computed plan and scores the delivered itinerary, with a separate final score when a valid earlier draft survives failed repair. Raw schema metrics still evaluate the original provider response. The greedy comparator bypasses hybrid scheduling so it is not mislabeled. Dated earlier benchmark artifacts remain frozen.

Final local checks and remaining gaps are recorded below after execution. Live v6 model evaluation, real user review and production deployment remain pending.

### Completed local checks

- `npm run check` — PASS: all workspace typechecks, **606 tests in 54 files**, generated API-document consistency, planning metadata and local documentation links.
- `npm run build` — PASS: Next.js production build.
- `npx tsx scripts/replay-itinerary-scheduling.ts` — PASS; 56 source rows examined, with the explicit replay exclusions/results above. Input and scheduler source hashes verified after the run.
- `git diff --check` — PASS.

No live v6 provider calls, production database writes, browser acceptance, commit, push or deployment were performed for this change. Existing v5 benchmark evidence is preserved.

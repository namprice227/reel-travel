# Independent itinerary review rubric

Status: **not yet performed**. Automated checks and an AI author's observations are not human ratings.
Use this rubric after the measured run. Do not replace missing scores with zero or fabricate reviewers.

Randomize provider labels separately for each scenario and hide model names, latency, prices and raw error
messages. Give two reviewers the trip inputs and each delivered itinerary, including its uncertainty labels.
For a failed generation show “no itinerary delivered”; score delivery separately, not as an invented trip.
Review all run-1 scenarios (preselected, not chosen for favorable outputs); if resources permit, review all runs.
Store the provider mapping separately until scores are locked. Reviewers should not see each other's scores.

| Dimension | 1 — poor | 3 — adequate | 5 — strong |
| --- | --- | --- | --- |
| Preference fit | Ignores must-visits, pace or interests | Most priorities reflected | Priorities consistently reflected with sensible tradeoffs |
| Timing realism | Rushed visits, missing meals or implausible transfers | Usable with some adjustment | Realistic visit lengths, meals, rest and buffers |
| Geographic coherence | Distant filler or repeated zigzags | Mostly coherent areas | Activities grouped with plausible travel and return arrangements |
| Seasonal fit | Unsupported precise claims or unsuitable timing | General seasonal advice | Practical, appropriately qualified seasonal adjustments |
| Sparse-trip usefulness | Empty days or arbitrary filler | Some relevant nearby ideas | Balanced, relevant suggestions clearly marked unverified |
| Overall usefulness | Would not use | Would use after editing | Useful starting itinerary with clear caveats |

Each rating must include a short concrete explanation. Mark not applicable when a dimension does not apply.
Independently verify suggested areas and climate claims against reliable sources; fabricated synthetic venues
are deliberately not real lookup targets. Distinguish a synthetic fixture's supplied hours from actual hours.

Suggested CSV columns:
`scenario,anonymous_output,reviewer,delivered,preference_fit,timing,geography,seasonal_fit,sparse_usefulness,overall,notes`

Report reviewer count, agreement, per-dimension distributions and a few disagreements. With a small sample,
avoid statistical superiority claims. Never use the same model being evaluated as the sole judge of its own output.

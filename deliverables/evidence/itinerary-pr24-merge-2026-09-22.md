# PR 24 integration with latest main

Merged `origin/main` at `0c7342e` into `feat/BE12-contextual-nearby`.

- Preserved main's lightweight Google Text Search and on-demand rich Place Details implementation.
- Kept the shared opening-hours decoder and updated the new details fetcher to call it.
- Retained both branches' contribution entries and regenerated the API reference.
- Passed nearby suggestion provider metadata to itinerary map rendering, so Google's new provider-isolation behavior also covers suggested venues that have no confirmed place ID. Added a synthetic regression check.
- Unfinished analytics and regeneration-test edits were stored separately during the merge and restored afterwards.

Production build passed. Final application-check results are recorded with the merge completion.
No deployment, analytics-account activation, or new live provider test is claimed by this merge.

`npm run check`: PASS, 570 tests across 51 files, all workspace typechecks, generated API freshness and planning/link validation. `git diff origin/main --check`: PASS.

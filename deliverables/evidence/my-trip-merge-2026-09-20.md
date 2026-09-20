# My Trip merge resolution — 20 September 2026

Resolved the requested merge of `main` (`9fcfed9`) into `feat/my-trips-sky3` (`00ffbc7`). The existing staged merge changes were preserved; unrelated UI was not redesigned during resolution.

## Decisions

- `ItineraryPage.tsx`: retained the redesigned day workspace, timezone selection and Undo, with explicit trip/itinerary load-error branches from the incoming fix.
- `PlacesPage.tsx`: retained the current filter/row layout and Google map display. Added incoming `unverified` candidates to Needs you, retained their uncertainty and source-context hints, and kept confirmation unavailable until provider options exist. Place lookup configuration from main remains separate from map rendering.
- `PlaceCard.tsx`: kept the branch's deletion of this unused component; transferred the incoming uncertainty/source-evidence changes into the active place rows.
- `SharePage.tsx`: retained incoming stale-plan withholding and its explanation, with the branch's `/itinerary` recovery link.
- `planning/contributions.csv`: retained records from both sides and added this resolution record.
- `DayView.tsx` and `RouteMap.tsx`: adapted the redesigned views to main's nullable `travelMinutesBefore` contract. Unknown legs and arrival uncertainty remain visible; partial sums are not presented as complete travel totals.

## Verification

- `npm run check`: PASS — TypeScript, **340 tests in 27 files**, generated API-reference check and planning/link validator.
- `node --import tsx tests/e2e/my-trip-ux.mjs`: PASS — **17 grouped browser checks**, including three new merge regressions for nullable travel in day/details/map views, unverified-place review/evidence, and stale sharing previews. [Recorded results](my-trip-merge-2026-09-20-results.json).
- Conflict-marker scan and `git diff --check`: PASS. Contribution preservation checked against both merge stages.

Browser coverage uses real components/styles with synthetic intercepted responses and navigation shims. No live providers, production data, hosted persistence or deployment were tested. No new API contract was introduced. The resolution is staged for the user's merge commit; no commit or push was made.

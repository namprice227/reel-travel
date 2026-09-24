# Audit bug fixes — 24 September 2026

User requested a separate PR for verified audit findings. Work is isolated in the
`fix/audit-worker-planner` branch; existing uncommitted UI work is excluded.

## Changes and acceptance

- Worker: includes the existing PR #31 commit accepting trip and account-reel IDs.
  Real child-process tests intercept Supabase claims and verify both dispatch paths.
  See [the earlier worker evidence](worker-job-id-repair-2026-09-24.md); no worker restart
  or live queue operations were performed for this broader audit-fix work.
- Opening hours: planner and itinerary text share normalized windows, including the
  previous weekday's overnight spillover and Saturday/Sunday rollover. Adjacent
  windows are continuous; actual gaps and unknown hours remain distinguishable.
- Midnight edits: retain intended durations for all flexible stops before formatting
  local times, including legacy meals, suggestions and breaks. Validation rejects
  newly shortened stops without mutating the saved plan. The optional duration
  contract supports 1–1439 minutes so short breaks and long legacy activities can
  round-trip; this does not add support for itineraries crossing midnight.
- Search lookup: absent, invalid, out-of-range and legacy `(0, 0)` coordinates yield
  no routable option. Valid equator/prime-meridian coordinates remain accepted.
  The prompt requests null for unknown locations. Mocked provider tests make no
  external requests. This does not claim model coordinates have Google Places verification.
- Browser harness: adds an isolated `next/image` shim to the My Trip offline bundle;
  real Next image optimization remains outside the harness's scope.

## Audit findings not requiring a code change

- Gemini `responseSchema` is valid for the currently generated schema. No reproduced
  invalid-field failure supports the proposed rename.
- The account-reels migration already replaces the older trip-only quota function
  with combined account/trip quota counting. Hosted migration state was not inspected here.
- The legacy HTTP worker route intentionally returns 403 without its secret. Dedicated
  and inline workers do not use that endpoint; authentication remains fail-closed.

## Verification

- `npm run check`: PASS — all workspace type checks, 800 tests in 73 files, generated
  API documentation check, and planning/link validation.
- `npm run docs:api`: PASS — regenerated the edit endpoint description.
- `node --import tsx tests/e2e/my-trip-ux.mjs`: PASS — all 24 offline checks in
  installed Edge, including zero runtime errors and no unexpected requests. Used
  explicit `PLAYWRIGHT_MODULE_PATH` and `PLAYWRIGHT_EXECUTABLE_PATH`; runtime results
  are in the ignored `.local/my-trip-ux/results.json` within the isolated worktree.
- `git diff --check`: PASS. Dependency resolution was checked against this worktree.

No live provider calls, hosted database changes, deployments or independent human
verification were performed. Existing bad saved coordinates/hours are not backfilled.

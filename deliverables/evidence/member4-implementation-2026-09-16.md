# Member 4 implementation evidence — 16 September 2026

Scope: BE12 planner/validation, BE13 edit/share safeguards, and the planner-only portion of BE14.
Implementation assistance: Codex. Human verification: pending. No other member's implementation tasks were changed.

## Implemented

- Calendar-valid booking timestamps; confirmed in-trip must-visit references, with duplicate ids removed.
- Timezone, category/price facts, displayed titles and source references participate in itinerary staleness.
- Pure deterministic generation ranks feasible stops by must-visit priority, travel/wait and soft category/price
  preferences. Unknown facts remain unknown; budget is not a monetary cap.
- First-booking reachability includes day start and accommodation travel. Edits cannot silently truncate visits at
  midnight or add a place already represented by a booking. Dry runs preserve the saved version.
- `Repositories.itineraries.saveVersion` compares/inserts/advances as one operation. `trips.update` preserves the
  latest pointer. Regression checks cover competing saves, rejected writes, immutable versions and stale snapshots.
- Atomic share revoke/touch operations prevent a viewer from reactivating a revoked link. Public-schema allowlisting
  also runs in the service. Successful JSON and error responses are not HTTP-cacheable.
- Fixed-window sharing limits through `Repositories.rateLimits.consume`: 10 creations/owner/10 minutes and 120
  reads/valid link/minute, shared across viewers. HTTP 429 carries `Retry-After` and a readable error envelope.

## Verification

- `npm run check`: PASS on the final implementation. Includes typechecking,
  72 tests across six files, generated API-reference verification and Python workspace validation.
- `npm run smoke` against an isolated local Next.js instance at `http://localhost:3104`: 13/13 HTTP checks passed.
  Synthetic accounts, development identity, temporary local storage and fake providers; no production claims.
- `npm run docs:api`: regenerated 29 endpoints and 53 shared types.
- `npm run measure:planner -- 60d3c512b51de763b745f705b633df5cab384b2c`: completed. Full inputs and outputs in
  [planner-comparison.json](../../evals/results/planner-comparison.json).
- Environment: Windows, Node 24.21.0 and Python 3.12. The default Node 20.13.1 could not support the locked test
  tooling; the default `python` command was a Microsoft Store alias. Temporary process PATH changes selected the
  working runtimes. Root Node engine metadata/setup documentation now match the test dependencies.

Acceptance tests: [planner unit tests](../../packages/planner/src/planner.test.ts),
[service/repository safeguards](../../tests/integration/planner-safety.test.ts),
[HTTP checks](../../tests/integration/http-safety.test.ts), and existing
[core flow](../../tests/integration/core-flow.test.ts).

## Planner comparison

Four fictional fixtures, 20 warmups and 200 measured calls per implementation per fixture. Baseline modules are
loaded from the recorded Git commit; candidate is the working tree. Generation and validation are both included.

| Fixture | Before | After |
| --- | --- | --- |
| Late-opening place | 80 idle minutes; both places scheduled | 10 idle minutes; both places scheduled |
| Budget and interest, one available slot | Expensive museum | Affordable art-category match |
| Unknown hours | Partially checked | Partially checked |
| Locked booking | Dinner 19:30–21:00 | Dinner 19:30–21:00 |

Median planner runtimes were approximately 0.036–0.114 ms before and 0.035–0.111 ms after across these fixtures.
No general speedup or statistical significance is claimed. The demonstrated optimization is less waiting in the
late-opening fixture. These small cases do not establish real-world itinerary quality.

## Remaining limitations

- The concrete repository adapter is still the single-process development JSON store. Its behavior tests do not
  prove SQL transactions, crash durability or distributed rate limits. The production adapter must implement the
  strengthened interface guarantees and rerun these checks.
- Real authentication, database/migrations, private object storage, hosting, scheduled jobs and analytics delivery
  remain outstanding. No providers or cloud resources were provisioned.
- Invalid-token/IP abuse protection requires hosting-level enforcement; valid-link quotas alone do not cover it.
  Multiple viewers share each link's capacity. Frontend rate-limit UX and browser verification are outstanding.
- Travel is still estimated; no area clustering or solver. Category word matching is simple; ranking weights are
  design choices without pilot validation. Existing baseline itineraries may need regeneration after fingerprint changes.
- AI/lookup/retry costs, deployed latency, pilot security evidence and independent human review are unmeasured.

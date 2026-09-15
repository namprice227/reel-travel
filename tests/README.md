# Product verification plan

- `npm test` runs unit tests next to domain code (`packages/*/src/*.test.ts`) and service-level tests in `integration/`.
- `npm run smoke` runs the core demo over HTTP against a running app ([smoke-api.ts](../scripts/smoke-api.ts)).
- `e2e/` has no browser tests yet. Member 2 adds them (FE12).

Covered on 2026-09-14 with synthetic data: import failure and recovery, unreadable link, branch confirmation and merge,
account isolation, locked booking and stale edits, share revocation and projection. Not yet covered: views consistency
in the browser, AI input safety, real providers.

| Area | Meaningful acceptance check | Owner |
| --- | --- | --- |
| Import | Save survives a failed job; retry does not duplicate results | Member 3 + Member 4 |
| Place confirmation | Two branches remain unresolved until traveler selects one | Member 3 |
| Planner | Closed venue, travel overlap and impossible booking explain conflicts | Member 4 |
| Editing | Locked dinner unchanged; stale edit rejected; revised day rechecked | Member 4 |
| Views | Same itinerary version/stop IDs in map, magazine and timeline | Member 2 |
| Identity | Second account cannot read/edit first account's trip or assets | Member 4 |
| Sharing | Viewer cannot edit; revoked token rejected; private assets inaccessible | Member 4 |
| AI input | Embedded instructions cannot widen tool access or bypass output validation | Member 3 + Member 4 |
| End to end | Sign in -> import -> confirm -> plan -> edit -> share/revoke -> reload | All |

Unit checks belong near domain code; put cross-module tests in integration/ and browser flows in e2e/.
Record execution date, commit, environment, failures and evidence in the evidence register.

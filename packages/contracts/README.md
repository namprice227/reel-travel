# Contracts

Owner: all four members; this is the frontend–backend boundary. Member 4 coordinates the router, persistence and
itinerary shapes, Member 3 candidate places, Members 1 and 2 the UI's needs and examples.

The single source of truth for data shapes and API operations. The server router validates against these schemas
and the browser client is typed from them. Readable reference: [endpoints.md](../../docs/api/endpoints.md) (generated).
How to change a contract: [feature specs](../../docs/features/README.md).

| File | Contents |
| --- | --- |
| [api.ts](src/api.ts) | Endpoint registry (method, path, access, owners, schemas, errors) and request/response helper types |
| [common.ts](src/common.ts) | Ids, dates and times, error codes, error envelope |
| [user.ts](src/user.ts) | User, dev sign-in input |
| [trip.ts](src/trip.ts) | Trip, preferences, reservation |
| [inspiration.ts](src/inspiration.ts) | Saves, import states, failure codes, jobs |
| [place.ts](src/place.ts) | Candidate places, options, evidence, provider details, opening hours |
| [itinerary.ts](src/itinerary.ts) | Itinerary versions, days, stops, conflicts, edits, share-safe projection |
| [share.ts](src/share.ts) | Viewing links and the shared view |
| [analytics.ts](src/analytics.ts) | Product event names |
| [fixtures](fixtures/index.ts) | One example of every state the UI must handle, validated by tests |

## Conventions

- Import states: `queued -> processing -> needs_confirmation / ready / needs_input / failed`; `skipped` by the traveler.
- Only server-side confirmation (`places.confirm`) makes an uncertain place usable by the planner.
- `Timestamp` is UTC. `LocalTime` and `LocalDateTime` are wall-clock times in the trip's IANA timezone.
- Itinerary edits carry `expectedVersion`; stale updates are rejected, never silently overwritten.
- Every error response uses `ApiErrorBody`; codes and HTTP statuses are in `common.ts`.
- Response schemas strip unknown fields, so never rely on extra fields reaching the browser.

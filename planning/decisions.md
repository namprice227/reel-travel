# Decisions and open questions

| ID | Decision / question | Owner | Due | Status |
| --- | --- | --- | --- | --- |
| DEC-01 | Confirm four names, matriculation IDs, group number, availability | All | 2026-09-12 | Open |
| DEC-02 | Confirm Coursemology product approval and portal deadline | Member 1 | 2026-09-12 | Open |
| DEC-03 | Select one pilot city and reachable travelers | Member 1 | 2026-09-12 | Open |
| DEC-04 | Select familiar stack, hosting, identity and database | Member 4 + Member 3 | 2026-09-12 | Partly decided 2026-09-14: Next.js + TypeScript; database, auth, hosting open |
| DEC-05 | Verify usable input routes and map/place provider access | Member 3 | 2026-09-12 | Open |
| DEC-06 | Agree shared shapes and fake-provider fixtures | All | 2026-09-12 | Open |
| DEC-07 | Confirm working name and brand direction | Member 1 + Member 2 | 2026-09-15 | Open |
| DEC-08 | Select candidate model plus two alternatives for measurement | Member 3 | 2026-09-15 | Open |
| DEC-09 | Divide work into frontend (Members 1–2) and backend (Members 3–4) tracks | All | 2026-09-15 | Decided 2026-09-15; confirm at the next blocker check |

This scaffold uses one repository, a web app, one optional separate job process, and small shared modules.
No paid provider, repository, cloud deployment, or model has been provisioned.

Decision entry template: date; question; options; evidence; choice; trade-off; owner; follow-up.

## 2026-09-14: App base stack (DEC-04, partial)

- Question: which stack lets four people build UI, AI, planner and identity in parallel by 25 September?
- Options: Next.js + TypeScript full stack; React (Vite) + Express in TypeScript; React (Vite) + Python FastAPI.
- Evidence: none measured yet; chosen for one language, one deploy and shared typed contracts.
- Choice: Next.js 16 + TypeScript in npm workspaces, with zod contracts shared by the server router and the browser client.
  Chosen by the team member who requested the app base; confirm or revise at the next gate.
- Trade-off: contract mismatches become type errors and there is one app to deploy; Python-first AI work needs
  TypeScript adapters or a separate service.
- Deferred behind interfaces: database and private storage (`Repositories`, `PrivateAssetStorage`), auth
  (`apps/web/src/server/auth`), AI and place providers (`Extractor`, `PlaceLookup`). Development stand-ins: JSON file
  store, email-only sign-in, synthetic fixtures.
- Owner: Member 4 + Member 3. Follow-up: record the database, auth and hosting choice here before BE10/BE11.

## 2026-09-15: Frontend and backend tracks (DEC-09)

- Question: how should four people divide the remaining work now that the app base exists?
- Choice: Members 1 and 2 build the frontend; Members 3 and 4 build the backend.
  - Member 1: shared UI kit, landing page, sign-in and setup screens, inbox and place confirmation, brand and launch kit.
  - Member 2: itinerary editing, map and magazine views, sharing screens, browser tests, funnel analytics, pitch visuals.
  - Member 3: AI extraction, place lookup, import jobs, prompt and model evaluation.
  - Member 4: database, auth, uploads, deployment, planner and edits, sharing safeguards, submission package.
- Trade-off: backend work planned for three people now sits with two. Tasks the app base already covers (contracts,
  router, development jobs, baseline planner, sharing links) were merged. Member 4 carries two areas; rebalance at G2.
- Milestone answers moved with the work, keeping five answers and one lower-weight answer per member (see team.md).
- Task ids now name the track: FE01–FE08 Member 1, FE09–FE16 Member 2, BE01–BE08 Member 3, BE09–BE16 Member 4.
- Follow-up: several tasks due 12–15 Sep changed owner on 15 Sep. Agree realistic dates and update tasks.csv.

| Old id | New id |
| --- | --- |
| A01 | FE01 |
| A02 | FE02 (inbox), FE04 (places) |
| A03 | FE03 (landing), FE04 (places map), FE10 (itinerary map) |
| A04 | FE09 (itinerary edits), FE10 (magazine) |
| A05 | FE06 (capture pilot), FE14 (journey integration) |
| A06, A07, A08 | FE08, FE15, FE16 |
| B01–B08 | BE01–BE08 |
| C01 | BE09 |
| C02, C03 | BE12 |
| C04 | BE13 |
| C05, C06 | BE14 |
| C07 | BE16 |
| C08 | FE16 (pitch claims), BE16 (final itinerary cases) |
| D01, D02, D03 | BE09, BE10, BE11 (browser events move to FE13) |
| D04, D05 | BE13, BE15 (funnel capture moves to FE13) |
| D06 | FE07 |
| D07, D08 | FE15 (UI flow review), BE16 |
| New | FE05 (sign-in and setup screens), FE11 (sharing screens), FE12 (browser tests) |

# Decisions and open questions

| ID | Decision / question | Owner | Due | Status |
| --- | --- | --- | --- | --- |
| DEC-01 | Confirm four names, matriculation IDs, group number, availability | All | 2026-09-12 | Open |
| DEC-02 | Confirm Coursemology product approval and portal deadline | Member 1 | 2026-09-12 | Open |
| DEC-03 | Select one pilot city and reachable travelers | Member 1 | 2026-09-12 | Open |
| DEC-04 | Select familiar stack, hosting, identity and database | Member 4 + Member 3 | 2026-09-12 | Partly decided 2026-09-14: Next.js + TypeScript; database, auth, hosting open |
| DEC-05 | Verify usable input routes and map/place provider access | Member 2 | 2026-09-12 | Open |
| DEC-06 | Agree shared shapes and fake-provider fixtures | All | 2026-09-12 | Open |
| DEC-07 | Confirm working name and brand direction | Member 4 + Member 1 | 2026-09-15 | Open |
| DEC-08 | Select candidate model plus two alternatives for measurement | Member 2 | 2026-09-15 | Open |

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
- Owner: Member 4 + Member 3. Follow-up: record the database, auth and hosting choice here before D02/D03.

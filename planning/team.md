# Four-person ownership

Names and strengths are pending. Assign real people to these slots at kickoff.
Assumption: comparable availability. Points estimate relative effort and include testing,
documentation, and review; they are not hours or a promise of identical difficulty.

**Changed 2026-09-15:** the team works in two tracks. Members 1 and 2 build the frontend; Members 3 and 4 build the
backend. Task ids changed from A01–D08 to FE01–FE16 and BE01–BE16; the old-to-new mapping is in [decisions.md](decisions.md).

| Slot | Track | Product ownership | Tasks | Graded milestone answers | Primary reviewer | Points |
| --- | --- | --- | --- | --- | --- | ---: |
| Member 1 | Frontend | Shared UI kit, landing page, sign-in and trip setup screens, inbox and place confirmation UI, brand and launch kit | FE01–FE08 | M04, M06, M14, M17, M18 | Member 2 | 40 |
| Member 2 | Frontend | Itinerary editing, map and magazine views, sharing screens, browser tests, funnel analytics, journey integration, pitch visuals | FE09–FE16 | M02, M05, M16, M19, M20 | Member 1 | 40 |
| Member 3 | Backend | AI extraction, place lookup and evidence, import jobs, prompt and model evaluation | BE01–BE08 | M01, M07, M08, M09, M11 | Member 4 | 40 |
| Member 4 | Backend | Database, auth, uploads, deployment, planner and edits, sharing safeguards, timing and cost, submission package | BE09–BE16 | M03, M10, M12, M13, M15 | Member 3 | 40 |

Each member owns five graded answers, including one of the four lower-weight milestones (M01, M02, M03, M14).
M00 and the final pitch are shared: Member 1 assembles M00, Member 2 leads pitch visuals and Member 4 assembles the final package.
Review happens within each track. Integration tasks are reviewed by the other track: FE14 by Member 3, FE15 by Member 4,
BE15 by Member 2. Cross-boundary changes also involve the affected owner.

## Frontend and backend boundary

- The boundary is the API contract in `packages/contracts`. Frontend members change `apps/web/src/features`,
  `components` and `lib`; backend members change `apps/web/src/server`, `packages/ai`, `packages/planner`, `database`
  and `apps/worker`.
- When a screen needs data the API doesn't provide, the frontend owner proposes the contract change and the backend
  owner implements the server side. Both review the PR.
- Frontend builds against the running development API and `@reel/contracts/fixtures`; backend proves behaviour with
  integration tests and `npm run smoke`. Neither track waits for the other.

## Avoid bottlenecks

- Member 4 confirms database, auth and hosting first (BE09). Everyone keeps building on the development stand-ins meanwhile.
- Member 3 publishes candidate-place examples before replacing the fake extractor.
- Member 4 publishes itinerary and conflict examples before changing the planner.
- Member 1 owns the shared UI kit; Member 2 builds the three views from the same itinerary contract.
- Member 4 carries two areas (platform and planner). If BE10–BE13 slip at G2, move planner work to Member 3 after BE06.
- Each owner writes the evidence for their own code; Member 4 does not write everyone's report.
- Member 1 supplies capture and review UX findings and brand visuals; Member 2 supplies journey, analytics and demo
  evidence; Member 3 supplies accuracy measurements; Member 4 supplies schedule, cost, access and release evidence.

## Fairness checks

At each roadmap gate, compare remaining points, actual effort, blockers, and review load.
If someone has over 20% more remaining effort than the team average, transfer an unstarted task
and update its owner/reviewer. Split an unexpectedly large task before transferring it.
Preserve 20% of each person's available time for review, integration, and fixes.

Record actual hours if useful; never use commit counts or the number of documents as a contribution score.
All four people attend one test session, review another member's work, and contribute to the final pitch.

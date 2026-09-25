<div align="center">
  <img src="apps/web/public/images/routelet-mark.jpg" alt="Routelet logo" width="96" />
  <h1>Routelet</h1>
  <p><strong>Turn saved travel inspiration into places you can plan around.</strong></p>
  <p>
    <a href="https://reel-travel.vercel.app">Open the app</a> ·
    <a href="https://github.com/namprice227/reel-travel">Source code</a> ·
    <a href="#run-locally">Run locally</a> ·
    <a href="deliverables/milestones/README.md">Project evidence</a>
  </p>
</div>

Routelet helps travelers collect ideas, identify places from their sources, choose what to visit, and build an editable trip. The itinerary presents the same saved plan as a day view, map, and travel magazine. The application is branded **Routelet**; its repository and deployment URL retain the **Reel Travel** name.

## Team

| Name | Matriculation number | Contributions |
| --- | --- | --- |
| Nguyen Dinh Nam | A0286512A | Built and refined itinerary editing, day and map experiences, place search and swapping, stay-aware routing, and related UI polish. |
| Nguyen Anh Duc | A0281462E | Led application integration and release work, including validated itinerary generation, planner safeguards, Supabase and worker integration, Vercel deployment, and cross-page UX improvements. |
| Goh Rou Shuen | A0300091Y | Contributed frontend foundations and product presentation, including shared UI, landing and trip-setup experiences, place-review flows, and visual review. |
| Zhang Zi Yao | A0272570E | Developed AI extraction and transcription workflows, place-resolution experiments, provider benchmarking, evaluation tooling, and supporting evidence. |

The deployed application is available at **[https://reel-travel.vercel.app/](https://reel-travel.vercel.app/)**. Detailed implementation records are kept in the [contribution log](planning/contributions.csv).

| Collect | Choose | Plan | Share |
| --- | --- | --- | --- |
| Save travel ideas and keep their source. | Review extracted places and select the ones that matter. | Arrange days around dates, stays, and selected places; edit the result. | Share a view of the trip without giving editing access. |

> [!NOTE]
> Offline development uses fictional fixtures. Real imports require configured providers, Supabase, and a running local worker. The worker's computer must remain on for queued imports to finish. See [provider setup](docs/operations/google-places.md) and [worker operations](docs/operations/worker.md).

## Run locally

**Requirements:** Node.js 24 and Python 3. The package also supports Node 22.12+ or 26+; Node 24 is the tested version.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With the default file backend, you can use the offline demo without provider keys. To make local settings explicit, copy [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local`. The local environment file is ignored by Git.

For a synthetic demo trip, run `npm run seed` first. **This resets `.local/dev-data`.** For Supabase-backed development, start with [`apps/web/.env.supabase.example`](apps/web/.env.supabase.example), then follow the [Supabase and Vercel guide](docs/operations/supabase-vercel.md) and run `npm run worker` separately.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js app and API on port 3000 |
| `npm run worker` | Process queued Supabase imports in a separate Node process |
| `npm test` | Run unit and service integration tests |
| `npm run test:db` | Run database checks against a disposable PostgreSQL database using `TEST_DATABASE_URL` |
| `npm run smoke` | Exercise the core HTTP flow against a running app |
| `npm run typecheck` | Type-check the workspaces |
| `npm run check` | Run type checks, tests, API documentation check, and workspace validation |

## How it works

```text
Saved source → extraction with evidence → place lookup → traveler selection
             → itinerary planning and validation → editable trip views
```

The browser and server share validated API contracts in [`packages/contracts`](packages/contracts/README.md). Place extraction and provider interfaces live in `packages/ai`; scheduling and validation live in `packages/planner`. The Next.js app is in `apps/web`, and `apps/worker` runs import jobs. See the [feature specifications](docs/features/README.md), [API reference](docs/api/endpoints.md), and [product scope](docs/product/scope.md) for the boundaries between these parts.

Source evidence and uncertainty stay attached to extracted place candidates. Google Places can supply a provider location for routing; generated prose alone does not establish an address, opening hours, or a booking. The planner validates dates and fixed bookings after itinerary generation. [Google Places usage and retention](docs/operations/google-places.md) and [itinerary AI configuration](docs/operations/itinerary-ai.md) describe the provider rules.

## Project resources

| Resource | What you will find |
| --- | --- |
| [Handover](docs/handover.md) | Where to start when working in the repository |
| [Roadmap and tasks](planning/roadmap.md) | Schedule, with the [task board](planning/tasks.csv) for implementation status |
| [Milestones](deliverables/milestones/README.md) | Assignment answers and evidence links |
| [Contribution log](planning/contributions.csv) | Actual work, review, and AI assistance |
| [Sources and credits](deliverables/references/sources.md) | External resources used by the project |
| [Final handoff](deliverables/final/README.md) | Submission checklist and final materials |

## Significant external resources

| Resource | How it was used |
| --- | --- |
| [Next.js documentation](https://nextjs.org/docs) and [React documentation](https://react.dev/) | Application framework, routing, server rendering, metadata, and component patterns. |
| [Supabase documentation](https://supabase.com/docs) | Authentication, PostgreSQL persistence, private storage, and database functions. |
| [Vercel documentation](https://vercel.com/docs) | Production hosting, environment configuration, builds, and deployment. |
| [OpenAI API documentation](https://platform.openai.com/docs) | Structured place extraction and itinerary generation. |
| [Google Gemini API documentation](https://ai.google.dev/gemini-api/docs) | Multimodal screenshot and public YouTube content extraction. |
| [Google Places API documentation](https://developers.google.com/maps/documentation/places/web-service) | Place verification, location details, photos, opening hours, and map attribution. |
| [Open-Meteo documentation](https://open-meteo.com/en/docs) | Dated weather context used during itinerary planning. |
| [GeoNames](https://www.geonames.org/) [`cities500` data](https://download.geonames.org/export/dump/) | Country-filtered city suggestions; adapted under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). |
| [dnd kit documentation](https://docs.dndkit.com/) | Accessible itinerary stop reordering and movement between days. |

Additional source notes, policy references, and attribution details are recorded in [Sources and credits](deliverables/references/sources.md) and the relevant milestone evidence.

The [standalone landing page](index.html) is published separately through GitHub Pages; its assets and [publishing instructions](apps/web/src/landingPage/README.md) live under `apps/web/src/landingPage`.

## Repository workflow

Work is tracked in [`planning/tasks.csv`](planning/tasks.csv), with feature specs and a shared contract for cross-workspace changes. Pull requests should include relevant checks, sanitized evidence, and review against the task's acceptance criteria. GitHub Actions runs `npm run check`, database tests, and a production build before its deployment job. Run `npm run check` before opening a PR.

Team ownership is recorded in the [team plan](planning/team.md).

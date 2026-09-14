# Web application

Next.js 16 (App Router) serving both the UI and the API.
Member 1 owns UI features. Member 4 owns server identity, storage and sharing.
Member 3 connects preferences and itinerary operations; Member 2 connects import and confirmation.

| Path | What goes here |
| --- | --- |
| `src/app/` | Routes only. Pages render a feature component; `api/[...path]/route.ts` sends every API call to the router |
| `src/features/<feature>/` | Screens and components: auth, landing, trips, inbox, places, itinerary, magazine, sharing |
| `src/components/` | Shared UI: badges, banners, map |
| `src/lib/` | `api-client.ts` (typed client), `use-api.ts` (load and poll), `use-submit.ts`, formatting, analytics |
| `src/server/http/` | Contract router and handler types |
| `src/server/handlers/<feature>.ts` | One handler per endpoint id: unpack the context, call a service |
| `src/server/services/<feature>.ts` | Business rules and ownership checks |
| `src/server/jobs/` | Import pipeline and durable job runner |
| `src/server/db/` | Repository interfaces and the development JSON file store |
| `src/server/auth/` | Session cookie handling (dev sign-in) |
| `src/server/providers.ts` | Picks AI and place providers from env |

Services and jobs never import Next.js or `src/features`, so tests and scripts can call them directly.

Run from the repo root with `npm run dev`. Settings: copy [.env.example](.env.example) to `.env.local`.
Feature behaviour and ownership: [docs/features](../../docs/features/README.md).

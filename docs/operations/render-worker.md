# Deploy the import worker to Render

The checked-in [render.yaml](../../render.yaml) defines one Node 24 background worker in Singapore.
It connects to the existing Supabase project; it does not create another database or public endpoint.
This is a prepared configuration. Account connection, plan acceptance and hosted verification are required.

## Account and service setup

1. Sign in or create an account at [Render](https://dashboard.render.com/).
2. Connect the GitHub repository `namprice227/reel-travel` with access to this repository.
3. Select **New → Blueprint**, choose this repository and the branch containing `render.yaml`.
   Before the PR is merged, use `feat/member4-transcript-place-candidates`. After merging, use `main`.
4. Review the **paid** `0.5c-512mb` compute plan and its current price in the dashboard before creating it.
   This repository does not constitute authorization to purchase a plan.
5. Supply the four prompted values privately in Render: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`. Use the same Supabase project as the Vercel web app.
   Do not copy these values into Git, PR comments or chat. No Google Places key is needed.
6. Keep the root directory at the repository root. The worker imports shared packages and web server services.
   `npm ci --include=dev` retains the locked `tsx` runtime dependency.
7. Deploy the compatible web app first, then apply the Blueprint. Worker startup immediately polls due jobs,
   including previously queued imports in that Supabase project; provider calls may incur usage charges.

Optional model/timeout overrides use the same variable names as `apps/web/.env.example`.
The defaults are sufficient for the recorded local Short test. Never use local file mode when hosted.

## Coordinated releases and checks

Automatic worker deployments are disabled to avoid switching contracts independently of the web app.
For each release, stop the old worker, deploy the web app, then manually deploy the matching worker commit.
After merging this PR, switch the Blueprint/service branch to `main` before future releases.

- Render logs should show `[worker] started` without a port-binding requirement.
- Create an inspiration through the Vercel app; verify prompt enqueue, job success and visible unverified candidates.
- Confirm original source/evidence survive reload and no Google Places call is needed.
- Test long/non-English rejection and confirm the production HTTP executor remains disabled.
- Record the deployed commit and URLs plus restart/recovery behavior in deployment evidence.
- Stop any local worker connected to the same project while verifying the hosted worker, so completion can
  be attributed to Render. Never run incompatible worker versions against one database.

The worker needs no disk: durable state and private uploads remain in Supabase.
See [worker execution and recovery](worker.md) for shutdown, retry and monitoring limits.

References: [Render background workers](https://render.com/docs/background-workers),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[Node version selection](https://render.com/docs/node-version).

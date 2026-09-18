# Deploy the import worker to Render Free

The checked-in [render.yaml](../../render.yaml) defines one Free Node 24 web service in Singapore.
It runs the import loop against the existing Supabase project and exposes only `/health` (GET/HEAD).
The endpoint returns liveness without job controls, source content or credentials.
Render has no free background-worker service. This web service sleeps when idle.

## Account and service setup

1. Sign in or create an account at [Render](https://dashboard.render.com/).
2. Connect the GitHub repository `namprice227/reel-travel` with access to this repository.
3. Select **New → Blueprint**, choose this repository and the branch containing `render.yaml`.
   Before the PR is merged, use `feat/member4-transcript-place-candidates`. After merging, use `main`.
4. Verify the service type is **Web Service** and the compute plan is **Free**. Do not choose a paid fallback.
5. Supply the four prompted values privately in Render: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`. Use the same Supabase project as the Vercel web app.
   Do not copy these values into Git, PR comments or chat. No Google Places key is needed.
6. Keep the root directory at the repository root. The worker imports shared packages and web server services.
   `npm ci --include=dev` retains the locked `tsx` runtime dependency.
7. Apply the Blueprint, set Vercel's server-only `IMPORT_WORKER_URL` to the worker's HTTPS origin without a
   path or query, then redeploy the compatible web app. Worker startup immediately polls due jobs,
   including previously queued imports in that Supabase project; provider calls may incur usage charges.

Optional model/timeout overrides use the same variable names as `apps/web/.env.example`.
The defaults are sufficient for the recorded local Short test. Never use local file mode when hosted.

## Coordinated releases and checks

Automatic worker deployments are disabled to avoid switching contracts independently of the web app.
For each release, stop the old worker, deploy the web app, then manually deploy the matching worker commit.
After merging this PR, switch the Blueprint/service branch to `main` before future releases.

- Render logs should show `[worker] started`; `/health` returns `{"ok":true}` on the Render-supplied `PORT`.
- Create an inspiration through the Vercel app; verify prompt enqueue, job success and visible unverified candidates.
- Confirm original source/evidence survive reload and no Google Places call is needed.
- Test long/non-English rejection and confirm the production HTTP executor remains disabled.
- Record the deployed commit and URLs plus restart/recovery behavior in deployment evidence.
- Stop any local worker connected to the same project while verifying the hosted worker, so completion can
  be attributed to Render. Never run incompatible worker versions against one database.

The worker needs no disk: durable state and private uploads remain in Supabase.
See [worker execution and recovery](worker.md) for shutdown, retry and monitoring limits.

## Free-host wake and recovery limits

After persisting a save, screenshot, retry or added details, Vercel sends a bounded 10-second health request
after responding. It forwards no user data or secrets. Wake failure does not undo the saved job. List polling
does not wake the host; no artificial keep-alive requests are scheduled.

Render sleeps after 15 minutes without incoming traffic and waking can take about a minute. Free services
can restart and have monthly instance-hour, bandwidth and build limits. Free hosting does not cover AI
provider or Supabase usage. Check current account limits and spending settings in Render.

Unattended crash recovery is not guaranteed: the 20-minute abandoned-job threshold can outlast the 15-minute
idle window. A later real import or manual health visit after that threshold may be needed. This is suitable
for a demo with delayed processing, not an always-on guarantee. Record cold wake-up and interrupted-job
recovery separately; a successful warm import does not test them.

References: [Render Free limits](https://render.com/docs/free),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[Node version selection](https://render.com/docs/node-version).

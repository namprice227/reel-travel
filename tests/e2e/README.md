# Local browser acceptance

These scripts use synthetic data. They are separate from `npm run check` and CI.
Tested with Node 24, Playwright 1.63.0 and its Chromium on Windows.

Install the browser harness in the ignored local folder:

```powershell
npm install --prefix .local/browser-tools --no-audit --no-fund playwright@1.63.0
node .local/browser-tools/node_modules/playwright/cli.js install chromium
```

Start a dedicated development app in another terminal. These process environment values override
`apps/web/.env.local`; keep this terminal separate from the real Supabase worker. The unique data folder
protects existing development data. Do not use production or the live Supabase app for these scripts.

```powershell
$env:DATA_BACKEND='file'
$env:ENABLE_DEV_SIGN_IN='true'
$env:AI_PROVIDER='fake'
$env:PLACES_PROVIDER='fake'
$env:FAKE_AI_DELAY_MS='0'
$env:SITE_URL='http://localhost:3006'
$env:REEL_DATA_DIR=Join-Path (Get-Location) ('.local/browser-acceptance-'+[guid]::NewGuid().ToString('N'))
node node_modules/next/dist/bin/next dev apps/web --port 3006
```

Only one Next development process may use this app's default build directory at a time.
Run the checks from the repository root in the test terminal:

```powershell
$env:SMOKE_BASE_URL='http://localhost:3006'
npm run smoke
node --import tsx tests/e2e/home.mjs
node --import tsx tests/e2e/library.mjs
node --import tsx tests/e2e/flow-safety.mjs
node --import tsx tests/e2e/place-verification.mjs
```

- Home: real React components/styles with synthetic intercepted responses and navigation shims; 16 checks.
- Library: Next app/dev sign-in with synthetic intercepted library responses; 13 checks.
- Flow safety: real Next pages, API handlers and file repositories; 9 checks. Skip persistence, unknown-travel
  labels, public stale-plan withholding, owner preview, regeneration and revocation. No API interception.
- HTTP smoke: 13 service checks, including two-account isolation, fake extraction/confirmation, locked bookings,
  editing and sharing. Fake venues are fictional.
- Place verification: synthetic intercepted responses exercise the real button, queued/reloaded/running/failed
  states, polling, retry and explicit confirmation. Service/DB checks are separate.

Screenshots/results stay under `.local/*-browser`. Synthetic accounts/trips remain in the unique data folder
for inspection. Stop the test server afterwards. Hosted Auth/Storage, PostgreSQL concurrency and live provider
accuracy are separate checks; passing these scripts does not establish production acceptance.

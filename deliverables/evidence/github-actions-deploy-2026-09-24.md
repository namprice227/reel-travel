# GitHub Actions production deployment

Added a production deployment job to the existing Check workflow. It depends on the application, database and build checks, and runs only for main pushes or manual main runs. PRs and feature branches cannot invoke it. Deployments are serialized and superseded commits skipped. The Vercel CLI is pinned to 59.25.0; project/org IDs target the existing project. A repository VERCEL_TOKEN secret is required; application secrets stay in Vercel Production.

The production build runs at Vercel so its existing secret and public build-time variables are applied; CI also performs its independent build. Post-deployment smoke checks request the homepage and sign-in page. Worker updates and database migrations remain separate operations. Supabase CLI temporary metadata is excluded from uploads.

Validation: actionlint 1.7.12 passed. Repository check results are recorded in the PR. Live Actions deployment awaits the repository token and merge; no automatic-deployment success is claimed yet.

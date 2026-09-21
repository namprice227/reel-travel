# Sign-in Home redirect — 21 September 2026

## Implemented behavior

After successful password sign-in, the user is directed to `/home`. The same destination is used by the local Alice and Bob development shortcuts when development sign-in is enabled. A `next` query on the sign-in URL no longer overrides this destination.

Account creation still asks the user to confirm their email and does not redirect before a successful sign-in. Authentication services, Supabase settings, session cookies and environment variables were not changed.

## Source

- [Sign-in form](../../apps/web/src/features/auth/SignInForm.tsx)
- Sign-in page: `apps/web/src/app/(site)/sign-in/page.tsx`
- [Browser acceptance](../../tests/e2e/sign-in.mjs)

## Checks

| Check | Result |
| --- | --- |
| `npm run check` | PASS: workspace TypeScript; 395 tests in 31 files; current generated API reference; planning and local-link validation. |
| `node --import tsx tests/e2e/sign-in.mjs` | PASS: password sign-in ignores a `/my-trip/...` `next` query and opens `/home`; the local Alice shortcut also opens `/home`. |
| `git diff --check` (scoped files) | PASS. |

The browser acceptance uses synthetic same-origin authentication responses and headless Edge. It does not verify live Supabase credentials or deployed navigation.

# Routelet branding and pricing — 24 September 2026

Applied the user-supplied blue Routelet logo unchanged to the shared app brand, app icon, root static page and social previews. A new app asset URL avoids serving the previous logo from an image cache. Updated visible legacy product names including privacy/terms and place detail copy.

The static page matches the app’s cobalt actions, navy serif headings, white surfaces, rounded cards and place-selection flow. Its HTML remains at repository root; assets, CSS and JavaScript remain under apps/web/src/landingPage.

Both pricing sections present 3 free trips, approximately S$6.90 per additional Trip Pass and S$8.90/month Pro, with higher allowances and repeated planning as described by the user. Collaboration, premium preferences, affiliate revenue, paid checkout and the future three-trip allowance are not presented as implemented billing behavior. This change does not enforce quotas or take payments.

Validation: npm run check passed (777 tests); production build passed. Isolated Chromium checked the static page at 320, 390, 768, 1024 and 1440px with no horizontal overflow; sample days, keyboard, mobile menu, FAQ, sharing fallback and no-JavaScript navigation passed. Desktop/mobile axe WCAG checks reported zero violations. The built app served the new logo, all SGD prices and a PNG social preview; 390/768/1440px had no horizontal overflow. Desktop screenshots were visually inspected. Final asset-path adjustment rechecked with a build and HTTP image checks. No deployment in this task.

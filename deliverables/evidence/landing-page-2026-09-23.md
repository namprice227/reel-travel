# Standalone marketing page — 23 September 2026

The requested entry point is [root index.html](../../index.html), with JavaScript, CSS and local assets in [apps/web/src/landingPage](../../apps/web/src/landingPage/README.md). The page is independent of the existing Next.js landing page and links to the deployed app. Publishing on GitHub Pages remains a separate step; no deployment is claimed here.

## Milestone coverage

| Requirement | Implemented |
| --- | --- |
| Hero and clear CTA | “Less scrolling. More going.” explains how saved travel inspiration becomes a trip; repeated functional links lead to the app's sign-in/start flow. |
| Features | Collect inspiration, confirm the correct place, create a practical schedule, preserve fixed bookings, use synchronized views and share read-only plans. An interactive three-day illustration shows the product concept without claiming a verified itinerary. |
| Pricing | Current free beta; proposed ~US$15 Trip Pass and ~US$59 annual option explicitly marked not for sale. No invented purchase flow or automatic subscription. |
| SEO | Static title/description, English language, one H1, semantic sections/headings, canonical URL, robots meta, JSON-LD WebSite and a single-page sitemap. |
| Sharing | Static Open Graph and Twitter/X metadata, absolute marketing/image URLs, 1200 × 630 local PNG, image dimensions/type/alt text, favicon, optional native share with clipboard fallback. |
| Hosting | Root HTML and `.nojekyll`; relative assets work under a GitHub Pages project path with no build step. [Publishing instructions](../../apps/web/src/landingPage/README.md). |

Design uses a restrained travel-journal layout, serif editorial accents, clear blue CTAs, a sample itinerary and the repository's existing generated decorative postcards. It does not use external fonts, hotlinked images or unverified social proof. The static social card was authored as SVG and rendered to PNG with Sharp; it requires no hosted image-generation API.

Reference implementation requirements were checked against the [Open Graph protocol](https://ogp.me/) and [GitHub Pages publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). [Remix](https://remix.run/) was inspected for the requested clear messaging/CTA reference; its copy/assets were not reused.

## Local verification

Tested in a fresh headless Chromium context against a local static server mounted at `/reel-travel/`, matching GitHub project-path behavior. The tests made no signed-in app changes.

- No horizontal overflow at 320, 390, 768, 1024 or 1440 pixels.
- Sample-day switching works by click and keyboard; mobile menu opens/closes and Escape restores focus; FAQ disclosures work; clipboard fallback copies the page URL.
- Core content, app links, sample day and navigation remain usable with JavaScript disabled.
- One H1, required sections and canonical metadata checked; all requested local assets load without HTTP errors; no browser JavaScript errors.
- Axe WCAG 2 A/AA and WCAG 2.1 AA scans: zero automated violations on the tested desktop and mobile views after correcting contrast. This is not a claim of complete accessibility certification or independent assistive-technology testing.
- Desktop layout and social card visually inspected. Narrow-screen spacing and screenshots reviewed separately.

Screenshots: [desktop](landing-page-2026-09-23/desktop.png), [mobile](landing-page-2026-09-23/mobile.png), [hero](landing-page-2026-09-23/hero.png). [Social card](../../apps/web/src/landingPage/assets/social-preview.png).

Live GitHub publication, search indexing and real Telegram/WhatsApp/LinkedIn preview rendering remain unverified until the page is published. The metadata currently assumes `https://namprice227.github.io/reel-travel/`, derived from the repository remote. Change those absolute URLs if hosting elsewhere.

Final repository validation: `npm run check` passed (all typechecks, 606 tests in 54 files, API documentation consistency and planning/link validation). `node --check apps/web/src/landingPage/script.js` and `git diff --check` passed. No app code, backend, database, deployed site or payment flow was changed.

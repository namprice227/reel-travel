# Standalone Reel Travel landing page

The entry point is [`/index.html`](../../../../index.html) at the repository root. No Node server, React build or backend is needed to host this page. The product itself stays at <https://reel-travel.vercel.app>; the page's app links point there.

## Files

- `styles.css`: responsive styles, system fonts, focus indicators and reduced-motion support.
- `script.js`: optional mobile menu, illustrative sample-day controls, native sharing/clipboard fallback. The core content and app links work without JavaScript.
- `assets/social-preview.png`: local 1200 × 630 social card; `social-preview.svg` is its editable source.
- `assets/favicon.svg`: standalone favicon.
- `assets/postcards.webp`: an unchanged copy of the existing generated decorative artwork. [Original provenance](../../public/images/home/README.md). This is illustration, not a photo of a user's trip or evidence of a venue.
- Root `.nojekyll`: serve the files directly on GitHub Pages.
- Root `sitemap.xml`: single-page sitemap for the marketing URL.

## Preview locally

From the repository root:

```sh
python3 -m http.server 4174 --bind 127.0.0.1
```

Open <http://127.0.0.1:4174/>. You can also open `index.html` directly, although clipboard/native sharing depends on the browser's secure-context support.

## Publish on GitHub Pages

1. Commit/push these files to the branch you want to publish. The page is not live on GitHub until this step and the Pages configuration are complete.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the branch containing `index.html`, then **/ (root)** and **Save**. Prefer `main` after merging the landing-page changes. Selecting a branch that lacks these files will not publish this page.
5. Wait for the Pages deployment to finish. The expected URL for this repository is **https://namprice227.github.io/reel-travel/**.

CSS, JavaScript and image references are relative, so they work below the `/reel-travel/` project path. Do not move `index.html` into `apps/web` for this deployment. Keep the `.nojekyll` file in the published root.

If the repository/account/domain changes, update the absolute marketing URL in root `index.html` (canonical, Open Graph, Twitter image and JSON-LD) and root `sitemap.xml`. Keep the product CTA destination pointing at the actual app. Search for `namprice227.github.io/reel-travel` to find all marketing-origin references. Metadata must remain in static HTML; social crawlers should not need JavaScript to read it.

GitHub's authoritative instructions: [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Check the public page after publishing

- Visit the Pages URL on desktop and mobile. Test the app links, menu and three sample-day buttons.
- View page source. Verify the title, description, canonical URL and `og:*` tags; they should identify the final public URL.
- Open `https://namprice227.github.io/reel-travel/apps/web/src/landingPage/assets/social-preview.png` directly. It must return the image publicly, not a sign-in page or 404.
- Share the public URL in Telegram/WhatsApp and check the card; use [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) if needed to refresh that platform's cached preview. Platform caches and cropping can differ. The preview cannot be verified before the page/image is public.
- Optionally submit `https://namprice227.github.io/reel-travel/sitemap.xml` through a verified Search Console property. The project-level page includes an index/follow meta directive; it does not control the account domain's root `robots.txt`.

The Open Graph fields follow the [Open Graph protocol](https://ogp.me/). Twitter/X uses `summary_large_image`. The card is a static image so GitHub Pages does not need an image-generation server.

## Product copy and pricing

The free beta is the current option. The approximately US$15 Trip Pass and US$59 annual option are explicitly labeled proposals, not checkout offers. They mirror the existing app landing page; no payments, subscriptions, fabricated reviews, usage statistics or social login are added. All itinerary examples are illustrative. No additional analytics tracker is installed by this standalone page.

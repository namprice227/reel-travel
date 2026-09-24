// Offline browser acceptance: real React components, styles, hooks and API client;
// synthetic HTTP responses and Next navigation shims. Starts no web server.
// Run: node --import tsx tests/e2e/trips.mjs (Playwright installed separately).
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { tripFixture } from "../../packages/contracts/fixtures/index.ts";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const output = ".local/trips-browser";
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {TripsPage} from './apps/web/src/features/trips/TripsPage';
      import {AppNavigation} from './apps/web/src/components/AppNavigation';
      createRoot(document.getElementById('root')).render(<div className="app-shell">
        <AppNavigation email="synthetic@example.test"/><div className="app-stage"><main className="app-main"><TripsPage/></main></div></div>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  tsconfig: "apps/web/tsconfig.json",
  plugins: [{ name: "next-navigation-shims", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, ({ path }) => ({
      loader: "jsx", resolveDir: process.cwd(), contents: path.endsWith("link")
        ? `import React from 'react'; export default function Link({children,...props}) {return <a {...props}>{children}</a>}`
        : `export const usePathname=()=>'/my-trip'; export const useRouter=()=>({push(){},refresh(){}});`,
    }));
  } }],
});
let fonts = "";
const chunks = "apps/web/.next/dev/static/chunks";
for (const file of await readdir(chunks).catch(() => [])) {
  if (/internal_font_google_(figtree|newsreader).*single.css$/.test(file)) {
    const css = await readFile(path.join(chunks, file), "utf8");
    fonts += (css.match(/@font-face\s*\{[^}]+\}/g) ?? []).join("\n").replaceAll("../media/", "/fonts/");
  }
}
const cssFiles = ["globals.css", "styles/trips.css"];
const css = (await Promise.all(cssFiles.map(f => readFile(`apps/web/src/app/${f}`, "utf8")))).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${fonts}\n:root{--font-figtree:Figtree;--font-newsreader:Newsreader;--font-handwriting:'Segoe Print'}\n${css}</style>
  </head><body><div id="root"></div><script src="/preview.js"></script></body></html>`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];
const errors = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
page.on('pageerror', error => errors.push(error.message));
await page.clock.install({ time: new Date('2026-09-20T12:00:00Z') });
const current = { ...tripFixture, id: 'current', title: 'A few days in Tokyo', startDate: '2026-09-19', endDate: '2026-09-22', currentItineraryVersion: 1 };
const draft = { ...tripFixture, id: 'draft', title: 'Kyoto, at our own pace', destination: 'Kyoto, Japan', startDate: '2026-10-10', endDate: '2026-10-14', currentItineraryVersion: null };
const upcoming = { ...tripFixture, id: 'upcoming', title: 'A long weekend in Seoul', destination: 'Seoul, South Korea', startDate: '2026-10-23', endDate: '2026-10-26', currentItineraryVersion: 1 };
const third = { ...draft, id: 'third', title: 'Taipei after dark', destination: 'Taipei, Taiwan', startDate: '2026-11-01', endDate: '2026-11-04' };
const past = { ...current, id: 'past', startDate: '2025-09-19', endDate: '2025-09-22' };
let trips = [current, draft, upcoming, third, past];
let rejectList = false;
let holdList = false;
let releaseList;
let photoMode = false;
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/preview.js') return route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text });
  if (url.pathname === '/api/trips') {
    if (holdList) await new Promise(resolve => { releaseList = resolve; });
    return route.fulfill({ status: rejectList ? 503 : 200, json: rejectList ? { error: { code: 'INTERNAL', message: 'Trips could not be loaded.' } } : { trips } });
  }
  if (url.pathname.startsWith('/fonts/')) return route.fulfill({ path: path.join('apps/web/.next/dev/static/media', path.basename(url.pathname)) });
  if (url.pathname.startsWith('/api/uploads/')) {
    if (!photoMode) return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Upload not found.' } } });
    // Deliberately portrait-shaped synthetic image verifies cropping independently of remote photos.
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1200"><rect width="400" height="1200" fill="#537c93"/></svg>' });
  }
  if (url.hostname === 'trips.test') return route.fulfill({ contentType: 'text/html', body: html });
  return route.abort();
});
const open = async () => {
  await page.goto('http://trips.test/my-trip');
  await page.locator('.trips-body, .trips-first, .trips-error').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(600);
  assert.equal(await page.locator('.trip-tour-layer,.tour-launcher,.trip-getting-started,.tutorial-card,.start-card').count(), 0);
  assert.equal(await page.locator('[inert]').count(), 0);
};
try {
  await open();
  assert.equal(await page.locator('.now-card').count(), 1);
  assert.equal(await page.locator('.trip-card').count(), 3);
  assert.equal(await page.getByRole('link', { name: 'Open today’s plan' }).getAttribute('href'), '/my-trip/current/itinerary?day=2');
  assert.equal(await page.getByRole('link', { name: 'View map', exact: true }).getAttribute('href'), '/my-trip/current/map?day=2');
  pass('Current-day actions retain day context; future trips exclude past trips');
  await page.getByRole('button', { name: 'In planning', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.trip-card').count(), 2);
  assert.equal(await page.getByRole('button', { name: 'In planning', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'With itinerary' }).click();
  assert.equal(await page.locator('.trip-card').count(), 1);
  assert.equal(await page.getByRole('link', { name: 'View itinerary', exact: true }).getAttribute('href'), '/my-trip/upcoming/itinerary');
  await page.getByRole('button', { name: 'All plans' }).click();
  pass('Keyboard-operable filters separate drafts from saved itineraries');
  for (const [name, width, height] of [['desktop',1440,900],['laptop',1280,800],['short',1280,600],['tablet',820,1180],['mobile',390,844],['small-mobile',320,740]]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(600);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    const bounds = await page.evaluate(() => {
      const hero = document.querySelector('.now-card').getBoundingClientRect();
      const cover = document.querySelector('.now-card-cover').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.trip-card-cover')];
      return { overflow: document.documentElement.scrollWidth > innerWidth, coverInside: cover.height <= hero.height, bounded: cards.every(el => el.getBoundingClientRect().height <= 161), clipped: [...document.querySelectorAll('.trips-page a,.trips-page button')].some(el => {const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1;}) };
    });
    assert.equal(bounds.overflow, false);
    assert.equal(bounds.clipped, false);
    assert.ok(bounds.coverInside && bounds.bounded);
    pass(`${name}: no horizontal overflow or clipped actions; bounded artwork`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.trips-section').evaluate(el => getComputedStyle(el).animationName), 'none');
  pass('Reduced-motion preference disables entrance animation');
  trips = [{ ...draft, title: 'A'.repeat(120), destination: 'B'.repeat(120) }];
  await open();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'With itinerary' }).click();
  await page.getByRole('button', { name: 'Show all plans' }).click();
  assert.equal(await page.locator('.trip-card').count(), 1);
  pass('Long trip names wrap; empty filter offers recovery');
  trips = [{ ...current, currentItineraryVersion: null, preferences: { ...current.preferences, accommodation: null } }];
  await open();
  assert.equal(await page.getByRole('link', { name: 'Plan this trip' }).count(), 1);
  assert.equal(await page.getByRole('link', { name: 'View map', exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Add your stay' }).getAttribute('href'), '/my-trip/current/itinerary?settings=preferences');
  pass('Current trip without itinerary offers planning and a missing-stay action');
  trips = [past];
  await open();
  assert.equal(await page.locator('.now-card,.trip-card').count(), 0);
  await page.getByRole('heading', { name: 'Where to next?' }).waitFor();
  assert.equal(await page.getByRole('link', { name: /^All trips/ }).getAttribute('href'), '/my-trip/all');
  pass('Past-only account retains archive access and next-trip action');
  trips = [];
  await open();
  assert.equal(await page.getByRole('heading', { name: 'Where are you going?' }).count(), 1);
  assert.equal(await page.locator('.first-trip-how').count(), 0);
  pass('Empty, single-trip and populated accounts have normal controls without tutorials or focus locks');
  // The page is the create form, so the toolbar must not offer a second, different "Create trip".
  assert.equal(await page.getByRole('link', { name: 'Create trip', exact: true }).count(), 0);
  assert.equal(await page.locator('.first-start .country-card').count(), 7);
  assert.equal(await page.getByRole('button', { name: 'Create trip', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Japan Tokyo, Kyoto, Osaka' }).click();
  assert.equal(await page.getByRole('link', { name: 'Open the full form' }).getAttribute('href'), '/my-trip/new');
  assert.equal(await page.getByRole('link', { name: /Start from a reel instead/ }).getAttribute('href'), '/home');
  pass('Empty state creates in place: country grid, disabled until dates, both escapes visible');
  // The empty state is a form now, so it has a responsive layout of its own to hold.
  for (const [name, width, height] of [['empty', 1280, 900], ['empty-tablet', 768, 900], ['empty-mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await open();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.first-start-row .btn').evaluate(el => {
      const row = el.closest('.first-start').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return box.right > row.right + 1 || box.height < 40;
    }), false);
    // Both escapes stay reachable at every width, and neither sits under the mobile dock
    // once the traveler has scrolled as far as the page goes.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    for (const escape of ['Open the full form', 'Start from a reel instead']) {
      const link = page.getByRole('link', { name: new RegExp(escape) });
      assert.equal(await link.isVisible(), true);
      // Playwright's actionability check: fails if the dock or anything else intercepts the click.
      await link.click({ trial: true });
    }
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  }
  pass('Empty state fits 1280, 768 and 390 with a reachable create button');
  await page.setViewportSize({ width: 1440, height: 900 });
  rejectList = true;
  await open();
  assert.equal(await page.locator('.trips-first').count(), 0);
  rejectList = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('.trips-first').waitFor();
  pass('Empty state links to create; failed request is distinct and retry recovers');
  holdList = true;
  await page.reload();
  await page.getByRole('status').waitFor();
  assert.equal(await page.locator('.trips-first').count(), 0);
  assert.equal(await page.locator('.trips-skeleton').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  holdList = false;
  releaseList();
  await page.locator('.trips-first').waitFor();
  pass('Loading skeleton is announced and respects reduced motion');
  photoMode = true;
  trips = [{ ...current, coverAssetId: 'asset_current_cover' }, draft, upcoming, third];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await open();
    await page.locator('.now-card-cover img').waitFor();
    const frame = await page.locator('.now-card-cover').boundingBox();
    const img = await page.locator('.now-card-cover img').boundingBox();
    assert.equal(Math.round(frame.height), Math.round(img.height));
    assert.ok(frame.height < 330);
    assert.equal(await page.locator('.now-card-cover img').evaluate(el => getComputedStyle(el).objectFit), 'cover');
  }
  pass('Portrait image dimensions cannot expand current-trip cover on desktop or mobile');
  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, scope: 'Offline Chromium with real React, styles, cached Figtree/Newsreader; synthetic trip responses and imagery. Next navigation shimmed; no external network or live persistence verified.' }, null, 2));
} finally { await browser.close(); }

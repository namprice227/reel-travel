// Offline browser acceptance: real React components, styles, hooks and API client;
// synthetic HTTP responses and Next navigation shims. Starts no web server.
// Run: node --import tsx tests/e2e/home.mjs (Playwright installed separately).
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { tripFixture } from "../../packages/contracts/fixtures/index.ts";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const output = ".local/home-browser";
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {HomePage} from './apps/web/src/features/home/HomePage';
      import {AppNavigation} from './apps/web/src/components/AppNavigation';
      import {SaveComposer} from './apps/web/src/features/inbox/SaveComposer';
      createRoot(document.getElementById('root')).render(<div className="app-shell">
        <AppNavigation email="alice@example.test"/><div className="app-stage"><main className="app-main">
        {location.search.includes('library-form') ? <SaveComposer trips={window.previewTrips}/> : <HomePage name="Alice"/>}
        </main></div></div>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  tsconfig: "apps/web/tsconfig.json",
  plugins: [{ name: "next-navigation-shims", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, ({ path }) => ({
      loader: "jsx", resolveDir: process.cwd(), contents: path.endsWith("link")
        ? `import React from 'react'; export default function Link({children,...props}) {return <a {...props}>{children}</a>}`
        : `export const usePathname=()=>'/home'; export const useRouter=()=>({push(){},refresh(){}});`,
    }));
  } }],
});
let fonts = "";
const chunks = "apps/web/.next/dev/static/chunks";
for (const file of await readdir(chunks).catch(() => [])) {
  if (/internal_font_google_(inter|newsreader).*single.css$/.test(file)) {
    const css = await readFile(path.join(chunks, file), "utf8");
    fonts += (css.match(/@font-face\s*\{[^}]+\}/g) ?? []).join("\n").replaceAll("../media/", "/fonts/");
  }
}
const cssFiles = ["globals.css", "styles/home.css", "styles/dashboard.css", "styles/library.css"];
const css = (await Promise.all(cssFiles.map(f => readFile(`apps/web/src/app/${f}`, "utf8")))).join("\n");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${fonts}\n:root{--font-inter:Inter;--font-newsreader:Newsreader;--font-handwriting:'Segoe Print'}\n${css}</style>
  </head><body><div id="root"></div><script src="/preview.js"></script></body></html>`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1586, height: 992 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const trip = { ...tripFixture, title: `${tripFixture.title} (sample data)`, startDate: "2099-10-01", endDate: "2099-10-04" };
let trips = [trip, { ...trip, id: "trip_later", startDate: "2099-11-01", title: "Later trip (sample data)" }];
let rejectSave = false;
let rejectList = false;
const requests = [];
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
await page.route("**/*", async route => {
  const url = new URL(route.request().url());
  const pathname = url.pathname;
  if (pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (pathname === "/api/trips") return route.fulfill({ status: rejectList ? 503 : 200, json: rejectList ? { error: { code: "INTERNAL", message: "Trips could not be loaded." } } : { trips } });
  if (pathname.includes("/inspirations")) {
    requests.push({ path: pathname, body: route.request().postData() });
    return route.fulfill({ status: rejectSave ? 500 : 200, json: rejectSave ? { error: { code: "INTERNAL", message: "Please try saving again." } } : { inspiration: { id: "synthetic_save" } } });
  }
  if (pathname.startsWith("/images/")) return route.fulfill({ path: path.join("apps/web/public", pathname) });
  if (pathname.startsWith("/fonts/")) return route.fulfill({ path: path.join("apps/web/.next/dev/static/media", path.basename(pathname)) });
  return route.fulfill({ contentType: "text/html", body: html });
});
const open = async () => {
  await page.goto("http://home.test/home");
  await page.getByRole("heading", { name: "Turn your saves into a trip" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
};
try {
  await open();
  assert.equal(await page.getByRole("combobox", { name: "Save to" }).count(), 1);
  assert.equal(await page.locator(".composer select option").count(), 2);
  assert.equal(await page.locator(".hs-shortcuts > a").count(), 4);
  assert.equal(await page.getByRole("button", { name: "Save inspiration" }).isDisabled(), true);
  pass("Home has four working shortcuts and an explicit trip picker; blank saves disabled");
  for (const [name, width, height] of [["desktop",1586,992],["laptop",1366,768],["compact",1280,630],["short-desktop",1280,600],["tablet",820,1180],["mobile",375,812],["small-mobile",320,740]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    const bounds = await page.evaluate(() => {
      const form = document.querySelector(".composer").getBoundingClientRect();
      const main = document.querySelector(".app-main").getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, ratio: form.width / main.width,
        clipped: [...document.querySelectorAll('.composer button,.composer-trip,.composer select,.hs-shortcuts > a')].some(el => {
          const r = el.getBoundingClientRect();
          const home = document.querySelector('.home-simple').getBoundingClientRect();
          return r.left < home.left || r.right > home.right || r.bottom > home.bottom;
        }) };
    });
    assert.equal(bounds.overflow, false);
    assert.equal(bounds.clipped, false);
    if (width > 1000) {
      const fits = await page.evaluate(() => {
        const main = document.querySelector('.app-main');
        const footer = document.querySelector('.hs-footer').getBoundingClientRect();
        const icon = document.querySelector('.hs-create .hs-shortcut-icon').getBoundingClientRect();
        const title = document.querySelector('.hs-create strong').getBoundingClientRect();
        return { noScroll: main.scrollHeight <= main.clientHeight + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
          footerVisible: footer.bottom <= innerHeight, titleBesideIcon: title.left >= icon.right && title.top < icon.bottom };
      });
      assert.deepEqual(fits, { noScroll: true, footerVisible: true, titleBesideIcon: true }, `${width}x${height}: ${JSON.stringify(fits)}`);
    }
    if (width > 1300) assert.ok(bounds.ratio > .62 && bounds.ratio < .73);
    pass(`${width}x${height} layout: no horizontal overflow or clipped controls${width > 1000 ? '; full Home fits without scrolling; card title beside icon' : ''}`);
  }
  await page.setViewportSize({ width: 1280, height: 600 });
  for (const mode of ["Note", "Screenshot", "Reel or link"]) {
    await page.getByRole("tab", { name: mode, exact: true }).click();
    await page.screenshot({ path: `${output}/mode-${mode.replaceAll(' ', '-')}.png`, fullPage: true });
    const modeBounds = await page.evaluate(() => {
      const main = document.querySelector('.app-main');
      return { scroll: main.scrollHeight, height: main.clientHeight };
    });
    assert.ok(modeBounds.scroll <= modeBounds.height + 1, `${mode} mode should fit a short desktop: ${JSON.stringify(modeBounds)}`);
  }
  pass("All three save modes fit at 1280x600 without scrolling");
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.getByRole("combobox", { name: "Save to" }).selectOption("trip_later");
  await page.getByLabel("Reel or link", { exact: true }).fill("https://example.com/travel");
  await page.getByRole("button", { name: "Save inspiration" }).click();
  await page.getByRole("status").waitFor();
  assert.equal(requests.at(-1).path, "/api/trips/trip_later/inspirations");
  assert.equal(JSON.parse(requests.at(-1).body).url, "https://example.com/travel");
  assert.ok((await page.getByRole("status").textContent()).includes(trips[1].title));
  pass("Link save uses the explicitly selected trip and confirms its destination");
  await page.getByRole("tab", { name: "Note", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).fill("Synthetic travel note");
  rejectSave = true;
  await page.getByRole("button", { name: "Save inspiration" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("Note", { exact: true }).inputValue(), "Synthetic travel note");
  rejectSave = false;
  await page.getByRole("button", { name: "Save inspiration" }).click();
  await page.getByRole("status").waitFor();
  assert.equal(JSON.parse(requests.at(-1).body).sourceType, "text");
  pass("Failed note save preserves input and can be retried");
  await page.getByRole("tab", { name: "Screenshot", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
  await page.getByText("Choose a PNG, JPEG, WebP or GIF image.").waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6TAAAAABJRU5ErkJggg==", "base64") });
  await page.getByRole("button", { name: "Save inspiration" }).click();
  await page.getByRole("status").waitFor();
  assert.ok(requests.at(-1).path.endsWith("/inspirations/screenshot"));
  assert.ok(requests.at(-1).body.includes('filename="sample.png"'));
  pass("Screenshot validation and multipart upload remain connected");
  await page.getByRole("tab", { name: "Note", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").getAttribute("id"), "composer-home-note");
  pass("Keyboard can switch mode and reach its field");
  await page.addInitScript(value => { window.previewTrips = value; }, trips);
  await page.goto("http://home.test/home?library-form");
  await page.getByRole("combobox").waitFor();
  assert.ok((await page.locator("label.composer-trip").textContent()).includes("Save to"));
  assert.equal(await page.locator("select option").count(), 2);
  pass("Shared library form retains explicit trip selection");
  trips = [];
  await open();
  await page.getByText("Create a trip first, then save reels, screenshots and notes into it.").waitFor();
  assert.equal(await page.locator(".composer a").getAttribute("href"), "/my-trip/new");
  await page.screenshot({ path: `${output}/empty.png`, fullPage: true });
  pass("No-trip state leads to trip creation without pretending a save succeeded");
  rejectList = true;
  await page.reload();
  await page.getByRole("alert").waitFor();
  assert.ok((await page.getByRole("alert").textContent()).includes("Trips could not be loaded"));
  assert.deepEqual(errors, []);
  pass("Trip loading errors are visible; no browser runtime errors");
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, scope: "Offline React preview with synthetic API responses, not a Next server or live Supabase test; cached Inter/Newsreader and handwriting fallback." }, null, 2));
} finally { await browser.close(); }

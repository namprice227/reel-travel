// Offline browser acceptance for F8 Phase 1. Real React/CSS, synthetic API responses, no network.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { placeFixtures, tripFixture } from "../../packages/contracts/fixtures/index.ts";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const output = ".local/saved-places-browser";
await mkdir(output, { recursive: true });

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {TripBuilder} from './apps/web/src/features/trips/TripBuilder';
      import {tripFixture} from './packages/contracts/fixtures/index';
      const trip={...tripFixture,id:'t1',title:'Osaka autumn',destination:'Osaka, Japan',currentItineraryVersion:null};
      createRoot(document.getElementById('root')).render(<main className="app-main"><TripBuilder trip={trip} busy={false} onGenerate={()=>{}} onTripSaved={()=>{}}/></main>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", jsx: "automatic", tsconfig: "apps/web/tsconfig.json",
  plugins: [{ name: "next-shims", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, ({ path }) => ({
      loader: "jsx", resolveDir: process.cwd(), contents: path.endsWith("link")
        ? `import React from 'react'; export default function Link({children,...props}) {return <a {...props}>{children}</a>}`
        : `export const usePathname=()=>'/my-trip/t1/itinerary'; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){},replace(){},refresh(){}});`,
    }));
  } }],
});

let fonts = "";
for (const file of await readdir("apps/web/.next/dev/static/chunks").catch(() => [])) {
  if (/internal_font_google_(figtree|newsreader).*single.css$/.test(file)) {
    const css = await readFile(path.join("apps/web/.next/dev/static/chunks", file), "utf8");
    fonts += (css.match(/@font-face\s*\{[^}]+\}/g) ?? []).join("\n").replaceAll("../media/", "/fonts/");
  }
}
const cssFiles = ["globals.css", "styles/dashboard.css", "styles/trips.css", "styles/itinerary.css"];
const css = (await Promise.all(cssFiles.map((file) => readFile(`apps/web/src/app/${file}`, "utf8")))).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${fonts}\n:root{--font-figtree:Figtree;--font-newsreader:Newsreader;--font-handwriting:'Segoe Print'}\n${css}</style>
  </head><body><div id="root"></div><script src="/preview.js"></script></body></html>`;

const originTrips = [
  { ...tripFixture, id: "t1", title: "Osaka autumn", destination: "Osaka, Japan", currentItineraryVersion: null },
  { ...tripFixture, id: "jp1", title: "Tokyo food trip", destination: "Tokyo, Japan" },
  { ...tripFixture, id: "jp2", title: "Kyoto spring", destination: "Kyoto, Japan" },
  { ...tripFixture, id: "kr1", title: "Seoul weekend", destination: "Seoul, South Korea" },
];
const savedPlace = (id, tripId, country, name) => {
  const base = placeFixtures.confirmed;
  const providerPlaceId = `provider_${id}`;
  const selected = { ...base.selected, providerPlaceId, name, address: `${name} area`,
    details: { ...base.selected.details, providerPlaceId } };
  return { ...base, id, tripId, name, selected, options: [selected],
    evidence: [{ ...base.evidence[0], inspirationId: `insp_${id}`, clue: name,
      classification: { source: "ai", country: { code: country, excerpt: `Synthetic source says ${country}` }, category: null } }] };
};
let currentPlaces = [];
let shelf = [
  savedPlace("jp_a", "jp1", "JP", "Aoyama Coffee"),
  savedPlace("jp_b", "jp1", "JP", "Yanaka Bakery"),
  savedPlace("jp_c", "jp2", "JP", "Kamo Garden"),
  savedPlace("jp_d", "jp2", "JP", "Nishiki Store"),
  savedPlace("kr_a", "kr1", "KR", "Seoul Tea House"),
];

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const checks = [];
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };
page.on("pageerror", (error) => errors.push(error.message));

await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  const method = route.request().method();
  if (url.pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (url.pathname === "/api/trips/t1/places/copy" && method === "POST") {
    const ids = route.request().postDataJSON().placeIds;
    currentPlaces = shelf.filter((place) => ids.includes(place.id)).map((place) => ({ ...place, tripId: "t1" }));
    return route.fulfill({ json: { places: currentPlaces } });
  }
  if (url.pathname === "/api/trips/t1/places") return route.fulfill({ json: { places: currentPlaces } });
  if (url.pathname === "/api/trips/t1/inspirations") return route.fulfill({ json: { inspirations: [] } });
  if (url.pathname === "/api/places") return route.fulfill({ json: { places: shelf } });
  if (url.pathname === "/api/trips") return route.fulfill({ json: { trips: originTrips } });
  if (url.pathname.startsWith("/fonts/")) return route.fulfill({ path: path.join("apps/web/.next/dev/static/media", path.basename(url.pathname)) });
  if (url.hostname === "saved.test") return route.fulfill({ contentType: "text/html", body: html });
  return route.abort();
});

const open = async () => {
  await page.goto("http://saved.test/my-trip/t1/itinerary");
  await page.locator(".builder").waitFor();
  await page.waitForTimeout(100);
};

try {
  const populated = shelf;
  shelf = [];
  await open();
  assert.equal(await page.locator(".builder-shelf").count(), 0);
  assert.equal(await page.getByPlaceholder(/Paste a YouTube Short/).isVisible(), true);
  assert.equal(await page.locator(".builder-new-place").count(), 0);
  pass("day-one account keeps the existing add-first screen");

  shelf = populated;
  await open();
  await page.locator(".builder-shelf-row").first().waitFor();
  assert.equal(await page.locator(".builder-shelf-row").count(), 4);
  assert.equal(await page.getByText("Seoul Tea House").count(), 0);
  assert.equal(await page.locator(".builder-new-place").evaluate((element) => element.open), false);
  assert.equal(await page.getByPlaceholder(/Paste a YouTube Short/).isVisible(), false);
  assert.match(await page.locator(".builder-shelf-row").first().innerText(), /Saved .* on Tokyo food trip/);
  pass("matching saved places lead, another country is excluded, and new capture is collapsed");

  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Add 4 places to this trip" }).click();
  await page.locator(".builder-place").nth(3).waitFor();
  assert.equal(await page.locator(".builder-place").count(), 4);
  assert.equal(await page.locator(".builder-place-mark.is-ok").count(), 4);
  pass("adding four saved places immediately shows four confirmed places in the right column");

  for (const [name, width] of [["desktop", 1280], ["tablet", 768], ["mobile", 390]]) {
    currentPlaces = [];
    await page.setViewportSize({ width, height: 900 });
    await open();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator(".builder-shelf-add").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1;
    }), true);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  }
  pass("picker has no horizontal overflow at 1280, 768, and 390 pixels");
  assert.deepEqual(errors, []);
  pass("no browser runtime errors");
  await writeFile(path.join(output, "results.json"), JSON.stringify({ checks, errors,
    scope: "Offline Chromium with real TripBuilder and CSS; all API data and place details are synthetic." }, null, 2));
} finally {
  await browser.close();
}

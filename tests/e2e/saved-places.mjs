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
      createRoot(document.getElementById('root')).render(<main className="app-main"><TripBuilder trip={trip} busy={false} onGenerate={()=>{window.__generated=true}} onTripSaved={()=>{}}/></main>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, outdir: path.join(output, "bundle"), format: "iife", jsx: "automatic", tsconfig: "apps/web/tsconfig.json", loader: { ".css": "empty" }, define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID": '""', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY": '""' },
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
// Every stylesheet the app loads, in layout order, so a class defined for another screen cannot hide here.
const cssFiles = [...(await readFile("apps/web/src/app/layout.tsx", "utf8")).matchAll(/^import "\.\/(.+\.css)";$/gm)].map((m) => m[1]);
assert.ok(cssFiles.length >= 10, "layout stylesheets found");
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
  // Synthetic addresses name the source trip's city, as provider addresses do; the city drives the outside-city badge.
  const city = { jp1: "Tokyo", jp2: "Kyoto", kr1: "Seoul" }[tripId] ?? "Sample City";
  const selected = { ...base.selected, providerPlaceId, name, address: `${name}, ${city}, Synthetic`,
    details: { ...base.selected.details, providerPlaceId } };
  return { ...base, id, tripId, name, selected, options: [selected],
    evidence: [{ ...base.evidence[0], inspirationId: `insp_${id}`, clue: name,
      classification: { source: "ai", country: { code: country, excerpt: `Synthetic source says ${country}` }, category: null } }] };
};
let currentPlaces = [];
let selectedRequest = null;
let copyRequest = null;
let accountCopyRequest = null;
const tripUpdates = [];
let shelf = [
  savedPlace("jp_a", "jp1", "JP", "Aoyama Coffee"),
  savedPlace("jp_b", "jp1", "JP", "Yanaka Bakery"),
  savedPlace("jp_c", "jp2", "JP", "Kamo Garden"),
  savedPlace("jp_d", "jp2", "JP", "Nishiki Store"),
  savedPlace("kr_a", "kr1", "KR", "Seoul Tea House"),
];
const accountReel = {
  id: "reel_japan", ownerId: "user_fixture", url: "https://www.youtube.com/shorts/ABCDEFGHIJK", details: null,
  status: "ready", failureCode: null, failureMessage: null, attempts: 1, placeIds: ["accountplace_japan"],
  format: "places", tripId: null, createdAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z",
};
const accountOption = { ...savedPlace("account_option", "unused", "JP", "Asakusa Temple").selected, address: "Asakusa Temple, Chuo Ward, Osaka, Synthetic" };
const accountPlace = {
  id: "accountplace_japan", ownerId: "user_fixture", reelId: accountReel.id, name: "Asakusa", area: "Taito City",
  category: "temple", excerpt: "Asakusa in Japan", country: { code: "JP", excerpt: "Japan" },
  mappingStatus: "pending", options: [accountOption], createdAt: accountReel.createdAt, updatedAt: accountReel.updatedAt,
};
let accountShelf = { reels: [accountReel], places: [accountPlace] };

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const checks = [];
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };
page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser error:", error.stack); });

await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  const method = route.request().method();
  if (url.pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (url.pathname === "/api/trips/t1/places/copy" && method === "POST") {
    const body = route.request().postDataJSON();
    const ids = body.placeIds ?? [];
    copyRequest = ids;
    accountCopyRequest = body.accountPlaceIds ?? [];
    currentPlaces = [
      ...shelf.filter((place) => ids.includes(place.id)).map((place) => ({ ...place, id: `copy_${place.id}`, tripId: "t1", copiedFromPlaceId: place.id })),
      ...accountShelf.places.filter((place) => accountCopyRequest.includes(place.id)).map((place) => ({
        ...placeFixtures.pendingUnknownHours,
        id: `copy_${place.id}`, tripId: "t1", name: place.name, options: place.options,
        copiedFromAccountPlaceId: place.id,
      })),
    ];
    return route.fulfill({ json: { places: currentPlaces } });
  }
  if (url.pathname === "/api/trips/t1/places/selection" && method === "PATCH") {
    selectedRequest = route.request().postDataJSON();
    return route.fulfill({ json: { trip: { ...originTrips[0], selectedPlaceIds: selectedRequest.placeIds } } });
  }
  if (url.pathname === "/api/trips/t1" && method === "PATCH") {
    const body = route.request().postDataJSON();
    tripUpdates.push(body);
    return route.fulfill({ json: { trip: { ...originTrips[0], preferences: { ...originTrips[0].preferences, ...body.preferences } } } });
  }
  if (url.pathname === "/api/trips/t1/places") return route.fulfill({ json: { places: currentPlaces } });
  if (url.pathname === "/api/trips/t1/inspirations") return route.fulfill({ json: { inspirations: [] } });
  if (url.pathname === "/api/places") return route.fulfill({ json: { places: shelf } });
  if (url.pathname === "/api/account/reels") return route.fulfill({ json: accountShelf });
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
  const populatedAccount = accountShelf;
  shelf = [];
  accountShelf = { reels: [], places: [] };
  await open();
  await page.locator(".pick-empty").waitFor();
  assert.equal(await page.getByRole("heading", { name: "Add something new" }).isVisible(), true);
  assert.equal((await page.locator(".pick-add").innerText()).split(/\s+/).filter(Boolean).length <= 12, true, "add panel stays short");
  assert.equal(await page.locator(".pick-table").count(), 0);
  assert.equal(await page.getByPlaceholder("Paste a YouTube Short link").isVisible(), true);
  assert.match(await page.locator(".builder-bar").innerText(), /Pick places[\s\S]*Add your stay[\s\S]*Plan the days/);
  pass("day-one account sees an empty table and the add panel, with three planning steps");

  shelf = populated;
  accountShelf = populatedAccount;
  await open();
  await page.locator(".pick-table tbody tr").first().waitFor();
  assert.equal(await page.locator(".pick-table tbody tr").count(), 5);
  assert.equal(await page.getByText("Asakusa Temple").count(), 1);
  assert.equal(await page.getByText("Seoul Tea House").count(), 0);
  assert.equal(await page.locator(".pick-tick:checked").count(), 0);
  assert.deepEqual((await page.locator(".pick-table th").allTextContents()).map((t) => t.trim()), ["Include", "Place", "Type", "Area", "Details"]);
  assert.equal(await page.getByRole("columnheader", { name: /from|location/i }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /Saved ideas.*5/ }).count(), 1);
  assert.deepEqual(await page.locator(".pick-away").allInnerTexts(), Array(4).fill("Address outside Osaka"));
  assert.equal(await page.locator("tr", { hasText: "Asakusa Temple" }).locator(".pick-away").count(), 0);
  pass("account reel places and saved trip places in the trip's country fill the table; another country is absent");
  pass("places from other cities are badged as outside the trip's city; the Osaka place is not");

  for (const box of await page.locator(".pick-tick").all()) await box.check();
  assert.match(await page.locator(".pick-foot").innerText(), /5 places selected/);
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator(".pick-tick").last().focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".pick-tick:checked").count(), 4);
  await page.waitForFunction(() => /4 selected/.test(document.querySelector(".builder-bar").textContent));
  await page.screenshot({ path: path.join(output, "pick-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(output, "pick-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue with 4 places" }).click();
  await page.getByRole("heading", { name: "Where are you staying?" }).waitFor();
  assert.equal(copyRequest.length, 3);
  assert.deepEqual(accountCopyRequest, [accountPlace.id]);
  assert.deepEqual(selectedRequest.placeIds, [...copyRequest, ...accountCopyRequest].map((id) => `copy_${id}`));
  pass("ticking saved places copies the account reel place and three trip places into the trip, by keyboard and without overflow");

  await page.getByLabel("Hotel 1", { exact: true }).fill("Synthetic Hotel A");
  await page.getByRole("button", { name: "Add another hotel" }).click();
  assert.equal(await page.getByLabel("First night at hotel 1").inputValue(), "2026-10-01");
  assert.equal(await page.getByLabel("Last night at hotel 1").inputValue(), "2026-10-02");
  assert.equal(await page.getByLabel("First night at hotel 2").inputValue(), "2026-10-03");
  await page.getByLabel("Hotel 2", { exact: true }).fill("Synthetic Hotel B");
  const layout = await page.locator(".hotel-row").nth(1).evaluate((row) => {
    const box = (el) => el.getBoundingClientRect();
    const name = box(row.querySelector("input[id^=stay-name]"));
    const range = box(row.querySelector(".hotel-range"));
    const head = [...document.querySelectorAll(".hotel-row-head > span")].map(box);
    return { nameWidth: name.width, rangeLeft: range.left, nameRight: name.right, sameLine: Math.abs(name.top - range.top) < 4,
      headAligned: Math.abs(head[1].left - name.left) < 4 && Math.abs(head[2].left - range.left) < 4 };
  });
  assert.ok(layout.nameWidth > 300, `hotel name field is ${layout.nameWidth}px wide`);
  assert.ok(layout.sameLine && layout.rangeLeft > layout.nameRight, "name and nights sit side by side");
  assert.ok(layout.headAligned, "column headings sit over their fields");
  assert.match(await page.locator(".hotel-cover").innerText(), /3 of 3 nights covered/);
  await page.getByLabel("Last night at hotel 1").fill("2026-10-03");
  assert.equal(await page.getByLabel("First night at hotel 2").inputValue(), "2026-10-03");
  assert.match(await page.locator(".builder-page").innerText(), /Two hotels share a night/);
  assert.equal(await page.getByRole("button", { name: /Save and continue/ }).isDisabled(), true);
  await page.getByLabel("Last night at hotel 1").fill("2026-10-02");
  await page.screenshot({ path: path.join(output, "stays-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.getByRole("heading", { name: "How do you like to travel?" }).waitFor();
  assert.deepEqual(tripUpdates[0].preferences.accommodations.map((s) => [s.name, s.checkIn, s.checkOut]),
    [["Synthetic Hotel A", "2026-10-01", "2026-10-02"], ["Synthetic Hotel B", "2026-10-03", "2026-10-03"]]);
  pass("a second hotel starts the night after the first ends, shared nights block saving, and both stays are saved with their nights");

  await page.setViewportSize({ width: 1440, height: 760 });
  const planHeight = await page.locator(".plan-card").evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(planHeight <= 500, `plan card is ${planHeight}px tall`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: /Packed/ }).click();
  await page.getByRole("button", { name: /^Car/ }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.screenshot({ path: path.join(output, "plan-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /Build my days/ }).click();
  await page.waitForFunction(() => window.__generated === true);
  assert.deepEqual(tripUpdates.at(-1).preferences, { pace: "packed", transport: "car", dayStart: "10:00" });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, "plan-mobile.png"), fullPage: true });
  pass("pace, getting around and start time are saved before the days are built");

  for (const [name, width] of [["desktop", 1280], ["tablet", 768], ["mobile", 390]]) {
    currentPlaces = [];
    await page.setViewportSize({ width, height: 900 });
    await open();
    await page.locator(".pick-table").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator(".pick-foot .btn").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth + 1;
    }), true);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  }
  pass("pick step has no horizontal overflow at 1280, 768, and 390 pixels");
  assert.deepEqual(errors, []);
  pass("no browser runtime errors");
  await writeFile(path.join(output, "results.json"), JSON.stringify({ checks, errors,
    scope: "Offline Chromium with real TripBuilder and CSS; all API data and place details are synthetic." }, null, 2));
} finally {
  await browser.close();
}

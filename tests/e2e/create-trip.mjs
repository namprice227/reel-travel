// Offline browser acceptance for /my-trip/new (design "1D"): country, city and dates, one question per screen.
// Real React/CSS, synthetic API responses, no network.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { tripFixture } from "../../packages/contracts/fixtures/index.ts";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const output = ".local/create-trip-browser";
await mkdir(output, { recursive: true });

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {CreateTripPage} from './apps/web/src/features/trips/CreateTripPage';
      createRoot(document.getElementById('root')).render(<main className="app-main"><CreateTripPage/></main>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, outdir: path.join(output, "bundle"), format: "iife", jsx: "automatic", tsconfig: "apps/web/tsconfig.json", loader: { ".css": "empty" }, define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID": '""', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY": '""' },
  plugins: [{ name: "next-shims", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, ({ path }) => ({
      loader: "jsx", resolveDir: process.cwd(), contents: path.endsWith("link")
        ? `import React from 'react'; export default function Link({children,...props}) {return <a {...props}>{children}</a>}`
        : `export const usePathname=()=>'/my-trip/new'; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(url){window.__pushed=url},replace(){},refresh(){}});`,
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

// Dates relative to today so the "no past dates" rule never makes the check stale.
const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let created = null;

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
  if (url.pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (url.pathname === "/api/trips" && route.request().method() === "POST") {
    created = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { trip: { ...tripFixture, ...created, id: "new_trip" } } });
  }
  if (url.pathname.startsWith("/fonts/")) return route.fulfill({ path: path.join("apps/web/.next/dev/static/media", path.basename(url.pathname)) });
  if (url.hostname === "create.test") return route.fulfill({ contentType: "text/html", body: html });
  return route.abort();
});

try {
  await page.goto("http://create.test/my-trip/new");
  await page.getByRole("heading", { name: "Which country are you visiting?" }).waitFor();
  assert.equal(await page.locator(".ask-option").count(), 7);
  assert.equal(await page.getByRole("button", { name: /^Japan/ }).getAttribute("aria-pressed"), "true");
  assert.match(await page.locator(".ask-top").innerText(), /Step 1 of 3/);
  await page.screenshot({ path: path.join(output, "1-country.png"), fullPage: true });
  await page.getByRole("button", { name: /^Continue/ }).click();
  pass("question 1 offers seven countries with Japan chosen, and Continue moves on");

  await page.getByRole("heading", { name: "Where in Japan?" }).waitFor();
  assert.deepEqual(await page.locator(".ask-option-text strong").allInnerTexts(), ["Tokyo", "Kyoto", "Osaka"]);
  await page.getByRole("button", { name: /^Kyoto/ }).click();
  await page.screenshot({ path: path.join(output, "2-city.png"), fullPage: true });
  await page.getByRole("button", { name: /Japan · Change/ }).click();
  await page.getByRole("heading", { name: "Which country are you visiting?" }).waitFor();
  await page.getByRole("button", { name: /^Continue/ }).click();
  assert.equal(await page.getByRole("button", { name: /^Kyoto/ }).getAttribute("aria-pressed"), "true");
  await page.getByLabel("Somewhere else in Japan?").fill("Sapporo");
  assert.equal(await page.getByRole("button", { name: /^Kyoto/ }).getAttribute("aria-pressed"), "false");
  assert.match(await page.locator("#new-trip-city-hint").innerText(), /“Sapporo, Japan”.*can’t check spelling/);
  await page.getByLabel("Somewhere else in Japan?").fill("");
  await page.getByRole("button", { name: /^Continue/ }).click();
  pass("question 2 lists the country's cities, keeps the answer after going back, and accepts another city");

  await page.getByRole("heading", { name: "When are you going?" }).waitFor();
  assert.match(await page.locator(".ask-answers").innerText(), /Japan[\s\S]*Kyoto/);
  assert.equal(await page.getByRole("button", { name: /Create trip/ }).isDisabled(), true);
  const days = page.locator(".range-month").nth(1).locator(".range-grid button:not([disabled])");
  const first = await days.nth(1).getAttribute("aria-label");
  await days.nth(1).click();
  await days.nth(3).click();
  assert.equal(await page.locator(".range-grid button.is-edge").count(), 2);
  assert.equal(await page.locator(".range-grid button.is-inside").count(), 1);
  assert.match(await page.locator(".ask-length").innerText(), /3 of up to 7 days/);
  assert.equal(await page.getByLabel("Start date").count(), 0);
  assert.ok(first);
  pass("two calendar clicks set a three-day range and fill the summary and length bar");

  await page.getByRole("button", { name: "Type dates instead" }).click();
  await page.getByLabel("Start date").fill(iso(10));
  await page.getByLabel("End date").fill(iso(18));
  assert.match(await page.locator(".ask-dates").innerText(), /9 days is longer than 7/);
  assert.equal(await page.getByRole("button", { name: /Create trip/ }).isDisabled(), true);
  await page.getByLabel("End date").fill(iso(13));
  assert.match(await page.locator(".ask-name").innerText(), /Four days in Kyoto/);
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Trip name").fill("Autumn leaves");
  await page.screenshot({ path: path.join(output, "3-dates.png"), fullPage: true });
  await page.getByRole("button", { name: /Create trip/ }).click();
  await page.waitForFunction(() => window.__pushed === "/my-trip/new_trip/itinerary");
  assert.deepEqual(created, { title: "Autumn leaves", destination: "Kyoto", timezone: "Asia/Tokyo", startDate: iso(10), endDate: iso(13) });
  pass("trips over the limit are blocked; a renamed four-day trip is created and opens its planner");

  await page.goto("http://create.test/my-trip/new");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByLabel("Somewhere else in Japan?").fill("x".repeat(200));
  assert.ok((await page.getByLabel("Somewhere else in Japan?").inputValue()).length <= 120 - "Seven days in ".length);
  await page.getByLabel("Somewhere else in Japan?").fill("Kobe");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: "Type dates instead" }).click();
  await page.getByLabel("Start date").fill(iso(10));
  await page.getByLabel("End date").fill(iso(12));
  await page.getByRole("button", { name: /Create trip/ }).click();
  await page.waitForFunction(() => window.__pushed === "/my-trip/new_trip/itinerary");
  assert.equal(created.destination, "Kobe, Japan");
  pass("a custom city retains its country in the saved destination for matching saved places");

  await page.goto("http://create.test/my-trip/new");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByLabel("Somewhere else in Japan?").fill("Kyotto");
  await page.getByRole("button", { name: "Kyoto", exact: true }).click();
  assert.equal(await page.getByLabel("Somewhere else in Japan?").inputValue(), "");
  assert.equal(await page.getByRole("button", { name: /^Kyoto/ }).getAttribute("aria-pressed"), "true");
  await page.getByLabel("Somewhere else in Japan?").fill("osaka");
  assert.equal(await page.getByRole("button", { name: /^Osaka/ }).getAttribute("aria-pressed"), "true");
  assert.match(await page.locator("#new-trip-city-hint").innerText(), /We’ll use Osaka/);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: "Type dates instead" }).click();
  await page.getByLabel("Start date").fill(iso(10));
  await page.getByLabel("End date").fill(iso(11));
  await page.getByRole("button", { name: /Create trip/ }).click();
  await page.waitForFunction(() => window.__pushed === "/my-trip/new_trip/itinerary");
  assert.equal(created.destination, "Osaka");
  pass("a typo suggests the listed city, and a listed city typed in any case is saved as that city");

  // Short laptop window (fit-to-screen starts at 600 px tall): every question fits with nothing above the scroll top.
  for (const [width, height] of [[1210, 620], [1536, 760]]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://create.test/my-trip/new");
    for (const step of [1, 2, 3]) {
      if (step > 1) await page.getByRole("button", { name: /^Continue/ }).click();
      await page.locator(".ask-head h1").waitFor();
      const fit = await page.evaluate(() => {
        const body = document.querySelector(".ask-body").getBoundingClientRect();
        const head = document.querySelector(".ask-head").getBoundingClientRect();
        const scroller = document.querySelector(".ask-body");
        const foot = document.querySelector(".ask-foot").getBoundingClientRect();
        return { clipped: head.top < body.top, overflow: scroller.scrollHeight - scroller.clientHeight, footVisible: foot.bottom <= innerHeight + 1 };
      });
      assert.equal(fit.clipped, false, `step ${step} heading starts inside the panel at ${width}x${height}`);
      assert.ok(fit.overflow <= 1, `step ${step} needs no inner scrolling at ${width}x${height} (overflow ${fit.overflow}px)`);
      assert.ok(fit.footVisible, `step ${step} footer visible at ${width}x${height}`);
      await page.screenshot({ path: path.join(output, `fit-${width}x${height}-step${step}.png`) });
    }
    // A month starting late in the week needs six rows; step forward until one is shown and check again.
    const sixRows = () => page.evaluate(() => [...document.querySelectorAll(".range-grid")].some((grid) => grid.children.length - 7 > 35));
    for (let i = 0; i < 12 && !await sixRows(); i++) await page.getByRole("button", { name: "Next month" }).click();
    assert.ok(await sixRows(), "found a six-row month");
    const overflow = await page.evaluate(() => { const b = document.querySelector(".ask-body"); return b.scrollHeight - b.clientHeight; });
    assert.ok(overflow <= 1, `six-row month needs no inner scrolling at ${width}x${height} (overflow ${overflow}px)`);
    await page.screenshot({ path: path.join(output, `fit-${width}x${height}-six-rows.png`) });
  }
  pass("each question, including a six-row month, fits a 1210x620 and a 1536x760 window without inner scrolling or a clipped heading");

  for (const [name, width] of [["tablet", 768], ["mobile", 390]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://create.test/my-trip/new");
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("heading", { name: "When are you going?" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  }
  pass("the dates question has no horizontal overflow at 768 and 390 pixels");
  assert.deepEqual(errors, []);
  pass("no browser runtime errors");
  await writeFile(path.join(output, "results.json"), JSON.stringify({ checks, errors,
    scope: "Offline Chromium with the real CreateTripPage and CSS; the create API is mocked and trip data is synthetic." }, null, 2));
} finally {
  await browser.close();
}

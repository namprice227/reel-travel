// Offline Home acceptance with synthetic HTTP responses.
// Run: node --import tsx tests/e2e/home.mjs (Playwright installed separately).
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const output = ".local/home-browser";
await mkdir(output, { recursive: true });
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {HomePage} from './apps/web/src/features/home/HomePage';
    import {AppNavigation} from './apps/web/src/components/AppNavigation';
    createRoot(document.getElementById('root')).render(<div className="app-shell">
      <AppNavigation email="alice@example.test"/><div className="app-stage"><main className="app-main">
      <HomePage name="Alice"/></main></div></div>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", tsconfig: "apps/web/tsconfig.json",
  plugins: [{ name: "next-shims", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation|image)$/ }, ({ path }) => ({ path, namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, ({ path }) => ({
      loader: "jsx", resolveDir: process.cwd(), contents: path.endsWith("navigation")
        ? `export const usePathname=()=>'/home'; export const useRouter=()=>({push(){},replace(){},refresh(){}});`
        : path.endsWith("image")
          ? `import React from 'react'; export default function Image(props) {return <img {...props}/>}`
          : `import React from 'react'; export default function Link({children,...props}) {return <a {...props}>{children}</a>}`,
    }));
  } }],
});
const css = (await Promise.all(["globals.css", "styles/home.css", "styles/dashboard.css", "styles/account-reels.css", "styles/library.css"]
  .map((file) => readFile(`apps/web/src/app/${file}`, "utf8")))).join("\n");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>:root{--font-figtree:Arial;--font-newsreader:Georgia;--font-handwriting:cursive}\n${css}</style>
  </head><body><div id="root"></div><script>window.process={env:{NODE_ENV:'development'}};</script><script src="/preview.js"></script></body></html>`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(10000);
const errors = [];
const requests = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const stamp = "2026-09-24T00:00:00.000Z";
let reels = [
  { id: "reel_ready", ownerId: "user_sample", url: "https://youtube.com/shorts/ready", details: null,
    status: "ready", failureCode: null, failureMessage: null, attempts: 1, placeIds: ["accountplace_sample"],
    format: "places", tripId: null, review: "done", createdAt: stamp, updatedAt: stamp },
  { id: "reel_recover", ownerId: "user_sample", url: "https://instagram.com/reel/recover", details: null,
    status: "needs_input", failureCode: "SOURCE_INACCESSIBLE", failureMessage: "Add source details to find places.",
    attempts: 1, placeIds: [], format: null, tripId: null, review: "done", createdAt: stamp, updatedAt: stamp },
];
let places = [{ id: "accountplace_sample", ownerId: "user_sample", reelId: "reel_ready",
  name: "Example Coffee", area: "Omotesando", category: "cafe", excerpt: "Example Coffee in Omotesando",
  country: { code: "JP", excerpt: "Japan" }, mappingStatus: "unverified", options: [], createdAt: stamp, updatedAt: stamp }];
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };
await page.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.hostname === "lh3.googleusercontent.com") return route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64"),
  });
  if (url.pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (url.pathname === "/api/trips") return route.fulfill({ json: { trips: [] } });
  if (url.pathname === "/api/account/reels") {
    requests.push({ method: request.method(), path: url.pathname });
    return route.fulfill({ json: { reels, places } });
  }
  if (url.pathname === "/api/account/library") return route.fulfill({ json: { reels, places } });
  if (url.pathname === "/api/account/reels/reel_ready/places/accountplace_sample/photo") return route.fulfill({
    json: { photo: { imageUrl: "https://lh3.googleusercontent.com/photo", googleMapsUrl: "https://maps.google.com/photo", authors: [] } },
  });
  if (url.pathname === "/api/account/reels/reel_recover/details") {
    reels = reels.map((reel) => reel.id === "reel_recover" ? { ...reel, details: request.postDataJSON().text,
      status: "ready", failureCode: null, failureMessage: null, placeIds: ["accountplace_recovered"] } : reel);
    places.push({ id: "accountplace_recovered", ownerId: "user_sample", reelId: "reel_recover",
      name: "Example Bakery", area: "Kyoto", category: "bakery", excerpt: "Example Bakery in Kyoto",
      country: { code: "JP", excerpt: "Japan" }, mappingStatus: "unverified", options: [], createdAt: stamp, updatedAt: stamp });
    return route.fulfill({ json: { reel: reels[1], job: { id: "reeljob_recovery" } } });
  }
  if (url.pathname.startsWith("/images/")) return route.fulfill({ path: path.join("apps/web/public", url.pathname) });
  return route.fulfill({ contentType: "text/html", body: html });
});
try {
  await page.goto("http://home.test/home");
  await page.getByRole("heading", { name: "From your saves" }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Save to" }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Inspiration library" }).first().getAttribute("href"), "/inspiration-library");
  assert.equal(await page.locator(".sidebar-brand img").getAttribute("src"), "/images/routelet-mark.jpg");
  pass("Home navigation and Routelet logo render");

  await page.getByRole("link", { name: /Example Coffee/ }).waitFor();
  await page.getByRole("button", { name: /1 save unmatched/ }).waitFor();
  assert.equal(await page.locator(".home-reel-shelf").count(), 0);
  assert.equal(await page.locator(".hb-save-tile").count(), 1);
  assert.match(await page.getByRole("link", { name: /Example Coffee/ }).getAttribute("href"), /inspiration-library\?country=JP&place=accountplace_sample/);
  assert.equal(await page.locator(".hb-save-tile").innerText().then((text) => text.includes("YouTube")), false);
  pass("From your saves shows a saved place with a Library link and no reel dropdown");

  await page.getByRole("button", { name: /1 save unmatched/ }).click();
  await page.getByRole("dialog", { name: "Saves to check" }).waitFor();
  await page.getByRole("textbox", { name: "Add place names or the reel caption" }).fill("Example Coffee in Omotesando");
  await page.getByRole("button", { name: "Find places from these details" }).click();
  await page.getByRole("link", { name: /Example Bakery/ }).waitFor();
  assert.equal(places.length, 2);
  await page.getByRole("dialog", { name: "Saves to check" }).waitFor({ state: "hidden" });
  pass("Pending check keeps failed-reel recovery available and the recovered place appears on Home");

  places[0] = { ...places[0], mappingStatus: "pending", options: [
    { providerPlaceId: "google_sample", name: "Example Coffee", details: { provider: "google" } },
  ] };
  await page.reload();
  const savedPhoto = page.locator(".hb-save-tile .account-place-photo img");
  await savedPhoto.waitFor();
  assert.equal(await savedPhoto.evaluate((image) => image.complete && image.naturalWidth > 0), true);
  assert.equal(await page.locator(".hb-save-tile .account-place-photo figcaption a").first().innerText(), "Google Maps");
  await page.locator(".hb-save-tile .account-place-photo figcaption a").first().click({ trial: true });
  await page.getByRole("link", { name: /Example Coffee/ }).click({ trial: true });
  assert.match(await page.getByRole("link", { name: /Example Coffee/ }).getAttribute("href"), /inspiration-library/);
  pass("Home saved place shows its Google photo and source link when a mapped photo is available");

  for (const [name, width, height] of [["desktop", 1280, 800], ["mobile", 375, 812]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    pass(`${name} layout has no horizontal overflow`);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, scope: "Offline React with synthetic API responses" }, null, 2));
} catch (error) {
  console.error("Browser errors:", errors, "Page:", (await page.content()).slice(0, 800));
  throw error;
} finally { await browser.close(); }

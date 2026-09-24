// Offline browser acceptance for the trip settings dialog using real React components and synthetic API data.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { tripFixture } from "../../packages/contracts/fixtures/index.ts";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {TripSettingsDialog} from './apps/web/src/features/trips/TripSettingsDialog';
    function Harness() {
      const [section, setSection] = React.useState('details');
      const [open, setOpen] = React.useState(true);
      return open ? <TripSettingsDialog tripId="synthetic_trip" section={section} onSectionChange={setSection} onClose={() => { window.__closed = true; setOpen(false); }}/> : <p>closed</p>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);`,
    resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", tsconfig: "apps/web/tsconfig.json",
  loader: { ".css": "empty" }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "next-shim", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, ({ path }) => ({ loader: "jsx", resolveDir: process.cwd(), contents: path.endsWith("link")
      ? `import React from 'react'; export default function Link({children,...props}) {return <a {...props}>{children}</a>}`
      : `export const useRouter=()=>({push(){},replace(url){window.__replaced=url},refresh(){}});` }));
  } }],
});

let trip = { ...structuredClone(tripFixture), id: "synthetic_trip", preferences: { ...structuredClone(tripFixture.preferences), accommodations: [
  { name: "Synthetic hotel", location: null, checkIn: "2026-10-02", checkOut: "2026-10-02" },
] } };
let deleteCalls = 0;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (url.pathname === "/api/trips/synthetic_trip" && request.method() === "PATCH") {
    const body = request.postDataJSON();
    trip = { ...trip, ...body, preferences: { ...trip.preferences, ...body.preferences }, updatedAt: new Date().toISOString() };
    return route.fulfill({ json: { trip } });
  }
  if (url.pathname === "/api/trips/synthetic_trip" && request.method() === "DELETE") {
    deleteCalls++;
    return route.fulfill({ json: { ok: true } });
  }
  if (url.pathname === "/api/trips/synthetic_trip") return route.fulfill({ json: { trip } });
  if (url.pathname === "/api/trips/synthetic_trip/places") return route.fulfill({ json: { places: [] } });
  if (url.pathname === "/api/trips/synthetic_trip/reservations") return route.fulfill({ json: { reservations: [] } });
  if (url.hostname === "setup.test") return route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/preview.js"></script>' });
  return route.abort();
});

try {
  await page.goto("http://setup.test/my-trip/synthetic_trip/itinerary?settings=details");
  await page.getByRole("dialog", { name: "Trip settings" }).waitFor();
  await page.getByRole("heading", { name: "Trip details" }).first().waitFor();
  assert.equal(await page.getByLabel("First night").isVisible(), false);
  await page.getByRole("button", { name: "Stays & preferences" }).click();
  assert.equal(await page.getByLabel("First night").count(), 1);
  assert.equal(await page.getByLabel("Last night").count(), 1);
  assert.equal(await page.getByLabel("Last night").getAttribute("max"), "2026-10-03");
  assert.match(await page.getByText(/Check-out is the morning after/).innerText(), /departure day is not a hotel night/);
  console.log("PASS setup explains hotel nights and excludes departure day from the last-night input");

  await page.getByLabel("Last night").fill("2026-10-03");
  await page.getByRole("button", { name: "Fixed bookings" }).click();
  await page.getByRole("button", { name: "Add booking" }).click();
  assert.equal(await page.locator("#booking-date").inputValue(), "2026-10-01");
  await page.getByRole("button", { name: "Trip details", exact: true }).click();
  await page.locator("#setup-start").fill("2026-10-02");
  await page.locator("#setup-end").fill("2026-10-03");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.waitForFunction(() => document.querySelector("#booking-date")?.value === "2026-10-02");
  assert.equal(await page.getByLabel("First night").getAttribute("min"), "2026-10-02");
  assert.equal(await page.getByLabel("Last night").getAttribute("max"), "2026-10-02");
  assert.equal(await page.getByLabel("Last night").inputValue(), "2026-10-02");
  console.log("PASS saving Trip details refreshes Preferences date bounds and resets the booking draft");
  await page.getByRole("button", { name: "Stays & preferences" }).click();
  assert.equal(await page.getByLabel("Last night").isVisible(), true);
  console.log("PASS switching settings sections keeps unsaved drafts mounted");
  const deleteButton = page.getByRole("button", { name: "Delete trip" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await deleteButton.click();
  assert.equal(deleteCalls, 0);
  page.once("dialog", (dialog) => dialog.accept());
  await deleteButton.click();
  await page.waitForFunction(() => window.__replaced === "/my-trip");
  assert.equal(deleteCalls, 1);
  console.log("PASS settings require confirmation before deleting the trip and return to My trips");
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime errors");
} finally {
  await browser.close();
}

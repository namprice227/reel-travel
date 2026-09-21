// Browser acceptance on an isolated local file/fake server. Synthetic account/trip, intercepted place data; no providers.
// Country album/category filtering is covered by tests/integration/library-model.test.ts.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { inspirationFixtures, placeFixtures } from "../../packages/contracts/fixtures/index.ts";
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs")).href);
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3006";
assert.equal(new URL(baseURL).hostname, "localhost");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
const pass = name => console.log(`PASS ${name}`);
try {
  assert.equal((await context.request.post("/api/auth/dev-sign-in", { data: { email: `labels-${Date.now()}@example.test` } })).status(), 200);
  const response = await context.request.post("/api/trips", { data: {
    title: "Synthetic classification", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03",
  } });
  assert.equal(response.status(), 201);
  const { trip } = await response.json();
  const save = { ...inspirationFixtures.ready, tripId: trip.id, status: "needs_confirmation", placeIds: ["place_fr", "place_jp", "place_unknown"] };
  const place = (id, name, country, category) => ({ ...placeFixtures.confirmed, id, name, tripId: trip.id,
    status: "unverified", selected: null, options: [], evidence: [{ ...placeFixtures.confirmed.evidence[0], inspirationId: save.id,
      classification: { source: "ai", country: country ? { code: country, excerpt: "Synthetic source names this country." } : null,
        category: category ? { value: category, excerpt: "Synthetic source describes this activity." } : null } }],
  });
  const places = [place("place_fr", "Sample Cafe", "FR", "food"), place("place_jp", "Example Museum", "JP", "attraction"), place("place_unknown", "Mystery Stop", null, null)];
  await page.route("**/api/trips**", route => {
    const pathname = new URL(route.request().url()).pathname;
    assert.equal(route.request().method(), "GET");
    const body = pathname.endsWith("/inspirations") ? { inspirations: [save] }
      : pathname.endsWith("/places") ? { places, verificationJobs: [] }
      : pathname === "/api/trips" ? { trips: [trip] } : { trip };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/my-trip/${trip.id}/places`);
  await page.getByText("From source (AI): France · Food & drink", { exact: true }).waitFor();
  await page.getByText("From source (AI): Japan · Attractions", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirm", exact: true }).count(), 0);
  await page.getByText("From source (AI): Unsorted \u00b7 Unsorted", { exact: true }).waitFor();
  pass("place cards show AI country/category labels and unknowns without becoming confirmed");
  await page.locator("article").filter({ has: page.getByRole("heading", { name: "Sample Cafe", exact: true }) }).locator("summary").click();
  await page.getByText("Country evidence: Synthetic source names this country.", { exact: true }).first().waitFor();
  await mkdir(".local/source-labels-browser", { recursive: true });
  await page.screenshot({ path: ".local/source-labels-browser/places.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  pass("evidence is readable; mobile has no horizontal overflow or browser errors");
} finally { await browser.close(); }

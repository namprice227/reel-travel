// Real Next UI + API + development file store, with synthetic data and fake providers.
// Run against an isolated dev app: SMOKE_BASE_URL=http://localhost:3006 node --import tsx tests/e2e/flow-safety.mjs
// Never point this test at production: it requires dev sign-in and leaves its synthetic trip for inspection.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Use an isolated local development server");
const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const owner = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
const visitor = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
const page = await owner.newPage();
const publicPage = await visitor.newPage();
const errors = [];
for (const tab of [page, publicPage]) tab.on("pageerror", error => errors.push(error.message));
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const output = ".local/flow-safety-browser";
await mkdir(output, { recursive: true });
async function api(url, data, method = "POST", context = owner) {
  const response = await context.request.fetch(url, { method, ...(data === undefined ? {} : { data }) });
  assert.ok(response.ok(), `${method} ${url}: HTTP ${response.status()}`);
  return response.json();
}
try {
  await api("/api/auth/dev-sign-in", { email: `flow-browser-${Date.now()}@example.test` });
  const { trip } = await api("/api/trips", { title: "Synthetic flow safety trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-04" });
  const root = `/api/trips/${trip.id}`;
  const { inspiration } = await api(`${root}/inspirations`, { sourceType: "link", url: "https://www.instagram.com/reel/synthetic-flow-safety" });
  await page.goto(`/inspiration-library?trip=${trip.id}`);
  await page.getByRole("button", { name: /Open instagram.com/ }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("dialog").getByText("Skipped", { exact: true }).first().waitFor();
  const { inspirations } = await api(`${root}/inspirations`, undefined, "GET");
  assert.equal(inspirations.find(source => source.id === inspiration.id).status, "skipped");
  await page.reload();
  await page.getByRole("button", { name: /Open instagram.com/ }).click();
  await page.getByRole("dialog").getByText("Skipped", { exact: true }).first().waitFor();
  pass("Skip persists through real services and survives reload without losing its source");

  await api(`${root}/reservations`, { title: "Synthetic unlocated dinner", start: "2026-10-01T19:30", end: "2026-10-01T21:00", locked: true });
  const { itinerary } = await api(`${root}/itinerary/generate`, { expectedVersion: null });
  assert.equal(itinerary.validationStatus, "partially_checked");
  assert.ok(itinerary.conflicts.some(conflict => conflict.code === "TRAVEL_UNKNOWN"));
  for (const route of ["timeline", "itinerary", "map"]) {
    await page.goto(`/my-trip/${trip.id}/${route}`);
    await page.getByText("Travel time unknown · arrival not checked", { exact: true }).first().waitFor();
    pass(`Owner ${route} exposes unknown travel from the generated itinerary`);
  }
  const { share, token } = await api(`${root}/shares`, {});
  await publicPage.goto(`/s/${token}`);
  await publicPage.getByText("Travel time unknown · arrival not checked", { exact: true }).first().waitFor();
  assert.equal(await publicPage.getByRole("button", { name: /Edit|Generate|Add stop/ }).count(), 0);
  pass("Signed-out viewer sees the partial plan and has no editing controls");

  const { trip: currentTrip } = await api(root, undefined, "GET");
  await api(root, { destination: "Kyoto", expectedUpdatedAt: currentTrip.updatedAt }, "PATCH");
  const { view } = await api(`/api/shared/${token}`, undefined, "GET", visitor);
  assert.equal(view.stale, true);
  assert.equal(view.itinerary, null);
  assert.deepEqual(view.places, []);
  await publicPage.reload();
  await publicPage.getByText("Itinerary needs updating", { exact: true }).waitFor();
  assert.equal(await publicPage.getByText("Synthetic unlocated dinner", { exact: true }).count(), 0);
  await publicPage.screenshot({ path: `${output}/stale-public.png`, fullPage: true });
  await page.goto(`/my-trip/${trip.id}/share`);
  await page.getByText(/Viewers cannot see the outdated plan/).waitFor();
  pass("Changed inputs withhold stale stops from public API, public page and owner preview");

  await api(`${root}/itinerary/generate`, { expectedVersion: itinerary.version });
  await publicPage.reload();
  await publicPage.getByText("Travel time unknown · arrival not checked", { exact: true }).first().waitFor();
  assert.equal(await publicPage.getByText("Itinerary needs updating", { exact: true }).count(), 0);
  pass("Regeneration restores the existing viewing link");
  await api(`${root}/shares/${share.id}/revoke`, {});
  await publicPage.reload();
  await publicPage.getByText("This link was revoked", { exact: true }).waitFor();
  pass("Revocation removes viewer access");
  assert.deepEqual(errors, []);
  pass("No browser runtime errors");
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, scope: "Local Next app and file repositories; synthetic data/fake providers; no hosted or live AI acceptance." }, null, 2));
} finally { await browser.close(); }

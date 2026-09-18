// Synthetic intercepted API responses exercise the real Places UI. Services and DB are checked separately.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { placeFixtures, tripFixture } from "../../packages/contracts/fixtures/index.ts";
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ headless: true });
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3006";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Use an isolated local development server");
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const checks = [];
const errors = [];
page.on("pageerror", e => errors.push(e.message));
let place = { ...placeFixtures.confirmed, tripId: tripFixture.id, status: "unverified", selected: null, options: [] };
let trip = tripFixture;
let job;
let verifyCalls = 0;
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
try {
  assert.equal((await context.request.post("/api/auth/dev-sign-in", { data: { email: `verify-browser-${Date.now()}@example.test` } })).status(), 200);
  const created = await context.request.post("/api/trips", { data: { title: "Synthetic verification", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" } });
  assert.equal(created.status(), 201);
  trip = (await created.json()).trip;
  place = { ...place, tripId: trip.id };
  await page.route("**/api/trips**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.endsWith("/verify")) {
      verifyCalls++;
      job = { id: `job_synthetic${verifyCalls}`, kind: "verify_place", targetId: place.id, tripId: place.tripId,
        status: "queued", attempt: 0, maxAttempts: 1, lastError: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), runAfter: new Date().toISOString() };
      return send({ job }, 202);
    }
    if (pathname.endsWith("/places")) return send({ places: [place], verificationJobs: job ? [job] : [] });
    if (pathname.endsWith("/confirm")) {
      place = { ...place, status: "confirmed", selected: place.options[0] };
      return send({ place, mergedPlaceIds: [] });
    }
    if (pathname === "/api/trips") return send({ trips: [trip] });
    if (pathname === `/api/trips/${trip.id}`) return send({ trip });
    return route.continue();
  });
  await page.goto(`/my-trip/${trip.id}/places`);
  const verify = page.getByRole("button", { name: "Verify location", exact: true });
  await verify.waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirm", exact: true }).count(), 0);
  pass("unverified card offers verification, not confirmation");
  await verify.click();
  await page.getByRole("button", { name: "Verifying location…", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Verifying location…", exact: true }).isDisabled(), true);
  assert.equal(verifyCalls, 1); pass("queued verification disables duplicate clicks");
  await page.reload();
  await page.getByText("Location search queued. This may take a few minutes.").waitFor();
  pass("queued state survives a page reload");
  job = { ...job, status: "failed", lastError: "Synthetic lookup failure" };
  await page.getByText("Location search failed. Try again.").waitFor();
  assert.equal(await verify.isEnabled(), true); pass("polling exposes failure and allows retry");
  await verify.click();
  await page.getByRole("button", { name: "Verifying location…", exact: true }).waitFor();
  job = { ...job, status: "running", attempt: 1 };
  await page.getByText("Searching for location matches…").waitFor();
  pass("running job displays search progress");
  place = { ...place, status: "pending", options: [placeFixtures.confirmed.selected] };
  job = { ...job, status: "succeeded" };
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await confirm.waitFor();
  assert.equal(await verify.count(), 0); pass("successful match requires explicit confirmation");
  await confirm.click();
  await page.getByRole("heading", { name: "Confirmed" }).waitFor();
  pass("confirmed match leaves the review group");
  assert.deepEqual(errors, []); pass("no browser runtime errors");
  await mkdir(".local/verification-browser", { recursive: true });
  await page.screenshot({ path: ".local/verification-browser/confirmed.png", fullPage: true });
  await writeFile(".local/verification-browser/results.json", JSON.stringify({ checks, errors }, null, 2));
} finally { await browser.close(); }

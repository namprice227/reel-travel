// Real local UI -> HTTP handlers -> repositories -> planner. Only the provider is an offline synthetic fixture.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3006";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Use isolated local file/fake mode only");
const { chromium } = await import(pathToFileURL(path.resolve(".local/browser-tools/node_modules/playwright/index.mjs")).href);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [], checks = [];
page.on("pageerror", e => errors.push(e.message));
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const output = ".local/confirmed-itinerary-browser";
await mkdir(output, { recursive: true });
async function api(url, data, method = "POST") {
  const response = await context.request.fetch(url, { method, ...(data === undefined ? {} : { data }) });
  assert.ok(response.ok(), `${method} ${url}: ${response.status()}`);
  return response.json();
}
async function mutation(button, suffix) {
  const response = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(suffix));
  await button.click(); const result = await response;
  assert.ok(result.ok(), `Mutation ${suffix} failed: ${result.status()}`);
  return result.json();
}
try {
  await api("/api/auth/dev-sign-in", { email: `confirmed-flow-${Date.now()}@example.test` });
  const { trip } = await api("/api/trips", { title: "Synthetic confirmed-to-itinerary", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  const root = `/api/trips/${trip.id}`;
  await api(`${root}/inspirations`, { sourceType: "text", text: "Asakusa Lantern Temple, Harajuku Forest Shrine, Sumida Sky Deck and Ueno Garden Park. Synthetic acceptance input." });
  let candidates = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    candidates = (await api(`${root}/places`, undefined, "GET")).places;
    if (candidates.length === 4) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(candidates.length, 4);
  const before = await context.request.post(`${root}/itinerary/generate`, { data: { expectedVersion: null } });
  assert.equal(before.status(), 409); pass("generation rejects a trip with only unconfirmed candidates");
  await page.goto(`/my-trip/${trip.id}/places`);
  for (const name of ["Asakusa Lantern Temple", "Harajuku Forest Shrine"]) {
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await mutation(card.getByRole("button", { name: "Confirm", exact: true }), "/confirm");
  }
  const rejectedCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Ueno Garden Park", exact: true }) });
  await mutation(rejectedCard.getByRole("button", { name: "Reject", exact: true }), "/reject");
  await page.getByText("2 confirmed places saved to this trip.").waitFor();
  await page.reload(); await page.getByText("2 confirmed places saved to this trip.").waitFor();
  const confirmed = (await api(`${root}/places?status=confirmed`, undefined, "GET")).places;
  assert.equal(confirmed.length, 2); assert.ok(confirmed.every(p => p.selected && p.evidence.length));
  pass("UI confirmation persists in the trip list with selected options and evidence");
  await page.getByRole("link", { name: "Plan itinerary", exact: true }).click();
  await page.getByRole("heading", { name: "Ready to plan" }).waitFor();
  const ready = page.getByRole("region", { name: "Confirmed places ready to plan" });
  for (const place of confirmed) await ready.getByText(place.name, { exact: true }).waitFor();
  assert.equal(await ready.getByText("Sumida Sky Deck", { exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/ready.png`, fullPage: true });
  pass("itinerary page lists confirmed places before generation");
  await api(`${root}/reservations`, { title: "Synthetic fixed dinner", start: "2026-10-01T19:30", end: "2026-10-01T21:00", locked: true });
  const generated = (await mutation(page.getByRole("button", { name: "Generate itinerary", exact: true }), "/itinerary/generate")).itinerary;
  const stops = generated.days.flatMap(d => d.stops);
  assert.deepEqual(new Set(stops.filter(s => s.kind === "place").map(s => s.placeId)), new Set(confirmed.map(p => p.id)));
  const dinner = stops.find(s => s.kind === "reservation");
  assert.equal(dinner.start, "19:30"); assert.equal(dinner.end, "21:00"); assert.equal(dinner.locked, true);
  assert.equal(generated.validationStatus, "partially_checked");
  pass("Generate saves a real plan with only confirmed places and preserves the fixed booking");
  for (const route of ["itinerary", "timeline", "map"]) {
    await page.goto(`/my-trip/${trip.id}/${route}`);
    for (const place of confirmed) await page.getByText(place.name, { exact: false }).first().waitFor();
    await page.getByText("Hours not checked", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("Sumida Sky Deck", { exact: false }).count(), 0);
    assert.equal(await page.getByText("Ueno Garden Park", { exact: false }).count(), 0);
    assert.equal((await api(`${root}/itinerary`, undefined, "GET")).itinerary.version, generated.version);
    await page.screenshot({ path: `${output}/${route}.png`, fullPage: true });
    pass(`${route} renders the saved version and its confirmed stops after navigation/reload`);
  }
  await page.goto(`/my-trip/${trip.id}/timeline`);
  const targetName = confirmed[0].name;
  const targetRow = page.locator(".tl-list > li").filter({ has: page.getByRole("heading", { name: new RegExp(targetName) }) });
  const removed = (await mutation(targetRow.getByRole("button", { name: "Remove", exact: true }), "/itinerary/edits")).itinerary;
  assert.ok(removed.unscheduledPlaceIds.includes(confirmed[0].id));
  const unscheduled = page.locator("section").filter({ has: page.getByRole("heading", { name: /Not scheduled/ }) });
  await unscheduled.getByText(targetName, { exact: true }).waitFor();
  const restored = (await mutation(unscheduled.getByRole("button", { name: "Add", exact: true }), "/itinerary/edits")).itinerary;
  assert.ok(!restored.unscheduledPlaceIds.includes(confirmed[0].id));
  assert.equal((await api(`${root}/places?status=confirmed`, undefined, "GET")).places.length, 2);
  pass("removing and adding a stop retains its confirmed place and saves new itinerary versions");
  await page.goto(`/my-trip/${trip.id}/places`);
  const third = page.locator("article").filter({ has: page.getByRole("heading", { name: "Sumida Sky Deck", exact: true }) });
  await mutation(third.getByRole("button", { name: "Confirm", exact: true }), "/confirm");
  await page.getByRole("link", { name: "Plan itinerary", exact: true }).click();
  await page.getByText("Trip details or places changed. Regenerate to update this itinerary.").waitFor();
  const updated = (await mutation(page.getByRole("button", { name: "Regenerate", exact: true }), "/itinerary/generate")).itinerary;
  assert.equal(updated.days.flatMap(d => d.stops).filter(s => s.kind === "place").length, 3);
  await page.getByText("Sumida Sky Deck", { exact: true }).first().waitFor();
  pass("another confirmation marks the old plan stale; Regenerate includes the new place");
  // Error-only interception checks that missing provider metadata is not silently rendered as valid.
  await page.route(`**/api/trips/${trip.id}/places?*`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Synthetic confirmed list unavailable" } }) }));
  await page.reload(); await page.getByRole("alert").getByText(/Synthetic confirmed list unavailable/).waitFor();
  await page.unroute(`**/api/trips/${trip.id}/places?*`);
  await page.getByRole("button", { name: "Retry loading places" }).click();
  await page.getByText("Sumida Sky Deck", { exact: true }).first().waitFor();
  pass("confirmed-place loading errors are visible and recoverable");
  assert.deepEqual(errors, []); pass("no browser runtime errors");
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, generatedVersion: generated.version, scope: "Local real UI/API/file store/planner; fictional provider data; not live OSM accuracy." }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  await writeFile(`${output}/failure.txt`, await page.locator("body").innerText());
  throw error;
} finally { await browser.close(); }

// Called by a local acceptance harness with a disposable authenticated trip.
// Place/photo responses and image bytes are synthetic and intercepted; this module creates no accounts.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { inspirationFixtures, itineraryFixtures, placeFixtures } from "../../packages/contracts/fixtures/index.ts";

export async function checkPlacePhotos({ baseURL, trip, token }) {
  assert.equal(new URL(baseURL).hostname, "localhost");
  const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs")).href);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "reel_session", value: token, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const checks = [];
  const pass = text => { checks.push(text); console.log(`PASS ${text}`); };
  const option = id => ({ ...placeFixtures.confirmed.selected, providerPlaceId: id, name: `Synthetic ${id}`,
    details: { ...placeFixtures.confirmed.selected.details, provider: "google", providerPlaceId: id } });
  const a = option("photo_a"), b = option("photo_b");
  const candidate = { ...placeFixtures.confirmed, tripId: trip.id, status: "ambiguous", selected: null, options: [a, b] };
  let requests = 0, mode = "ok", generated = false;
  try {
    await page.route("https://lh3.googleusercontent.com/**", route => mode === "broken"
      ? route.abort()
      : route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#dbeafe"/><text x="35" y="240" font-size="24">Synthetic place photo fixture</text></svg>' }));
    await page.route("**/api/trips**", route => {
      const url = new URL(route.request().url());
      const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname.endsWith("/photo")) {
        requests++;
        if (mode === "limited") return send({ error: { code: "RATE_LIMITED", message: "Synthetic limit" } }, 429);
        if (url.searchParams.get("providerPlaceId") === "photo_b") return send({ photo: null });
        return send({ photo: { imageUrl: "https://lh3.googleusercontent.com/synthetic-photo", googleMapsUrl: "https://maps.google.com/synthetic-photo",
          authors: [{ name: "Synthetic photographer", url: "https://maps.google.com/synthetic-author", avatarUrl: null }] } });
      }
      if (url.pathname.endsWith("/places")) return send({ places: [candidate], verificationJobs: [] });
      if (url.pathname.endsWith("/itinerary")) return send({ itinerary: generated ? { ...itineraryFixtures.valid, tripId: trip.id } : null, stale: false });
      if (url.pathname.endsWith("/inspirations")) return send({ inspirations: [{ ...inspirationFixtures.ready, tripId: trip.id, placeIds: [candidate.id] }] });
      if (url.pathname === "/api/trips") return send({ trips: [trip] });
      return send({ trip });
    });
    await page.goto(`/my-trip/${trip.id}/places`);
    await page.getByRole("radio").first().waitFor();
    assert.equal(requests, 0);
    pass("ambiguous matches do not fetch photos before branch selection");
    await page.getByRole("radio").first().check();
    const image = page.getByRole("img", { name: "Synthetic photo_a", exact: true });
    await image.waitFor();
    await page.waitForFunction(() => document.querySelector('figure img')?.naturalWidth > 0);
    assert.equal(requests, 1);
    assert.equal(await page.getByRole("link", { name: "Synthetic photographer", exact: true }).getAttribute("href"), "https://maps.google.com/synthetic-author");
    assert.equal(await page.getByRole("link", { name: "Google Maps", exact: true }).getAttribute("href"), "https://maps.google.com/synthetic-photo");
    pass("chosen branch shows a loaded image with photographer and Google Maps links");
    await mkdir(".local/place-photos-browser", { recursive: true });
    await image.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".local/place-photos-browser/desktop.png" });
    await page.getByRole("radio").last().check();
    await page.getByText("Photo unavailable", { exact: true }).waitFor();
    assert.equal(await image.count(), 0);
    assert.equal(requests, 2);
    pass("switching branches discards the old image and handles no photo");
    mode = "broken";
    await page.reload();
    await page.getByRole("radio").first().check();
    await page.getByText("Photo unavailable", { exact: true }).waitFor();
    pass("broken image falls back without hiding place details");
    mode = "limited";
    await page.reload();
    await page.getByRole("radio").first().check();
    await page.getByText("Photo unavailable", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm selected", exact: true }).isEnabled(), true);
    pass("rate-limited photos do not block confirmation controls");
    mode = "ok";
    candidate.status = "confirmed"; candidate.selected = a;
    await page.goto(`/my-trip/${trip.id}/itinerary`);
    await page.getByRole("heading", { name: "Ready to plan", exact: true }).waitFor();
    await image.waitFor();
    pass("confirmed place photo appears in the itinerary ready list");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    await page.screenshot({ path: ".local/place-photos-browser/mobile.png" });
    assert.deepEqual(errors, []);
    pass("mobile layout has no horizontal overflow or browser exceptions");
    await page.setViewportSize({ width: 1280, height: 900 });
    generated = true;
    await page.reload();
    const magazineImage = page.getByRole("img", { name: "Sumida Sky Deck", exact: true });
    await magazineImage.waitFor();
    await page.getByRole("link", { name: "Synthetic photographer", exact: true }).waitFor();
    pass("generated magazine stop uses the confirmed Google photo with attribution");
    await page.goto(`/inspiration-library?trip=${trip.id}`);
    await page.locator(".library-save").click();
    await page.getByRole("dialog").getByRole("img", { name: candidate.name, exact: true }).waitFor();
    pass("inspiration detail panel shows the matched place photo");
    assert.deepEqual(errors, []);
    return checks;
  } finally { await browser.close(); }
}

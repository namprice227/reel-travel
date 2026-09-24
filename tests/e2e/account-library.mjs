// Place-first Inspiration Library acceptance against a running development app.
// All sources and places below are synthetic; no external services are called.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({ headless: true, executablePath });
const baseURL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const output = ".local/account-library-browser";
await mkdir(output, { recursive: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const at = "2026-09-24T00:00:00.000Z";
const reels = ["japan", "thailand", "unknown", "trip"].map((name) => ({
  id: `reel_${name}`, ownerId: "user_browser", url: `https://www.youtube.com/shorts/${name}`,
  details: null, status: "ready", failureCode: null, failureMessage: null, attempts: 1,
  placeIds: [], format: "places", tripId: name === "trip" ? "trip_draft" : null, createdAt: at, updatedAt: at,
}));
const place = (id, reelId, name, area, category, country) => ({
  id, ownerId: "user_browser", reelId, name, area, category,
  excerpt: `Synthetic evidence for ${name}`, country, mappingStatus: country ? "not_found" : "unverified", options: [], createdAt: at, updatedAt: at,
});
const mappedOption = {
  providerPlaceId: "google-kumo", name: "Kumo Ramen Shibuya", address: "Jinnan, Shibuya, Tokyo",
  location: { lat: 35.6614, lng: 139.701 },
  details: {
    provider: "google", providerPlaceId: "google-kumo", fetchedAt: at, category: "restaurant",
    openingHours: { status: "unknown" }, typicalVisitMinutes: null, priceLevel: null,
    unknownFields: ["openingHours"], attribution: "Google Maps", photos: [], summary: null,
    rating: null, ratingCount: null, websiteUrl: null, providerUrl: null, phone: null, reviews: [],
    types: [], priceRange: null, dineIn: null, takeout: null, delivery: null, reservable: null,
    servesVegetarianFood: null, servesBeer: null, servesWine: null, outdoorSeating: null,
    goodForChildren: null, goodForGroups: null, restroom: null, paymentOptions: null,
    accessibilityOptions: null,
  },
};
const places = [
  place("place_ramen", "reel_japan", "Kumo Ramen", "Omotesando", "restaurant", { code: "JP", excerpt: "Japan" }),
  place("place_garden", "reel_japan", "Lantern Garden", "Nara", "garden", { code: "JP", excerpt: "Japan" }),
  place("place_paper", "reel_japan", "Paper & Pines", "Kyoto", "shopping", { code: "JP", excerpt: "Japan" }),
  place("place_temple", "reel_thailand", "Golden Garden", "Chiang Mai", "temple", { code: "TH", excerpt: "Thailand" }),
  place("place_harbor", "reel_unknown", "Harbor Lookout", null, "viewpoint", null),
  place("place_trip", "reel_trip", "Trip-only place", "Tokyo", "cafe", { code: "JP", excerpt: "Japan" }),
];
places[0].mappingStatus = "pending";
places[0].options = [mappedOption];

try {
  await page.route("https://lh3.googleusercontent.com/synthetic-account-place", (route) => route.fulfill({
    status: 200, contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#d8e8df"/><text x="32" y="245" font-size="28">Synthetic Google place photo</text></svg>',
  }));
  await page.route("**/api/account/reels/*/places/*/photo**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ photo: {
      imageUrl: "https://lh3.googleusercontent.com/synthetic-account-place",
      googleMapsUrl: "https://maps.google.com/synthetic-account-place",
      authors: [{ name: "Synthetic photographer", url: "https://maps.google.com/synthetic-author", avatarUrl: null }],
    } }),
  }));
  const signin = await context.request.post("/api/auth/dev-sign-in", {
    data: { email: `account-library-${Date.now()}@example.test` },
  });
  assert.equal(signin.status(), 200);
  await page.route("**/api/account/library", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ reels, places }),
  }));

  await page.goto("/inspiration-library");
  await page.getByRole("heading", { name: "Your countries" }).waitFor();
  assert.equal(await page.locator(".library-album").count(), 2);
  assert.match(await page.locator(".account-library-unknown").innerText(), /1 place needs/);
  assert.equal((await page.locator("body").innerText()).includes("Trip-only place"), false);
  await page.screenshot({ path: path.join(output, "countries.png"), fullPage: true });

  await page.getByRole("link", { name: /Open Japan, 4 place ideas/ }).click();
  await page.getByRole("heading", { name: "Places in Japan" }).waitFor();
  await page.getByRole("button", { name: "Open Trip-only place" }).waitFor();
  assert.equal(await page.locator(".account-place-card").count(), 4);
  await page.getByRole("img", { name: "Kumo Ramen Shibuya" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Google Maps", exact: true }).getAttribute("href"),
    "https://maps.google.com/synthetic-account-place");
  assert.equal((await page.locator("body").innerText()).includes("youtube.com/shorts/japan"), false);
  await page.getByRole("button", { name: "Open Kumo Ramen" }).click();
  await page.getByRole("heading", { name: "Kumo Ramen" }).waitFor();
  await page.getByTitle("Google Maps: Kumo Ramen Shibuya").waitFor();
  assert.match(await page.getByText("Jinnan, Shibuya, Tokyo").first().innerText(), /Shibuya/);
  assert.match(await page.getByText("https://www.youtube.com/shorts/japan").innerText(), /youtube/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Search places").fill("Nara");
  assert.equal(await page.locator(".account-place-card").count(), 1);
  await page.getByLabel("Search places").fill("");
  await page.screenshot({ path: path.join(output, "japan.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pass: true, albums: 2, accountPlaces: 6, tripPlacesShown: 1, mobileOverflow: false }));
} finally {
  await browser.close();
}

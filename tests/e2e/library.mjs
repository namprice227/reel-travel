// Browser acceptance against a running development app. API content is synthetic and intercepted;
// only dev sign-in creates a fresh example.test account. Run the API smoke separately for real services.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspirationFixtures, placeFixtures, tripFixture } from "../../packages/contracts/fixtures/index.ts";

const { chromium } = await import(
  pathToFileURL(
    path.resolve(process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs"),
  ).href
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const output = ".local/library-browser";
await mkdir(output, { recursive: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1536, height: 900 } });
const errors = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const waitCount = (selector, count) =>
  page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, {
    selector,
    count,
  });
const trips = [
  tripFixture,
  { ...tripFixture, id: "trip_kyoto", destination: "Kyoto, Japan", title: "Kyoto ideas (sample data)" },
  { ...tripFixture, id: "trip_busan", destination: "Busan", title: "Busan ideas (sample data)" },
  { ...tripFixture, id: "trip_bangkok", destination: "Bangkok", title: "Bangkok ideas (sample data)" },
  { ...tripFixture, id: "trip_unknown", destination: "Somewhere", title: "Unsorted ideas (sample data)" },
];
const note = (id, tripId, text) => ({ ...inspirationFixtures.processing, id, tripId, text, status: "skipped" });
const data = {
  [tripFixture.id]: {
    inspirations: [
      inspirationFixtures.ready,
      inspirationFixtures.needsConfirmation,
      inspirationFixtures.inaccessibleLink,
    ],
    places: [placeFixtures.confirmed, placeFixtures.ambiguousBranch],
  },
  trip_kyoto: {
    inspirations: [
      note("kyoto_note", "trip_kyoto", "Sample: a quiet afternoon in Kyoto"),
      {
        ...inspirationFixtures.ready,
        id: "kyoto_shrine",
        tripId: "trip_kyoto",
        placeIds: [placeFixtures.pendingUnknownHours.id],
        status: "needs_confirmation",
      },
    ],
    places: [placeFixtures.pendingUnknownHours],
  },
  trip_busan: { inspirations: [note("busan_note", "trip_busan", "Sample: seaside walks in Busan")], places: [] },
  trip_bangkok: { inspirations: [note("bangkok_note", "trip_bangkok", "Sample: explore Bangkok")], places: [] },
  trip_unknown: { inspirations: [note("unknown_note", "trip_unknown", "Sample: find this destination")], places: [] },
};
let empty = false;
let failLoad = false;
let created = 0;
const mutations = [];
try {
  const signin = await context.request.post("/api/auth/dev-sign-in", {
    data: { email: `library-browser-${Date.now()}@example.test` },
  });
  assert.equal(signin.status(), 200);
  await page.route("**/api/trips**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/");
    const tripId = parts[3];
    const kind = parts[4];
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/trips") return json({ trips: empty ? [] : trips });
    if (!data[tripId]) return route.continue();
    if (route.request().method() === "GET") {
      if (failLoad) return json({ error: { code: "INTERNAL", message: "Synthetic load failure" } }, 500);
      if (kind === "inspirations") return json({ inspirations: data[tripId].inspirations });
      if (kind === "places") return json({ places: data[tripId].places });
    }
    if (kind === "inspirations" && route.request().method() === "POST") {
      mutations.push(url.pathname);
      if (parts[6] === "details" || parts[6] === "retry" || parts[6] === "skip") {
        const save = data[tripId].inspirations.find((save) => save.id === parts[5]);
        if (parts[6] === "skip") save.status = "skipped";
        else {
          save.status = "queued";
          save.details = parts[6] === "details" ? route.request().postDataJSON().text : save.details;
        }
        return json({ inspiration: save });
      }
      const screenshot = parts[5] === "screenshot";
      const body = screenshot ? {} : route.request().postDataJSON();
      const save = {
        ...note(`created_${++created}`, tripId, body.text ?? null),
        sourceType: screenshot ? "screenshot" : body.sourceType,
        url: body.url ?? null,
        assetId: screenshot ? "browser_screenshot" : null,
        status: "queued",
      };
      data[tripId].inspirations.unshift(save);
      return json({ inspiration: save, job: {} }, 201);
    }
    return route.continue();
  });
  await page.route("**/api/uploads/browser_screenshot", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/inspiration-library");
  await waitCount(".library-album", 4);
  assert.match(await page.locator(".library-album").first().innerText(), /Japan\s+5 saves/);
  await page.screenshot({ path: `${output}/countries-desktop.png` });
  pass("Country albums merge Tokyo and Kyoto and retain Unsorted");

  await page.getByRole("searchbox").fill("Busan");
  await waitCount(".library-save", 1);
  assert.match(await page.locator(".library-save").innerText(), /South Korea/);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("link", { name: "Open Japan, 5 saves" }).click();
  await waitCount(".library-save", 5);
  await page.reload();
  await waitCount(".library-save", 5);
  assert.match(page.url(), /country=JP/);
  pass("Global search and reloadable country navigation");

  await page.getByRole("button", { name: /^Food & drink/ }).click();
  await waitCount(".library-save", 1);
  assert.match(await page.locator(".library-save").innerText(), /Kumo Ramen/);
  await page.getByRole("button", { name: /^Attractions/ }).click();
  await waitCount(".library-save", 2);
  await page.getByRole("button", { name: /^All\s*\d*$/ }).click();
  await page.locator("#library-city").selectOption("Kyoto");
  await waitCount(".library-save", 2);
  await page.locator("#library-city").selectOption("");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  assert.equal(await page.locator(".library-saves.is-list .library-save").count(), 5);
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.screenshot({ path: `${output}/japan-desktop.png` });
  pass("Category, city, grid and list controls");

  const branch = page.getByRole("button", { name: "Open Kumo Ramen", exact: true });
  await branch.click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /Choose a branch/);
  assert.match(await page.getByRole("dialog").innerText(), /fictional/);
  assert.equal(
    await page.getByRole("link", { name: "Review places", exact: true }).getAttribute("href"),
    `/my-trip/${tripFixture.id}/places`,
  );
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.querySelector("dialog").contains(document.activeElement)), true);
  }
  await page.screenshot({ path: `${output}/details-desktop.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await branch.evaluate((element) => element === document.activeElement), true);
  pass("Source drawer preserves ambiguity, sample labels, focus trap and Escape focus return");

  await page.getByRole("link", { name: /Needs review/ }).click();
  await waitCount(".library-save", 4);
  await page.getByRole("button", { name: /Open instagram.com/ }).click();
  await page.getByLabel("Add details", { exact: true }).fill("light museum");
  await page.getByRole("button", { name: "Add details and retry", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("dialog")?.textContent.includes("Finding places"));
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "https://www.instagram.com/reel/example", exact: true })
      .count(),
    1,
  );
  assert(mutations.some((url) => url.endsWith("/details")));
  await page.keyboard.press("Escape");
  pass("Needs review and source recovery keep the original link");

  await page.goto(`/inspiration-library?trip=${tripFixture.id}`);
  await waitCount(".library-save", 3);
  assert.match(await page.locator(".library-trip-scope").innerText(), /Tokyo long weekend/);
  pass("Existing trip-scoped library links still filter correctly");

  for (const mode of ["Note", "Reel or link", "Screenshot"]) {
    await page.getByRole("button", { name: "Add inspiration", exact: true }).click();
    await page.getByRole("tab", { name: mode, exact: true }).click();
    if (mode === "Note") await page.getByRole("textbox", { name: "Note", exact: true }).fill("Sample: new travel note");
    else if (mode === "Reel or link")
      await page.getByRole("textbox", { name: "Reel or link", exact: true }).fill("https://example.test/travel");
    else
      await page
        .locator('input[type="file"]')
        .setInputFiles({
          name: "synthetic.png",
          mimeType: "image/png",
          buffer: await readFile("apps/web/public/images/library/country-covers.png"),
        });
    await page.getByRole("button", { name: "Save and find places", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await waitCount(".library-save", 3 + created);
  }
  assert.equal(created, 3);
  pass("Add dialog submits notes, links and screenshots and refreshes the collection");

  // Simulate a later extractor result and wait for the page's polling to update it.
  const newest = data[tripFixture.id].inspirations[0];
  newest.status = "needs_input";
  newest.failureMessage = "Synthetic screenshot needs details";
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".library-save")].some(
      (el) => el.textContent.includes("Screenshot") && el.textContent.includes("Needs details"),
    ),
  );
  pass("Queued imports poll through to a review state");

  await page.getByRole("button", { name: "Open Saved screenshot", exact: true }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("dialog")?.textContent.includes("Finding places"));
  newest.status = "needs_input";
  await page.getByRole("button", { name: "Skip", exact: true }).waitFor();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("dialog")?.textContent.includes("Skipped"));
  assert(mutations.some((url) => url.endsWith("/retry")));
  assert(mutations.some((url) => url.endsWith("/skip")));
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "Open Saved screenshot", exact: true }).count(), 1);
  pass("Retry and skip work in the drawer and preserve the saved screenshot");

  await page.getByRole("searchbox").fill("no matching inspiration anywhere");
  await page.getByText("No saves here yet", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await waitCount(".library-save", 6);
  pass("Empty search state can clear filters");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/inspiration-library?country=JP");
  await waitCount(".library-save", 8);
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.equal(await noOverflow(), true);
  await page.screenshot({ path: `${output}/japan-mobile.png`, fullPage: true });
  await page.locator(".library-save").first().click();
  assert.equal(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await page.keyboard.press("Escape");
  await page.goto("/inspiration-library");
  await waitCount(".library-album", 4);
  assert.equal(await noOverflow(), true);
  await page.screenshot({ path: `${output}/countries-mobile.png`, fullPage: true });
  pass("375px albums, gallery and drawer have no horizontal overflow");

  failLoad = true;
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "Synthetic load failure" }).waitFor();
  failLoad = false;
  await page.getByRole("button", { name: "Reload library", exact: true }).click();
  await waitCount(".library-album", 4);
  empty = true;
  await page.reload();
  await page.getByText("Your next adventure starts with a save", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add inspiration", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Create trip", exact: true }).waitFor();
  pass("Load-error retry and no-trip empty state");
  assert.deepEqual(errors, []);
  pass("No browser runtime errors");
  console.log(`${checks.length} browser checks passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}

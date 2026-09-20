import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? '.local/browser-tools/node_modules/playwright/index.mjs',
)).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => route.abort());
  const dir = path.resolve('docs/design/my-trip-ux-v2');
  await page.goto(pathToFileURL(path.join(dir, 'review-board.html')).href);
  const boards = page.locator('.board');
  assert.equal(await boards.count(), 5);
  for (let i = 0; i < 5; i++) {
    await boards.nth(i).screenshot({ path: path.join(dir, `0${i + 1}-preview.png`) });
  }
  const overflow = await page.locator('.app,.panel,.phone,.content,.board').evaluateAll(elements =>
    elements.filter(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
      .map(el => ({ class: el.className, width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight })),
  );
  assert.deepEqual(overflow, []);
  await page.pdf({ path: path.join(dir, 'review-board.pdf'), printBackground: true, preferCSSPageSize: true });
  await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
  for (let n = 1; n <= 5; n++) {
    await page.locator(`button[data-n="${n}"]`).click();
    assert.equal(await page.locator('#preview').getAttribute('src'), `0${n}-preview.png`);
    assert.equal(await page.locator('button[aria-pressed="true"]').count(), 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  const result = {
    pages: 5, overflow, errors,
    gallery: 'Five screen selectors and 390px gallery layout checked',
    scope: 'Static design board and review gallery checks only. No application behavior, real Google map or external upload verified.',
  };
  await writeFile(path.join(dir, 'layout-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}

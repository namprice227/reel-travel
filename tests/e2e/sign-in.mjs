// Offline browser acceptance for post-sign-in navigation. Real SignInForm and API client;
// synthetic same-origin auth responses and a Next navigation shim. No credentials leave the process.
// Run: node --import tsx tests/e2e/sign-in.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const { chromium } = await import(pathToFileURL(path.resolve(
  process.env.PLAYWRIGHT_MODULE_PATH ?? ".local/browser-tools/node_modules/playwright/index.mjs",
)).href);
const output = ".local/sign-in-browser";
await mkdir(output, { recursive: true });

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {SignInForm} from './apps/web/src/features/auth/SignInForm';
      const development = new URLSearchParams(location.search).get('development') === '1';
      createRoot(document.getElementById('root')).render(<SignInForm development={development}/>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  tsconfig: "apps/web/tsconfig.json",
  define: { process: JSON.stringify({ env: { NODE_ENV: "test", VITEST: "true" } }) },
  plugins: [{ name: "next-navigation-shim", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, () => ({
      loader: "js",
      contents: `export const useRouter=()=>({replace:path=>{window.__destination=path;history.replaceState(null,'',path);},refresh(){window.__refreshed=true;}});`,
    }));
  } }],
});

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const requests = [];
const checks = [];
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
await page.route("**/*", async route => {
  const url = new URL(route.request().url());
  if (url.pathname === "/preview.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
  if (url.pathname === "/api/auth/sign-in" || url.pathname === "/api/auth/dev-sign-in") {
    requests.push(url.pathname);
    return route.fulfill({ json: { user: { id: "user_test", email: "alice@example.test", displayName: "Alice", createdAt: "2026-09-21T00:00:00.000Z" } } });
  }
  return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div><script src="/preview.js"></script></body></html>' });
});

try {
  await page.goto("http://signin.test/sign-in?next=%2Fmy-trip%2Ftrip_123");
  await page.waitForTimeout(100);
  if (errors.length) throw new Error(`Sign-in preview failed: ${errors.join("; ")}`);
  await page.getByLabel("Email").fill("alice@example.test");
  await page.getByLabel("Password").fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("http://signin.test/home");
  assert.equal(await page.evaluate(() => window.__destination), "/home");
  assert.equal(requests.at(-1), "/api/auth/sign-in");
  pass("Password sign-in ignores next and opens Home");

  await page.goto("http://signin.test/sign-in?development=1&next=%2Fmy-trip");
  await page.getByRole("button", { name: "Alice" }).click();
  await page.waitForURL("http://signin.test/home");
  assert.equal(await page.evaluate(() => window.__destination), "/home");
  assert.equal(requests.at(-1), "/api/auth/dev-sign-in");
  pass("Alice/Bob development shortcut path also opens Home");
  assert.deepEqual(errors, []);

  await page.screenshot({ path: `${output}/home-destination.png`, fullPage: true });
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, scope: "Offline browser check with synthetic auth responses; no live Supabase authentication." }, null, 2));
} finally {
  await browser.close();
}

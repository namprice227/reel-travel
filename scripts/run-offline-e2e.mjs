import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const candidates = process.platform === "win32"
  ? [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ]
  : process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];

const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || candidates.find(existsSync);
if (!executablePath) {
  throw new Error("No Chromium-family browser found. Set PLAYWRIGHT_EXECUTABLE_PATH before running offline browser checks.");
}

for (const file of ["tests/e2e/saved-places.mjs", "tests/e2e/my-trip-ux.mjs"]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", file], {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_EXECUTABLE_PATH: executablePath },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

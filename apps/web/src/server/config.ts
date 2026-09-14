import fs from "node:fs";
import path from "node:path";

let repoRoot: string | undefined;

/** The folder whose package.json declares workspaces, so paths work from apps/web or the repo root. */
function findRepoRoot(): string {
  if (repoRoot) return repoRoot;
  let dir = process.cwd();
  for (;;) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { workspaces?: unknown };
      if (pkg.workspaces) return (repoRoot = dir);
    } catch {
      // no package.json here; keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return (repoRoot = process.cwd());
    dir = parent;
  }
}

/** Read lazily so tests and scripts can set env vars before first use. Names are listed in apps/web/.env.example. */
export const config = {
  get dataDir() {
    return process.env.REEL_DATA_DIR || path.join(findRepoRoot(), ".local", "dev-data");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get devSignInEnabled() {
    return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_SIGN_IN === "true";
  },
  get workerSecret() {
    return process.env.WORKER_SECRET || null;
  },
  get aiProvider() {
    return process.env.AI_PROVIDER || "fake";
  },
  get placesProvider() {
    return process.env.PLACES_PROVIDER || "fake";
  },
  get fakeAiDelayMs() {
    return Number(process.env.FAKE_AI_DELAY_MS ?? 1200);
  },
};

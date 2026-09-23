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
  get dataBackend(): "file" | "supabase" {
    const backend = process.env.DATA_BACKEND ?? (process.env.NODE_ENV === "production" ? "supabase" : "file");
    if (backend !== "file" && backend !== "supabase") throw new Error("DATA_BACKEND must be file or supabase.");
    if (backend === "file" && process.env.NODE_ENV === "production") throw new Error("The file store cannot run in production.");
    return backend;
  },
  get dataDir() {
    return process.env.REEL_DATA_DIR || path.join(findRepoRoot(), ".local", "dev-data");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get devSignInEnabled() {
    return process.env.NODE_ENV !== "production" && this.dataBackend === "file" && process.env.ENABLE_DEV_SIGN_IN !== "false";
  },
  /** Short synthetic imports, or dev override via ENABLE_INLINE_IMPORTS=true. Real/durable jobs run in the supervised Node worker. */
  get inlineImportsEnabled() {
    if (process.env.ENABLE_INLINE_IMPORTS === "true") return true;
    return !this.isProduction && this.dataBackend === "file" && this.aiProvider === "fake" && this.placesProvider === "fake";
  },
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get supabasePublishableKey() {
    return required("SUPABASE_PUBLISHABLE_KEY");
  },
  get siteUrl() {
    const url = new URL(process.env.SITE_URL ?? "http://localhost:3000");
    if (this.isProduction && url.protocol !== "https:") throw new Error("SITE_URL must use HTTPS in production.");
    return url.origin;
  },
  get workerSecret() {
    return process.env.WORKER_SECRET || null;
  },
  get analyticsEndpoint() {
    const raw = process.env.ANALYTICS_ENDPOINT?.trim();
    if (!raw) return null;
    const url = new URL(raw);
    if (this.isProduction && url.protocol !== "https:") throw new Error("ANALYTICS_ENDPOINT must use HTTPS in production.");
    return url.toString();
  },
  get analyticsWriteKey() {
    return process.env.ANALYTICS_WRITE_KEY?.trim() || null;
  },
  get aiProvider() {
    return process.env.AI_PROVIDER || "fake";
  },
  get placesProvider() {
    const provider = process.env.PLACES_PROVIDER || (this.aiProvider === "openai" ? "google" : "fake");
    if (!["fake", "google", "openstreetmap", "none"].includes(provider)) throw new Error("Unsupported PLACES_PROVIDER.");
    if (this.isProduction && provider === "google" && process.env.GOOGLE_PLACES_POLICY_REVIEWED !== "true") {
      throw new Error("Production Google Places persistence is disabled until GOOGLE_PLACES_POLICY_REVIEWED=true after a retention, attribution and billing review.");
    }
    return provider;
  },
  get extractionWorkflow(): "multimodal" | "legacy" {
    return (process.env.EXTRACTION_WORKFLOW as "multimodal" | "legacy") || (process.env.NODE_ENV === "test" ? "legacy" : "multimodal");
  },
  get fakeAiDelayMs() {
    return Number(process.env.FAKE_AI_DELAY_MS ?? 1200);
  },
  get itineraryProvider(): "baseline" | "openai" {
    const provider = process.env.ITINERARY_PROVIDER?.trim() || (this.aiProvider === "openai" ? "openai" : "baseline");
    if (provider !== "baseline" && provider !== "openai") throw new Error("Unsupported ITINERARY_PROVIDER.");
    return provider;
  },
};

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required for Supabase. See docs/operations/supabase-vercel.md.`);
  return value;
}

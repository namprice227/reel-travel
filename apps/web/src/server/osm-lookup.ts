import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createNominatimPlaceLookup } from "@reel/ai/real-providers";
import { config } from "./config";
import { repos } from "./db";

/** Shared DB clock/atomic limiter spans isolated job processes and the manual runner. */
export async function waitForOsmRequest(): Promise<void> {
  for (;;) {
    const permit = await repos().rateLimits.consume("provider:nominatim:requests", {
      now: Date.now(), windowMs: 15_500, limit: 1,
    });
    if (permit.allowed) return;
    await sleep(Math.max(1, permit.retryAfterSeconds) * 1000);
  }
}

export function createOsmLookup() {
  return createNominatimPlaceLookup({ endpoint: process.env.NOMINATIM_SEARCH_URL?.trim() || undefined,
    cacheDir: process.env.NOMINATIM_CACHE_DIR?.trim() || path.join(config.dataDir, "nominatim-cache"),
    timeoutMs: process.env.NOMINATIM_TIMEOUT_MS?.trim() ? Number(process.env.NOMINATIM_TIMEOUT_MS) : undefined,
    beforeRequest: waitForOsmRequest });
}

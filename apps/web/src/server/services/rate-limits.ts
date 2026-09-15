import { repos } from "../db";
import { AppError } from "../errors";

export const SHARE_CREATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };
export const SHARE_VIEW_LIMIT = { limit: 120, windowMs: 60_000 };

/** Enforcement belongs in the service so direct server callers cannot bypass it. */
export async function enforceRateLimit(key: string, policy: { limit: number; windowMs: number }): Promise<void> {
  const result = await repos().rateLimits.consume(key, { ...policy, now: Date.now() });
  if (!result.allowed) {
    throw new AppError("RATE_LIMITED", `Too many requests. Try again in ${result.retryAfterSeconds} seconds.`, {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

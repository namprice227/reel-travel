import { afterEach, expect, it, vi } from "vitest";
const { consume, sleep } = vi.hoisted(() => ({ consume: vi.fn(), sleep: vi.fn(async () => {}) }));
vi.mock("../../apps/web/src/server/db", () => ({ repos: () => ({ rateLimits: { consume } }) }));
vi.mock("node:timers/promises", () => ({ setTimeout: sleep }));
import { waitForOsmRequest } from "../../apps/web/src/server/osm-lookup";
afterEach(() => { vi.resetAllMocks(); });

it("waits for the shared database permit instead of fetching on denial", async () => {
  consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 16 }).mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
  await waitForOsmRequest();
  expect(consume).toHaveBeenCalledTimes(2);
  expect(consume).toHaveBeenCalledWith("provider:nominatim:requests", { now: expect.any(Number), windowMs: 15500, limit: 1 });
  expect(sleep).toHaveBeenCalledWith(16000);
});

it("fails closed when the shared limiter fails", async () => {
  consume.mockRejectedValue(Error("Synthetic database unavailable"));
  await expect(waitForOsmRequest()).rejects.toThrow("Synthetic database unavailable");
  expect(sleep).not.toHaveBeenCalled();
});

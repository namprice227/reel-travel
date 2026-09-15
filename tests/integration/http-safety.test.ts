import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharedViewFixture, userFixture } from "@reel/contracts/fixtures";
import { AppError } from "../../apps/web/src/server/errors";

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("../../apps/web/src/server/auth/session", () => ({ requireUser: async () => userFixture }));
vi.mock("../../apps/web/src/server/handlers", () => ({ handlers: {
  "reservations.create": handle, "shared.get": handle, "jobs.runDue": handle,
} }));
const { dispatch } = await import("../../apps/web/src/server/http/router");
beforeEach(() => { handle.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("HTTP validation and sharing responses", () => {
  it("rejects cross-origin cookie mutations before invoking a service", async () => {
    const response = await dispatch(new Request("https://example.test/api/trips/trip_1/reservations", {
      method: "POST", headers: { Origin: "https://untrusted.example.test" }, body: "{}",
    }));
    expect(response.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects worker secrets with equal character counts but different byte lengths", async () => {
    vi.stubEnv("WORKER_SECRET", "abcd");
    const response = await dispatch(new Request("https://example.test/api/internal/jobs/run-due", {
      method: "POST", headers: { "x-worker-secret": "éééé" },
    }));
    expect(response.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });
  it("rejects an impossible booking date before calling the handler", async () => {
    const response = await dispatch(new Request("https://example.test/api/trips/trip_1/reservations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Synthetic booking", start: "2026-02-29T12:00", end: "2026-02-29T13:00" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED", details: {
      issues: expect.arrayContaining([expect.objectContaining({ path: "body.start" })]),
    } } });
    expect(handle).not.toHaveBeenCalled();
  });

  it("sends the retry delay on rate-limit responses without caching them", async () => {
    handle.mockRejectedValue(new AppError("RATE_LIMITED", "Try later", { retryAfterSeconds: 42 }));
    const response = await dispatch(new Request("https://example.test/api/shared/test-token"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("prevents HTTP caching of public views so revocation is checked on reload", async () => {
    handle.mockResolvedValue({ view: sharedViewFixture });
    const response = await dispatch(new Request("https://example.test/api/shared/test-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

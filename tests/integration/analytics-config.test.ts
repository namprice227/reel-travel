import { afterEach, expect, it, vi } from "vitest";
import { deliverAnalytics } from "../../apps/web/src/server/analytics";
import { config } from "../../apps/web/src/server/config";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("delivers bounded product metadata through the server-side sink", async () => {
  vi.stubEnv("ANALYTICS_ENDPOINT", "https://analytics.example.test/events");
  vi.stubEnv("ANALYTICS_WRITE_KEY", "synthetic-secret");
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

  await deliverAnalytics("plan_generated", { version: 2, conflicts: 0 });

  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe("https://analytics.example.test/events");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-secret");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    name: "plan_generated",
    props: { version: 2, conflicts: 0 },
    sentAt: expect.any(String),
  });
});

it("rejects content-sized analytics properties before delivery", async () => {
  vi.stubEnv("ANALYTICS_ENDPOINT", "https://analytics.example.test/events");
  await expect(deliverAnalytics("import_started", { sourceText: "x".repeat(201) })).rejects.toThrow();
});

it("fails closed for Google Places in production until policy review is acknowledged", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PLACES_PROVIDER", "google");
  vi.stubEnv("GOOGLE_PLACES_POLICY_REVIEWED", "false");
  expect(() => config.placesProvider).toThrow(/policy/i);
  vi.stubEnv("GOOGLE_PLACES_POLICY_REVIEWED", "true");
  expect(config.placesProvider).toBe("google");
});

it("rejects unknown place providers", () => {
  vi.stubEnv("PLACES_PROVIDER", "synthetic-typo");
  expect(() => config.placesProvider).toThrow(/Unsupported PLACES_PROVIDER/);
});

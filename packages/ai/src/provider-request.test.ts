import { expect, it, vi } from "vitest";
import { providerJson } from "./provider-request";

// Synthetic responses only; no network calls.
const url = "https://provider.example.test/v1";

it("retries busy and rate-limited replies within the supplied delays", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("busy", { status: 503 }))
    .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  expect(await providerJson(url, {}, { fetch: fetcher, code: "EXTRACTION_ERROR", retryDelaysMs: [0, 0] })).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("gives up after the last delay with a transient provider error", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private body", { status: 502 }));
  await expect(providerJson(url, {}, { fetch: fetcher, code: "LOOKUP_ERROR", retryDelaysMs: [0] }))
    .rejects.toMatchObject({ code: "LOOKUP_ERROR", transient: true, message: expect.not.stringContaining("private body") });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not retry client errors, network failures without opt-in, or calls without delays", async () => {
  const clientError = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 400 }));
  await expect(providerJson(url, {}, { fetch: clientError, code: "EXTRACTION_ERROR", retryDelaysMs: [0, 0] })).rejects.toMatchObject({ transient: false });
  expect(clientError).toHaveBeenCalledTimes(1);
  const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("private credential"));
  await expect(providerJson(url, {}, { fetch: offline, code: "EXTRACTION_ERROR" }))
    .rejects.toMatchObject({ transient: true, message: expect.not.stringContaining("private credential") });
  expect(offline).toHaveBeenCalledTimes(1);
});

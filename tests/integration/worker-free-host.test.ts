import http from "node:http";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { startHealthServer } from "../../apps/worker/src/health";
import { dispatchImport, wakeImportWorker } from "../../apps/web/src/server/jobs/dispatch-import";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("serves only public liveness and shuts down on abort; no job controls or data", async () => {
  const stop = new AbortController();
  const server = await startHealthServer(0, stop.signal);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  const get = (path: string, method = "GET") => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: address.port, path, method }, res => {
      let body = ""; res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject); req.end();
  });
  try {
    expect(await get("/health")).toEqual({ status: 200, body: '{"ok":true}' });
    expect(await get("/health", "HEAD")).toEqual({ status: 200, body: "" });
    expect((await get("/health", "POST")).status).toBe(404);
    expect((await get("/jobs")).status).toBe(404);
  } finally {
    const closed = once(server, "close"); stop.abort(); await closed;
  }
});

it("wakes only after a persisted import response and sends no job/source/credentials", async () => {
  vi.stubEnv("DATA_BACKEND", "supabase"); vi.stubEnv("IMPORT_WORKER_URL", "https://synthetic.onrender.com");
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const tasks: (() => Promise<unknown>)[] = [];
  dispatchImport("job_private", task => tasks.push(task));
  expect(fetcher).not.toHaveBeenCalled(); expect(tasks).toHaveLength(1);
  await tasks[0]!();
  expect(String(fetcher.mock.calls[0]![0])).toBe("https://synthetic.onrender.com/health");
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
  expect(fetcher.mock.calls[0]![1]?.headers).toBeUndefined();
  expect(fetcher.mock.calls[0]![1]?.body).toBeUndefined();
});

it("keeps local dedicated-worker mode when no hosted origin is set", () => {
  vi.stubEnv("DATA_BACKEND", "supabase"); vi.stubEnv("IMPORT_WORKER_URL", "");
  const after = vi.fn(); dispatchImport("job_synthetic", after); expect(after).not.toHaveBeenCalled();
});

it.each(["http://worker.invalid", "https://secret@worker.invalid", "https://worker.invalid/jobs", "https://worker.invalid?key=secret"])
  ("rejects unsafe configured origin %s without a request", async origin => {
    vi.stubEnv("IMPORT_WORKER_URL", origin); vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(); await expect(wakeImportWorker(fetcher)).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

it("bounds a cold-start notification and tolerates failure without failing the queued save", async () => {
  vi.stubEnv("IMPORT_WORKER_URL", "https://synthetic.onrender.com");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>((_, init) => new Promise((_, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new Error("Synthetic timeout")), { once: true });
  }));
  await expect(wakeImportWorker(fetcher, 5)).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(wakeImportWorker(async () => new Response("unavailable", { status: 503 }))).resolves.toBeUndefined();
});

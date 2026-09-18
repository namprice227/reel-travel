import { createServer } from "node:http";
import { workerHealthEndpoint } from "@reel/contracts";

/** Render Free requires an HTTP listener. Existing durable polling does all import work. */
export async function startHealthServer(port: number, signal: AbortSignal) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid worker PORT.");
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url !== workerHealthEndpoint.path || !["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.writeHead(signal.aborted ? 503 : 200);
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(workerHealthEndpoint.response.parse({ ok: true })));
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => { server.off("error", reject); resolve(); });
  });
  const close = () => { server.close(); server.closeAllConnections(); };
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  return server;
}

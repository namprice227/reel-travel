import { workerHealthEndpoint } from "@reel/contracts";
import { config } from "../config";
import { runJob } from "./queue";

/** Runs after the save response; durable jobs never depend on a successful wake request. */
export function dispatchImport(jobId: string, afterResponse: (task: () => Promise<unknown>) => void) {
  if (config.inlineImportsEnabled) afterResponse(() => runJob(jobId));
  else if (config.dataBackend === "supabase" && process.env.IMPORT_WORKER_URL?.trim()) {
    afterResponse(() => wakeImportWorker());
  }
}

export async function wakeImportWorker(fetcher: typeof fetch = fetch, timeoutMs = 10_000): Promise<void> {
  try {
    const url = new URL(process.env.IMPORT_WORKER_URL ?? "");
    // Operator configuration only: never accept a URL, job id or credentials from source content.
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Invalid worker origin");
    }
    url.pathname = workerHealthEndpoint.path;
    const response = await fetcher(url, { method: workerHealthEndpoint.method, redirect: "error",
      signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Worker unavailable");
  } catch {
    // A cold start may outlive this bounded notification. The queue remains authoritative.
    console.warn("[worker] wake not acknowledged; import remains durably queued");
  }
}

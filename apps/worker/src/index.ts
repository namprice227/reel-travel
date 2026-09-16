import { fileURLToPath } from "node:url";
import { config } from "../../web/src/server/config";
import { repos } from "../../web/src/server/db";
import { abandonedBefore, IMPORT_ATTEMPT_TIMEOUT_MS } from "../../web/src/server/jobs/policy";
import { pollWorker, runIsolated } from "./supervisor";

// Executes jobs directly; never calls the web app's HTTP job endpoint.
if (config.dataBackend !== "supabase") throw new Error("The dedicated worker requires DATA_BACKEND=supabase; file mode supports only inline fake imports.");
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60_000) throw new Error("WORKER_INTERVAL_MS must be between 1000 and 60000.");
const repository = repos();
const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());
const childFile = fileURLToPath(new URL("./run-job.ts", import.meta.url));
console.info("[worker] started; one isolated attempt at a time, 15-minute deadline, 20-minute abandoned recovery");
await pollWorker(async () => {
  try {
    const [job] = await repository.jobs.listDue({ now: new Date().toISOString(), staleBefore: abandonedBefore(), limit: 1 });
    if (!job || shutdown.signal.aborted) return false;
    const outcome = await runIsolated(["--import", "tsx", childFile, job.id], {
      timeoutMs: IMPORT_ATTEMPT_TIMEOUT_MS, signal: shutdown.signal,
    });
    console.info(`[worker] attempt process ${outcome}`);
    return outcome === "completed";
  } catch {
    console.error("[worker] unable to poll or execute; retrying after poll interval");
    return false;
  }
}, shutdown.signal, intervalMs);

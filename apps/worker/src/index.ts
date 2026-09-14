import { endpoints, type EndpointResponse } from "@reel/contracts";

/**
 * Thin job trigger (owner: Member 4). The web app owns job state and logic; this process only asks it
 * to run due jobs (retries, abandoned runs) on an interval, through the same contract as everything else.
 * A hosted cron hitting POST /api/internal/jobs/run-due can replace this process in deployment.
 */

const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
const secret = process.env.WORKER_SECRET;
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);

if (!secret) {
  console.error("[worker] WORKER_SECRET is not set. Copy apps/web/.env.example to apps/web/.env.local.");
  process.exit(1);
}

async function tick(): Promise<void> {
  const def = endpoints["jobs.runDue"];
  try {
    const response = await fetch(`${webUrl}${def.path}`, {
      method: def.method,
      headers: { "x-worker-secret": secret! },
    });
    if (!response.ok) {
      console.error(`[worker] ${response.status} ${await response.text()}`);
      return;
    }
    const result = (await response.json()) as EndpointResponse<"jobs.runDue">;
    if (result.processed > 0) {
      console.info(`[worker] processed ${result.processed} (succeeded ${result.succeeded}, failed ${result.failed})`);
    }
  } catch (error) {
    console.error(`[worker] could not reach ${webUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.info(`[worker] asking ${webUrl} to run due jobs every ${intervalMs} ms`);
await tick();
setInterval(() => void tick(), intervalMs);

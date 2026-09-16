import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

/** Wait for actual termination before another attempt starts. No shell or detached child. */
export function runIsolated(args: string[], options: { timeoutMs: number; signal: AbortSignal }): Promise<"completed" | "failed" | "timed_out" | "stopped"> {
  if (options.signal.aborted) return Promise.resolve("stopped");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit", "ipc"], windowsHide: true });
    let outcome: "timed_out" | "stopped" | undefined;
    let failed = false;
    const stop = () => { outcome = "stopped"; child.kill("SIGKILL"); };
    const timer = setTimeout(() => { outcome = "timed_out"; child.kill("SIGKILL"); }, options.timeoutMs);
    options.signal.addEventListener("abort", stop, { once: true });
    child.once("error", () => { failed = true; });
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", stop);
      resolve(outcome ?? (!failed && code === 0 ? "completed" : "failed"));
    });
  });
}

/** One awaited poll/attempt at a time, even when work takes longer than the poll interval. */
export async function pollWorker(runNext: () => Promise<boolean>, signal: AbortSignal, intervalMs: number): Promise<void> {
  while (!signal.aborted) {
    const hadWork = await runNext();
    if (!hadWork && !signal.aborted) {
      try { await delay(intervalMs, undefined, { signal }); }
      catch (error) { if (!signal.aborted) throw error; }
    }
  }
}

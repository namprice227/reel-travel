import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, expect, it } from "vitest";

const execute = promisify(execFile);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-worker-entry-"));
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

it("executes the real worker child outside Next.js with an offline Supabase claim", async () => {
  const preload = path.join(directory, "offline-provider.mjs");
  fs.writeFileSync(preload, `globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname !== '/rest/v1/rpc/reel_claim_job') throw new Error('Unexpected network request');
    const body = await request.json();
    if (body.p_id !== 'job_synthetic') throw new Error('Unexpected job');
    return Response.json({id:'job_synthetic',tripId:'trip_synthetic',targetId:'insp_synthetic',kind:'import_inspiration',
      status:'failed',attempt:3,maxAttempts:3,lastError:'Synthetic exhaustion',runAfter:'2026-09-17T00:00:00.000Z',
      createdAt:'2026-09-17T00:00:00.000Z',updatedAt:'2026-09-17T01:00:00.000Z'});
  };`);
  const result = await execute(process.execPath, ["--import", "tsx", "--import", pathToFileURL(preload).href, "src/run-job.ts", "job_synthetic"], {
    cwd: path.resolve("apps/worker"), timeout: 20_000, windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", DATA_BACKEND: "supabase", SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SECRET_KEY: "synthetic-test-key" },
  });
  expect(result.stdout).toContain("[worker] job failed");
  expect(result.stderr).toBe("");
}, 25_000);

it("refuses to run a multiprocess worker against the development file store", async () => {
  await expect(execute(process.execPath, ["--import", "tsx", "apps/worker/src/index.ts"], {
    timeout: 20_000, windowsHide: true, env: { ...process.env, NODE_ENV: "development", DATA_BACKEND: "file" },
  })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("requires DATA_BACKEND=supabase") });
}, 25_000);

it("dispatches account-reel IDs to the account claim RPC in the real worker child", async () => {
  const preload = path.join(directory, "offline-account-provider.mjs");
  fs.writeFileSync(preload, `globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname !== '/rest/v1/rpc/reel_claim_account_reel') throw new Error('Unexpected network request');
    const body = await request.json();
    if (body.p_id !== 'reeljob_synthetic') throw new Error('Unexpected job');
    return Response.json(null);
  };`);
  const result = await execute(process.execPath, ["--import", "tsx", "--import", pathToFileURL(preload).href, "src/run-job.ts", "reeljob_synthetic"], {
    cwd: path.resolve("apps/worker"), timeout: 20_000, windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", DATA_BACKEND: "supabase", SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SECRET_KEY: "synthetic-test-key" },
  });
  expect(result.stdout).toContain("[worker] job not_run");
  expect(result.stderr).toBe("");
}, 25_000);

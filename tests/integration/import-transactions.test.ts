import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { MAX_SCREENSHOT_BYTES, type Inspiration } from "@reel/contracts";
import { createFileRepositories } from "../../apps/web/src/server/db/file-store";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-atomic-"));
vi.stubEnv("DATA_BACKEND", "file"); vi.stubEnv("REEL_DATA_DIR", directory);
const { repos, assetStorage } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const trips = await import("../../apps/web/src/server/services/trips");
const imports = await import("../../apps/web/src/server/services/inspirations");
const { newImportJob } = await import("../../apps/web/src/server/jobs/queue");
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(() => {
  if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith("reel-atomic-")) throw Error("Unsafe test cleanup");
  fs.rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs();
});
async function fixture() {
  const user = (await devSignIn({ email: `synthetic-${crypto.randomUUID()}@example.test` })).user;
  const trip = await trips.createTrip(user, { title: "Synthetic", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-03" });
  return { user, trip };
}
const save = (f: Awaited<ReturnType<typeof fixture>>) => imports.createInspiration(f.user, f.trip.id, { sourceType: "text", text: "Synthetic source" });

it("rolls back both source and quota when a duplicate job insert fails, including after reload", async () => {
  const f = await fixture(); const first = await save(f);
  const next: Inspiration = { ...first.inspiration, id: "insp_syntheticrollback" };
  await expect(repos().imports.create(next, { ...newImportJob(next), id: first.job.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
  expect(await repos().inspirations.get(next.id)).toBeNull();
  expect(await createFileRepositories(directory).inspirations.get(next.id)).toBeNull();
});

it("concurrent retries share one job; concurrent details cannot silently overwrite input", async () => {
  const f = await fixture(); const first = await save(f);
  await repos().jobs.update({ ...first.job, status: "failed" });
  await repos().inspirations.update({ ...first.inspiration, status: "failed" });
  const results = await Promise.all([imports.retryInspiration(f.user,f.trip.id,first.inspiration.id), imports.retryInspiration(f.user,f.trip.id,first.inspiration.id)]);
  expect(results[0].job.id).toBe(results[1].job.id);
  await expect(imports.addInspirationDetails(f.user,f.trip.id,first.inspiration.id,{text:"Additional detail"})).rejects.toMatchObject({code:"INVALID_STATE"});
});

it("rejects a concurrent trip edit instead of losing a saved title; preserves current plan pointer", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    trips.updateTrip(f.user,f.trip.id,{title:"Changed"}),
    trips.updateTrip(f.user,f.trip.id,{preferences:{budget:"high"}}),
  ]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.code).toBe("STALE_TRIP");
  await expect(trips.updateTrip(f.user,f.trip.id,{title:"Stale",expectedUpdatedAt:"2020-01-01T00:00:00.000Z"})).rejects.toMatchObject({code:"STALE_TRIP"});
});

it("bounds active imports across a user's trips and leaves denied saves unwritten", async () => {
  const f = await fixture();
  for(let n=0;n<5;n++) await save(f);
  await expect(save(f)).rejects.toMatchObject({code:"RATE_LIMITED",details:{retryAfterSeconds:30}});
  expect(await repos().inspirations.listByTrip(f.trip.id)).toHaveLength(5);
});

it("counts new jobs against the daily budget and resets after a full window", async () => {
  const f = await fixture(); vi.useFakeTimers({toFake:["Date"]});
  for(let n=0;n<30;n++) { vi.setSystemTime(Date.now()+61000); const result=await save(f); await repos().jobs.update({...result.job,status:"succeeded"}); }
  vi.setSystemTime(Date.now()+61000);
  await expect(save(f)).rejects.toMatchObject({code:"RATE_LIMITED"});
  vi.setSystemTime(Date.now()+86400001); await expect(save(f)).resolves.toHaveProperty("job");
});

it("cleans up an uncommitted screenshot but retains one when an RPC response is lost after commit", async () => {
  const f=await fixture(); const storage=assetStorage(); const remove=vi.spyOn(storage,"remove");
  const create=repos().imports.create;
  vi.spyOn(repos().imports,"create").mockRejectedValueOnce(new Error("Synthetic failure"));
  const file=()=>new File([new Uint8Array([1,2,3])],"synthetic.png",{type:"image/png"});
  await expect(imports.createScreenshotInspiration(f.user,f.trip.id,{file:file()})).rejects.toThrow("Synthetic failure");
  expect(remove).toHaveBeenCalledTimes(1);
  vi.spyOn(repos().imports,"create").mockImplementationOnce(async (...args)=>{await create(...args);throw new Error("Lost response");});
  await expect(imports.createScreenshotInspiration(f.user,f.trip.id,{file:file()})).rejects.toThrow("Lost response");
  expect(remove).toHaveBeenCalledTimes(1);
  const [saved]=await repos().inspirations.listByTrip(f.trip.id);
  expect(await storage.get(saved.assetId!)).not.toBeNull();
});

it("rejects oversize uploads before sending bytes to storage", async()=>{
  const f=await fixture(); const put=vi.spyOn(assetStorage(),"put");
  await expect(imports.createScreenshotInspiration(f.user,f.trip.id,{file:new File([new Uint8Array(MAX_SCREENSHOT_BYTES+1)],"synthetic.png",{type:"image/png"})})).rejects.toMatchObject({code:"PAYLOAD_TOO_LARGE"});
  expect(put).not.toHaveBeenCalled();
});

it("bounds repeated requests even when retries reuse existing queued work",async()=>{
  const f=await fixture(); const first=await save(f);
  for(let n=0;n<9;n++) expect((await imports.retryInspiration(f.user,f.trip.id,first.inspiration.id)).job.id).toBe(first.job.id);
  await expect(imports.retryInspiration(f.user,f.trip.id,first.inspiration.id)).rejects.toMatchObject({code:"RATE_LIMITED"});
  expect(await repos().inspirations.listByTrip(f.trip.id)).toHaveLength(1);
});

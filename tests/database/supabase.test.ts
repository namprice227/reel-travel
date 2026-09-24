import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { itineraryFixtures, tripFixture, userFixture, shareFixtures } from "@reel/contracts/fixtures";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/reel_test")) {
  throw new Error("Set TEST_DATABASE_URL to a NEW disposable database named reel_test*. Never point this suite at a hosted project.");
}
const pool = new Pool({ connectionString: url, max: 12 });
beforeAll(async () => {
  await pool.query(fs.readFileSync("tests/database/setup.sql", "utf8"));
  for (const name of fs.readdirSync("database/migrations").filter(name => name.endsWith(".sql")).sort()) {
    await pool.query(fs.readFileSync(`database/migrations/${name}`, "utf8"));
  }
});
afterAll(async () => { await pool.end(); });

async function asRole(role: "service_role" | "anon" | "authenticated", sql: string, args: unknown[] = []) {
  const client = await pool.connect();
  try { await client.query(`set role ${role}`); return await client.query(sql, args); }
  finally { await client.query("reset role"); client.release(); }
}
async function fixture() {
  const id = randomUUID();
  const user = { ...userFixture, id, email: `${id}@example.test` };
  const trip = { ...tripFixture, id: `trip_${randomUUID()}`, ownerId: id, currentItineraryVersion: null };
  await pool.query("insert into auth.users values($1)", [id]);
  await asRole("service_role", "insert into reel_users(id,auth_user_id,data) values($1::text,$1::uuid,$2)", [id, user]);
  await asRole("service_role", "insert into reel_trips(id,data) values($1,$2)", [trip.id, trip]);
  return { user, trip };
}

describe("Supabase migration on PostgreSQL", () => {
  async function importInput() {
    const f = await fixture(); const id = randomUUID(); const stamp = new Date().toISOString();
    const inspiration = { id, tripId: f.trip.id, sourceType: "text", text: "Synthetic source", url:null,assetId:null,note:null,details:null,status:"queued",failureCode:null,failureMessage:null,attempts:0,placeIds:[],createdAt:stamp,updatedAt:stamp };
    const job = { id:randomUUID(),tripId:f.trip.id,targetId:id,kind:"import_inspiration",status:"queued",attempt:0,maxAttempts:3,runAfter:stamp,createdAt:stamp,updatedAt:stamp,lastError:null };
    return {...f,inspiration,job};
  }
  const submit = (inspiration: unknown, job: unknown, recover=false, details: string|null=null, asset: unknown=null) =>
    asRole("service_role","select reel_submit_import($1,$2,$3,$4,$5) as result",[inspiration,job,asset,recover,details]);

  it("atomically skips queued work, releases capacity and preserves its consumed daily allowance", async () => {
    const f = await importInput();
    for (let n = 0; n < 5; n++) {
      const id = randomUUID(); const job = { ...f.job, id: randomUUID(), targetId: id };
      await submit({ ...f.inspiration, id }, job);
      await asRole("service_role", "select reel_skip_import($1,$2)", [id, f.job.updatedAt]);
      expect((await pool.query("select status from reel_jobs where id=$1", [job.id])).rows[0].status).toBe("cancelled");
      expect((await asRole("service_role", "select reel_claim_job($1,$2,$2) as job", [job.id, "2099-01-01T00:00:00.000Z"])).rows[0].job).toBeNull();
    }
    expect((await pool.query("select count from reel_rate_limits where key=$1", [`import-day:${f.user.id}`])).rows[0].count).toBe(5);
    await expect(submit(f.inspiration, f.job)).resolves.toBeDefined();
  });

  it("serializes skip against claim/start and never revives a skipped source or cancelled job", async () => {
    const f = await importInput(); await submit(f.inspiration, f.job);
    const now = "2099-01-01T00:00:00.000Z";
    const [skipped] = await Promise.allSettled([
      asRole("service_role", "select reel_skip_import($1,$2)", [f.inspiration.id, now]),
      (async () => {
        await asRole("service_role", "select reel_claim_job($1,$2,$2)", [f.job.id, now]);
        return asRole("service_role", "select reel_transition_import($1,$2,$3,$4,1)", [f.inspiration.id, { status: "processing" }, now, f.job.id]);
      })(),
    ]);
    if (skipped.status === "rejected") {
      expect(skipped.reason.message).toBe("IMPORT_NOT_SKIPPABLE");
      // Allow the running attempt to fail/requeue before the next explicit skip.
      await asRole("service_role", "select reel_settle_import_job($1,$2)", [{ ...f.job, status: "queued", attempt: 1 }, { status: "queued" }]);
      await asRole("service_role", "select reel_skip_import($1,$2)", [f.inspiration.id, now]);
    }
    for (const status of ["processing", "queued", "failed", "ready"]) {
      const result = await asRole("service_role", "select reel_transition_import($1,$2,$3,$4,1) as source", [f.inspiration.id, { status }, now, f.job.id]);
      expect(result.rows[0].source).toBeNull();
    }
    expect((await asRole("service_role", "select reel_settle_import_job($1,$2) as saved", [{ ...f.job, status: "failed", attempt: 1 }, { status: "failed" }])).rows[0].saved).toBe(false);
    expect((await pool.query("select data->>'status' as status from reel_inspirations where id=$1", [f.inspiration.id])).rows[0].status).toBe("skipped");
    expect((await pool.query("select status from reel_jobs where id=$1", [f.job.id])).rows[0].status).toBe("cancelled");
  });

  it("rejects superseded worker writes and rolls back both sides of a failed settlement", async () => {
    const f = await importInput(); await submit(f.inspiration, f.job);
    await asRole("service_role", "select reel_claim_job($1,$2,$2)", [f.job.id, "2099-01-01T00:00:00.000Z"]);
    await asRole("service_role", "select reel_claim_job($1,$2,$2)", [f.job.id, "2099-01-02T00:00:00.000Z"]);
    const stamp = "2099-01-02T00:00:00.000Z";
    expect((await asRole("service_role", "select reel_transition_import($1,$2,$3,$4,1) as source", [f.inspiration.id, { status: "processing" }, stamp, f.job.id])).rows[0].source).toBeNull();
    expect((await asRole("service_role", "select reel_settle_import_job($1,null) as saved", [{ ...f.job, status: "succeeded", attempt: 1 }])).rows[0].saved).toBe(false);
    await asRole("service_role", "select reel_transition_import($1,$2,$3,$4,2)", [f.inspiration.id, { status: "processing" }, stamp, f.job.id]);
    await pool.query(`create function public.synthetic_fail_settle() returns trigger language plpgsql as $$ begin
      if new.data->>'failureMessage' = 'SYNTHETIC_ROLLBACK' then raise exception 'Synthetic write failure'; end if;
      return new; end $$;
      create trigger synthetic_fail_settle before update on public.reel_inspirations for each row execute function public.synthetic_fail_settle();`);
    try {
      await expect(asRole("service_role", "select reel_settle_import_job($1,$2)", [{ ...f.job, status: "failed", attempt: 2 }, { status: "failed", failureMessage: "SYNTHETIC_ROLLBACK" }])).rejects.toThrow("Synthetic write failure");
      expect((await pool.query("select status from reel_jobs where id=$1", [f.job.id])).rows[0].status).toBe("running");
      expect((await pool.query("select data->>'status' as status from reel_inspirations where id=$1", [f.inspiration.id])).rows[0].status).toBe("processing");
    } finally {
      await pool.query("drop trigger synthetic_fail_settle on public.reel_inspirations; drop function public.synthetic_fail_settle();");
    }
    expect((await asRole("service_role", "select reel_settle_import_job($1,$2) as saved", [{ ...f.job, status: "failed", attempt: 2 }, { status: "failed" }])).rows[0].saved).toBe(true);
  });

  it("denies browser access to all new state transition functions", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const sql of ["select reel_skip_import('missing','now')", "select reel_transition_import('missing','{}','now',null,null)", "select reel_settle_import_job('{}',null)"]) {
        await expect(asRole(role, sql)).rejects.toMatchObject({ code: "42501" });
      }
    }
  });

  it("rolls back Skip if cancelling its job fails", async () => {
    const f = await importInput(); await submit(f.inspiration, f.job);
    await pool.query(`create function public.synthetic_fail_cancel() returns trigger language plpgsql as $$ begin
      if new.data->>'status' = 'cancelled' then raise exception 'Synthetic cancellation failure'; end if;
      return new; end $$;
      create trigger synthetic_fail_cancel before update on public.reel_jobs for each row execute function public.synthetic_fail_cancel();`);
    try {
      await expect(asRole("service_role", "select reel_skip_import($1,$2)", [f.inspiration.id, f.job.updatedAt])).rejects.toThrow("Synthetic cancellation failure");
      expect((await pool.query("select data->>'status' as status from reel_inspirations where id=$1", [f.inspiration.id])).rows[0].status).toBe("queued");
      expect((await pool.query("select status from reel_jobs where id=$1", [f.job.id])).rows[0].status).toBe("queued");
    } finally {
      await pool.query("drop trigger synthetic_fail_cancel on public.reel_jobs; drop function public.synthetic_fail_cancel();");
    }
  });

  it("atomically rolls back source, asset metadata and quota after the job insert fails",async()=>{
    const f=await importInput();
    await submit(f.inspiration,f.job);
    const inspiration={...f.inspiration,id:randomUUID()};
    const asset={id:randomUUID(),tripId:f.trip.id,ownerId:f.user.id,size:10,contentType:"image/png"};
    await expect(submit({...inspiration,assetId:asset.id},{...f.job,targetId:inspiration.id},false,null,asset)).rejects.toMatchObject({code:"23505"});
    expect((await pool.query("select id from reel_inspirations where id=$1",[inspiration.id])).rows).toHaveLength(0);
    expect((await pool.query("select id from reel_assets where id=$1",[asset.id])).rows).toHaveLength(0);
    expect((await pool.query("select count from reel_rate_limits where key=$1",[`import-day:${f.user.id}`])).rows[0].count).toBe(1);
  });

  it("concurrent recovery returns one job and charges one daily slot; details cannot overwrite active work",async()=>{
    const f=await importInput(); await submit(f.inspiration,f.job);
    await pool.query("update reel_jobs set data=data || '{\"status\":\"failed\"}' where id=$1",[f.job.id]);
    await pool.query("update reel_inspirations set data=data || '{\"status\":\"failed\"}' where id=$1",[f.inspiration.id]);
    const results=await Promise.all(Array.from({length:8},()=>submit(f.inspiration,{...f.job,id:randomUUID()},true)));
    expect(new Set(results.map(r=>r.rows[0].result.job.id)).size).toBe(1);
    expect((await pool.query("select count from reel_rate_limits where key=$1",[`import-day:${f.user.id}`])).rows[0].count).toBe(2);
    await expect(submit(f.inspiration,{...f.job,id:randomUUID()},true,"New detail")).rejects.toMatchObject({message:"IMPORT_BUSY"});
    const duplicateId=randomUUID();
    await expect(asRole("service_role","insert into reel_jobs(id,data) values($1,$2)",[duplicateId,{...f.job,id:duplicateId,targetId:f.inspiration.id}])).rejects.toMatchObject({code:"23505"});
  });

  it("serializes active and daily quotas across concurrent submissions",async()=>{
    const f=await importInput();
    const results=await Promise.allSettled(Array.from({length:8},()=>{const id=randomUUID();return submit({...f.inspiration,id},{...f.job,id:randomUUID(),targetId:id});}));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(5);
    for(const r of results)if(r.status==="rejected")expect(r.reason.message).toBe("IMPORT_ACTIVE_LIMIT");
    await pool.query("update reel_jobs set data=data || '{\"status\":\"succeeded\"}' where trip_id=$1",[f.trip.id]);
    await pool.query("update reel_rate_limits set count=30 where key=$1",[`import-day:${f.user.id}`]);
    await expect(submit(f.inspiration,f.job)).rejects.toMatchObject({message:"IMPORT_DAILY_LIMIT"});
    expect((await pool.query("select id from reel_inspirations where id=$1",[f.inspiration.id])).rows).toHaveLength(0);
    await pool.query("update reel_rate_limits set expires_at=now()-interval '1 second' where key=$1",[`import-day:${f.user.id}`]);
    await expect(submit(f.inspiration,f.job)).resolves.toBeDefined();
  });

  it("rejects stale trip snapshots without overwriting a competing change",async()=>{
    const f=await fixture();
    const results=await Promise.allSettled([
      asRole("service_role","select reel_update_trip_checked($1,$2)",[{...f.trip,title:"New title"},f.trip]),
      asRole("service_role","select reel_update_trip_checked($1,$2)",[{...f.trip,preferences:{...f.trip.preferences,budget:"high"}},f.trip]),
    ]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.message).toBe("STALE_TRIP");
  });

  it("atomically attaches and replaces private trip-cover metadata", async () => {
    const f = await fixture();
    const stamp = new Date().toISOString();
    const first = { id: `asset_${randomUUID()}`, ownerId: f.user.id, tripId: f.trip.id,
      contentType: "image/webp", size: 3, createdAt: stamp };
    const firstTrip = { ...f.trip, coverAssetId: first.id, updatedAt: stamp };
    const saved = (await asRole("service_role", "select reel_set_trip_cover($1,$2,$3) as trip", [firstTrip, first, f.trip])).rows[0].trip;
    expect(saved.coverAssetId).toBe(first.id);
    expect((await pool.query("select count(*)::int as count from reel_assets where id=$1", [first.id])).rows[0].count).toBe(1);

    const second = { ...first, id: `asset_${randomUUID()}`, size: 2 };
    const secondTrip = { ...saved, coverAssetId: second.id, updatedAt: new Date(Date.now() + 1).toISOString() };
    const replaced = (await asRole("service_role", "select reel_set_trip_cover($1,$2,$3) as trip", [secondTrip, second, saved])).rows[0].trip;
    expect(replaced.coverAssetId).toBe(second.id);
    expect((await pool.query("select id from reel_assets where id in ($1,$2) order by id", [first.id, second.id])).rows.map(row => row.id)).toEqual([second.id]);
    await expect(asRole("service_role", "select reel_set_trip_cover($1,$2,$3)", [firstTrip, first, f.trip]))
      .rejects.toMatchObject({ message: "STALE_TRIP" });
  });

  it("blocks browser roles from new mutation RPCs and bounds stored upload bytes",async()=>{
    const f=await importInput();
    for(const role of ["anon","authenticated"] as const){
      await expect(asRole(role,"select reel_submit_import($1,$2,null,false,null)",[f.inspiration,f.job])).rejects.toMatchObject({code:"42501"});
      await expect(asRole(role,"select reel_update_trip_checked($1,$1)",[f.trip])).rejects.toMatchObject({code:"42501"});
      await expect(asRole(role,"select reel_set_trip_cover($1,$2,$1)",[f.trip,{id:"asset_denied"}])).rejects.toMatchObject({code:"42501"});
    }
    await pool.query("insert into reel_assets(id,data) values($1,$2)",["synthetic_full",{id:"synthetic_full",tripId:f.trip.id,ownerId:f.user.id,size:104857600}]);
    const asset={id:randomUUID(),tripId:f.trip.id,ownerId:f.user.id,size:1};
    await expect(submit({...f.inspiration,assetId:asset.id},f.job,false,null,asset)).rejects.toMatchObject({message:"IMPORT_STORAGE_FULL"});
    expect((await pool.query("select file_size_limit from storage.buckets where id='reel-private-uploads'")).rows[0].file_size_limit).toBe("4194304");
  });

  it("blocks anonymous/authenticated direct table and RPC access", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(role, "select * from reel_trips")).rejects.toMatchObject({ code: "42501" });
      for (const table of ["reel_account_reels", "reel_account_places", "reel_account_reel_jobs"]) {
        await expect(asRole(role, `select * from ${table}`)).rejects.toMatchObject({ code: "42501" });
      }
      await expect(asRole(role, "select reel_consume_rate_limit('probe', 1000, 1)")).rejects.toMatchObject({ code: "42501" });
    }
    const tables = await pool.query("select relrowsecurity from pg_class where relname like 'reel_%' and relkind = 'r'");
    expect(tables.rows.length).toBe(14);
    expect(tables.rows.every((row) => row.relrowsecurity)).toBe(true);
    expect((await pool.query("select has_table_privilege('service_role', 'reel_itineraries', 'TRUNCATE') as allowed")).rows[0].allowed).toBe(false);
    expect((await pool.query("select public from storage.buckets where id = 'reel-private-uploads'")).rows[0].public).toBe(false);
  });

  it("persists data across connections and isolates owner queries", async () => {
    const a = await fixture();
    const b = await fixture();
    const rows = await asRole("service_role", "select data from reel_trips where owner_id = $1", [a.user.id]);
    expect(rows.rows.map((r) => r.data.id)).toEqual([a.trip.id]);
    expect(rows.rows.some((r) => r.data.id === b.trip.id)).toBe(false);
    const session = { id: "synthetic-session-hash", userId: a.user.id, createdAt: "2026-09-16T00:00:00.000Z", expiresAt: "2026-10-16T00:00:00.000Z" };
    await asRole("service_role", "insert into reel_sessions(id,data) values($1,$2)", [session.id, session]);
    await pool.query("delete from auth.users where id=$1", [a.user.id]);
    expect((await pool.query("select id from reel_sessions where id=$1", [session.id])).rows).toEqual([]);
    expect((await pool.query("select id from reel_trips where id=$1", [a.trip.id])).rows).toEqual([]);
  });

  it("commits only one competing itinerary version and never rolls back the current pointer", async () => {
    const { trip } = await fixture();
    const plan = { ...itineraryFixtures.valid, id: randomUUID(), tripId: trip.id, version: 1 };
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => asRole("service_role",
      "select reel_save_itinerary($1, null)", [{ ...plan, id: randomUUID() }])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ message: "STALE_VERSION" });
    expect(JSON.parse(failure.reason.detail)).toEqual({ currentVersion: 1 });
    const updated = await asRole("service_role", "select reel_update_trip($1) as trip", [{ ...trip, title: "Changed", currentItineraryVersion: null }]);
    expect(updated.rows[0].trip).toMatchObject({ title: "Changed", currentItineraryVersion: 1 });
    await expect(asRole("service_role", "select reel_save_itinerary($1, 1)", [{ ...plan, version: 3 }]))
      .rejects.toMatchObject({ message: "STALE_VERSION" });
    expect((await pool.query("select version from reel_itineraries where trip_id = $1", [trip.id])).rows).toEqual([{ version: 1 }]);
    await expect(asRole("service_role", "update reel_itineraries set data=data where trip_id=$1", [trip.id])).rejects.toMatchObject({ code: "42501" });
  });

  it("rolls back a failed insert without advancing the trip version", async () => {
    const { trip } = await fixture();
    const plan = { ...itineraryFixtures.valid, id: "duplicate-itinerary-id", tripId: trip.id, version: 1 };
    await asRole("service_role", "select reel_save_itinerary($1,null)", [plan]);
    await expect(asRole("service_role", "select reel_save_itinerary($1,1)", [{ ...plan, version: 2 }])).rejects.toMatchObject({ code: "23505" });
    expect((await pool.query("select data from reel_trips where id=$1", [trip.id])).rows[0].data.currentItineraryVersion).toBe(1);
    expect((await pool.query("select count(*) from reel_itineraries where trip_id=$1", [trip.id])).rows[0].count).toBe("1");
  });

  it("revocation remains set after competing or late viewer touches", async () => {
    const { trip } = await fixture();
    const share = { ...shareFixtures.active, id: randomUUID(), tripId: trip.id, tokenHash: randomUUID() };
    await asRole("service_role", "insert into reel_shares(id,data) values($1,$2)", [share.id, share]);
    await Promise.all([
      asRole("service_role", "select reel_view_share($1,$2)", [share.id, "2026-09-16T01:00:00.000Z"]),
      asRole("service_role", "select reel_revoke_share($1,$2)", [share.id, "2026-09-16T01:00:01.000Z"]),
    ]);
    const result = await asRole("service_role", "select reel_view_share($1,$2) as share", [share.id, "2026-09-16T01:00:02.000Z"]);
    expect(result.rows[0].share.revokedAt).toBe("2026-09-16T01:00:01.000Z");
  });

  it("enforces one shared rate-limit window across concurrent connections and resets after expiry", async () => {
    const key = randomUUID();
    const requests = await Promise.all(Array.from({ length: 20 }, () => asRole("service_role",
      "select reel_consume_rate_limit($1,60000,10) as result", [key])));
    expect(requests.filter((r) => r.rows[0].result.allowed)).toHaveLength(10);
    const reset = (await pool.query("select expires_at from reel_rate_limits where key=$1", [key])).rows[0].expires_at;
    await asRole("service_role", "select reel_consume_rate_limit($1,60000,10)", [key]);
    expect((await pool.query("select expires_at from reel_rate_limits where key=$1", [key])).rows[0].expires_at).toEqual(reset);
    await pool.query("update reel_rate_limits set expires_at=now()-interval '1 second' where key=$1", [key]);
    expect((await asRole("service_role", "select reel_consume_rate_limit($1,60000,10) as result", [key])).rows[0].result.allowed).toBe(true);
  });

  it("atomically claims a job once, skips future work and reclaims abandoned runs", async () => {
    const { trip } = await fixture();
    const id = randomUUID();
    const job = { id, tripId: trip.id, targetId: "synthetic-save", kind: "import_inspiration", status: "queued", attempt: 0,
      maxAttempts: 3, runAfter: "2026-09-16T01:00:00.000Z", updatedAt: "2026-09-16T01:00:00.000Z" };
    await asRole("service_role", "insert into reel_jobs(id,data) values($1,$2)", [id, job]);
    const claim = (now: string, stale: string) => asRole("service_role", "select reel_claim_job($1,$2,$3) as job", [id, now, stale]);
    expect((await claim("2026-09-16T00:00:00.000Z", "2026-09-15T00:00:00.000Z")).rows[0].job).toBeNull();
    const claims = await Promise.all(Array.from({ length: 8 }, () => claim("2026-09-16T01:00:00.000Z", "2026-09-16T00:55:00.000Z")));
    expect(claims.filter((r) => r.rows[0].job)).toHaveLength(1);
    expect(claims.find((r) => r.rows[0].job)!.rows[0].job.attempt).toBe(1);
    expect((await claim("2026-09-16T01:06:00.000Z", "2026-09-16T01:01:00.000Z")).rows[0].job.attempt).toBe(2);
  });

  it.each(["queued", "running"])("atomically fails exhausted %s jobs once without losing source or partial results", async (status) => {
    const { trip } = await fixture();
    const id = randomUUID(), targetId = randomUUID();
    const inspiration = { id: targetId, tripId: trip.id, status: "processing", attempts: 2,
      text: "Synthetic source retained", assetId: "asset_synthetic", placeIds: ["place_partial"] };
    const job = { id, targetId, tripId: trip.id, status, attempt: 3, maxAttempts: 3,
      runAfter: "2026-09-16T01:00:00.000Z", updatedAt: "2026-09-16T01:00:00.000Z" };
    await asRole("service_role", "insert into reel_inspirations(id,data) values($1,$2)", [targetId, inspiration]);
    await asRole("service_role", "insert into reel_jobs(id,data) values($1,$2)", [id, job]);
    const claims = await Promise.all(Array.from({ length: 8 }, () => asRole("service_role",
      "select reel_claim_job($1,'2026-09-16T02:00:00.000Z','2026-09-16T01:40:00.000Z') as job", [id])));
    expect(claims.filter(r => r.rows[0].job)).toHaveLength(1);
    expect(claims.find(r => r.rows[0].job)!.rows[0].job).toMatchObject({ status: "failed", attempt: 3 });
    expect((await pool.query("select data from reel_inspirations where id=$1", [targetId])).rows[0].data)
      .toMatchObject({ ...inspiration, status: "failed", attempts: 3, failureCode: "EXTRACTION_ERROR" });
  });

  it("rolls back exhaustion when its inspiration update fails", async () => {
    const { trip } = await fixture();
    const id = randomUUID(), targetId = randomUUID();
    await pool.query("insert into reel_inspirations(id,data) values($1,$2)", [targetId,
      { id: targetId, tripId: trip.id, status: "processing", attempts: "invalid-test-value" }]);
    await pool.query("insert into reel_jobs(id,data) values($1,$2)", [id,
      { id, tripId: trip.id, targetId, status: "running", attempt: 3, maxAttempts: 3,
        runAfter: "2026-09-16T01:00:00.000Z", updatedAt: "2026-09-16T01:00:00.000Z" }]);
    await expect(asRole("service_role", "select reel_claim_job($1,'2026-09-16T02:00:00.000Z','2026-09-16T01:40:00.000Z')", [id]))
      .rejects.toMatchObject({ code: "22P02" });
    expect((await pool.query("select status from reel_jobs where id=$1", [id])).rows[0].status).toBe("running");
  });

  it("rejects upload metadata whose owner does not own the trip", async () => {
    const a = await fixture();
    const b = await fixture();
    const asset = { id: randomUUID(), tripId: a.trip.id, ownerId: b.user.id };
    await expect(asRole("service_role", "insert into reel_assets(id,data) values($1,$2)", [asset.id, asset]))
      .rejects.toMatchObject({ code: "23503" });
  });
});

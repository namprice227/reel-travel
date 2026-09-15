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
  await pool.query(fs.readFileSync("database/migrations/202609160001_supabase.sql", "utf8"));
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
  it("blocks anonymous/authenticated direct table and RPC access", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(role, "select * from reel_trips")).rejects.toMatchObject({ code: "42501" });
      await expect(asRole(role, "select reel_consume_rate_limit('probe', 1000, 1)")).rejects.toMatchObject({ code: "42501" });
    }
    const tables = await pool.query("select relrowsecurity from pg_class where relname like 'reel_%' and relkind = 'r'");
    expect(tables.rows.length).toBe(11);
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

  it("rejects upload metadata whose owner does not own the trip", async () => {
    const a = await fixture();
    const b = await fixture();
    const asset = { id: randomUUID(), tripId: a.trip.id, ownerId: b.user.id };
    await expect(asRole("service_role", "insert into reel_assets(id,data) values($1,$2)", [asset.id, asset]))
      .rejects.toMatchObject({ code: "23503" });
  });
});

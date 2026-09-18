import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CandidatePlace, Inspiration, Itinerary, Job, Reservation, Share, Trip, User,
} from "@reel/contracts";
import { z } from "zod";
import { AppError } from "../errors";
import type { PrivateAssetStorage, Repositories } from "./types";

type DbError = { code?: string; message: string; details?: string };
function checkedError(error: DbError | null): void {
  if (!error) return;
  if (error.message === "STALE_VERSION") {
    let currentVersion: number | null = null;
    try { currentVersion = JSON.parse(error.details ?? "{}").currentVersion ?? null; } catch { /* no private DB details */ }
    throw new AppError("STALE_VERSION", "The itinerary changed. Reload and try again.", { currentVersion });
  }
  if (error.message === "STALE_TRIP") throw new AppError("STALE_TRIP", "Trip details changed. Reload and review the latest values before saving again.");
  if (error.message === "IMPORT_BUSY") throw new AppError("INVALID_STATE", "This save is already queued or processing. Wait before adding details.");
  if (error.message === "IMPORT_NOT_RECOVERABLE") throw new AppError("INVALID_STATE", "Only failed saves or saves needing input can be retried.");
  if (error.message === "IMPORT_STORAGE_FULL") throw new AppError("INVALID_STATE", "Private upload storage is full (100 MiB). Contact support or use text.");
  if (["IMPORT_ACTIVE_LIMIT", "IMPORT_DAILY_LIMIT"].includes(error.message)) {
    let retryAfterSeconds = 30;
    try { const parsed = JSON.parse(error.details ?? "{}"); if (Number.isFinite(parsed.retryAfterSeconds)) retryAfterSeconds = Math.max(1, Math.ceil(parsed.retryAfterSeconds)); } catch { /* no database content */ }
    throw new AppError("RATE_LIMITED", error.message === "IMPORT_ACTIVE_LIMIT" ? "You already have 5 active imports. Wait for one to finish." : "Daily import limit reached (30).", { retryAfterSeconds });
  }
  if (error.code === "P0002") throw new AppError("NOT_FOUND", "The requested record was not found.");
  // Provider errors may contain document contents or token hashes. Do not return/log them.
  throw new AppError("INTERNAL", "The data service is unavailable. Try again.");
}

const Session = z.object({ id: z.string(), userId: z.string(), createdAt: z.string(), expiresAt: z.string() });
const ShareRow = Share.extend({ tokenHash: z.string() });
const Asset = z.object({ id: z.string(), ownerId: z.string(), tripId: z.string(), contentType: z.string(), size: z.number(), createdAt: z.string() });

/** Supabase's server-only service key accesses tables whose browser roles have no grants/policies. */
export function createSupabaseRepositories(client: SupabaseClient): Repositories {
  function table<T extends { id: string }>(name: string, schema: z.ZodType<T>) {
    const from = () => client.from(`reel_${name}`);
    return {
      async get(value: string, column = "id"): Promise<T | null> {
        const { data, error } = await from().select("data").eq(column, value).maybeSingle();
        checkedError(error);
        return data ? schema.parse(data.data) : null;
      },
      async list(value: string, column = "trip_id"): Promise<T[]> {
        // Supabase limits individual responses; paginate so large libraries are never silently truncated.
        const result: T[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await from().select("data").eq(column, value).order("id").range(offset, offset + 499);
          checkedError(error);
          result.push(...(data ?? []).map((row) => schema.parse(row.data)));
          if (!data || data.length < 500) return result;
        }
      },
      async insert(value: T): Promise<void> {
        checkedError((await from().insert({ id: value.id, data: schema.parse(value) })).error);
      },
      async update(value: T): Promise<void> {
        const { data, error } = await from().update({ data: schema.parse(value) }).eq("id", value.id).select("id").maybeSingle();
        checkedError(error);
        if (!data) throw new AppError("NOT_FOUND", "The requested record was not found.");
      },
      async delete(id: string): Promise<void> { checkedError((await from().delete().eq("id", id)).error); },
    };
  }
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    checkedError(error);
    return data;
  }
  const users = table("users", User);
  const sessions = table("sessions", Session);
  const trips = table("trips", Trip);
  const reservations = table("reservations", Reservation);
  const inspirations = table("inspirations", Inspiration);
  const places = table("places", CandidatePlace);
  const shares = table("shares", ShareRow);
  const jobs = table("jobs", Job);
  const assets = table("assets", Asset);
  return {
    users: { getById: (id) => users.get(id), getByEmail: (email) => users.get(email.toLowerCase(), "email"),
      async insert(user) {
        checkedError((await client.from("reel_users").upsert({ id: user.id, auth_user_id: user.id, data: User.parse(user) }, { onConflict: "id" })).error);
      },
    },
    sessions: { get: (id) => sessions.get(id), insert: sessions.insert, delete: sessions.delete },
    trips: { get: (id) => trips.get(id), listByOwner: (id) => trips.list(id, "owner_id"), insert: trips.insert,
      update: async (trip, expected) => Trip.parse(await rpc(expected ? "reel_update_trip_checked" : "reel_update_trip", expected ? { p_data: trip, p_expected: expected } : { p_data: trip })) },
    reservations: { get: (id) => reservations.get(id), listByTrip: (id) => reservations.list(id),
      insert: reservations.insert, update: reservations.update, delete: reservations.delete },
    inspirations: { get: (id) => inspirations.get(id), listByTrip: (id) => inspirations.list(id),
      insert: inspirations.insert, update: inspirations.update },
    imports: {
      create: async (inspiration, job, asset) => z.object({ inspiration: Inspiration, job: Job }).parse(await rpc("reel_submit_import", {
        p_inspiration: inspiration, p_job: job, p_asset: asset ?? null, p_recover: false, p_details: null,
      })),
      recover: async (id, job, details) => z.object({ inspiration: Inspiration, job: Job }).parse(await rpc("reel_submit_import", {
        p_inspiration: { id, tripId: job.tripId }, p_job: job, p_asset: null, p_recover: true, p_details: details ?? null,
      })),
    },
    places: { get: (id) => places.get(id), listByTrip: (id) => places.list(id),
      insert: places.insert, update: places.update, delete: places.delete },
    itineraries: {
      async getVersion(tripId, version) {
        const { data, error } = await client.from("reel_itineraries").select("data").eq("trip_id", tripId).eq("version", version).maybeSingle();
        checkedError(error);
        return data ? Itinerary.parse(data.data) : null;
      },
      async saveVersion(itinerary, expectedVersion) {
        await rpc("reel_save_itinerary", { p_data: itinerary, p_expected_version: expectedVersion });
      },
    },
    shares: { get: (id) => shares.get(id), listByTrip: (id) => shares.list(id),
      getByTokenHash: (hash) => shares.get(hash, "token_hash"), insert: shares.insert,
      revoke: async (id, at) => ShareRow.nullable().parse(await rpc("reel_revoke_share", { p_id: id, p_revoked_at: at })),
      markViewed: async (id, at) => ShareRow.nullable().parse(await rpc("reel_view_share", { p_id: id, p_viewed_at: at })),
    },
    rateLimits: { consume: async (key, { windowMs, limit }) =>
      z.object({ allowed: z.boolean(), retryAfterSeconds: z.number().int().min(0) }).parse(
        await rpc("reel_consume_rate_limit", { p_key: key, p_window_ms: windowMs, p_limit: limit })) },
    jobs: {
      get: (id) => jobs.get(id), insert: jobs.insert, update: jobs.update,
      async latestForTarget(targetId) {
        const { data, error } = await client.from("reel_jobs").select("data").eq("target_id", targetId)
          .order("data->>createdAt", { ascending: false }).order("id").limit(1).maybeSingle();
        checkedError(error);
        return data ? Job.parse(data.data) : null;
      },
      async listDue({ now, staleBefore, limit }) {
        const { data, error } = await client.from("reel_jobs").select("data")
          .or(`and(status.eq.queued,run_after.lte.${now}),and(status.eq.running,updated_at.lt.${staleBefore})`)
          .order("run_after").limit(limit);
        checkedError(error);
        return (data ?? []).map((row) => Job.parse(row.data));
      },
      claim: async (id, { now, staleBefore }) => Job.nullable().parse(await rpc("reel_claim_job", {
        p_id: id, p_now: now, p_stale_before: staleBefore,
      })),
    },
    assets: { get: (id) => assets.get(id), insert: assets.insert },
  };
}

export const PRIVATE_UPLOAD_BUCKET = "reel-private-uploads";
export function createSupabaseAssetStorage(client: SupabaseClient): PrivateAssetStorage {
  const objectKey = (id: string) => {
    if (!/^asset_[a-z0-9]+$/.test(id)) throw new AppError("NOT_FOUND", "Upload not found.");
    return id;
  };
  return {
    async remove(id) {
      const { error } = await client.storage.from(PRIVATE_UPLOAD_BUCKET).remove([objectKey(id)]);
      if (error) throw new AppError("INTERNAL", "The uncommitted upload could not be removed.");
    },
    async put(id, bytes, contentType) {
      const { error } = await client.storage.from(PRIVATE_UPLOAD_BUCKET).upload(objectKey(id), bytes, {
        contentType, upsert: false, cacheControl: "0",
      });
      if (error) throw new AppError("INTERNAL", "The private upload could not be saved. Try again.");
    },
    async get(id) {
      const { data, error } = await client.storage.from(PRIVATE_UPLOAD_BUCKET).download(objectKey(id));
      if (error) {
        if ("statusCode" in error && String(error.statusCode) === "404") return null;
        throw new AppError("INTERNAL", "The private upload could not be loaded. Try again.");
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

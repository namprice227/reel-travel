import fs from "node:fs";
import path from "node:path";
import type { AccountPlace, AccountReel, AccountReelJob, CandidatePlace, Inspiration, Itinerary, Job, Reservation, Trip, User } from "@reel/contracts";
import { readStoredPlace, storedPlaceSnapshot } from "./stored-place";
import { AppError } from "../errors";
import { exhaustedImportMessage } from "../jobs/policy";
import { IMPORT_ACTIVE_LIMIT, IMPORT_DAILY_LIMIT, PRIVATE_STORAGE_LIMIT_BYTES } from "../jobs/import-limits";
import { isDeepStrictEqual } from "node:util";
import type { AssetRecord, PrivateAssetStorage, RateLimitRecord, Repositories, SessionRecord, ShareRecord } from "./types";

/**
 * DEVELOPMENT ONLY. One JSON file, one process, no real transactions.
 * Good enough to build every feature against; replace with a database before the pilot (BE10/BE11).
 */
interface DbFile {
  users: User[];
  sessions: SessionRecord[];
  trips: Trip[];
  reservations: Reservation[];
  inspirations: Inspiration[];
  accountReels: AccountReel[];
  accountPlaces: AccountPlace[];
  accountReelJobs: AccountReelJob[];
  places: CandidatePlace[];
  itineraries: Itinerary[];
  shares: ShareRecord[];
  jobs: Job[];
  assets: AssetRecord[];
  rateLimits: RateLimitRecord[];
}

const emptyDb = (): DbFile => ({
  users: [],
  sessions: [],
  trips: [],
  reservations: [],
  inspirations: [],
  accountReels: [],
  accountPlaces: [],
  accountReelJobs: [],
  places: [],
  itineraries: [],
  shares: [],
  jobs: [],
  assets: [],
  rateLimits: [],
});

const clone = <T>(value: T): T => structuredClone(value);

/** A trip and everything scoped to it. Account reels keep their own rows. */
function dropTrip(data: DbFile, id: string): void {
  data.trips = data.trips.filter((trip) => trip.id !== id);
  data.reservations = data.reservations.filter((item) => item.tripId !== id);
  data.inspirations = data.inspirations.filter((item) => item.tripId !== id);
  data.places = data.places.filter((item) => item.tripId !== id);
  data.itineraries = data.itineraries.filter((item) => item.tripId !== id);
  data.shares = data.shares.filter((item) => item.tripId !== id);
  data.jobs = data.jobs.filter((item) => item.tripId !== id);
  data.assets = data.assets.filter((item) => item.tripId !== id);
}

class JsonFile {
  private data: DbFile = emptyDb();
  private loadedMtime = -1;

  constructor(private readonly file: string) {}

  /** Reloads if another process (e.g. `npm run seed`) rewrote the file. */
  read(): DbFile {
    const mtime = this.mtime();
    if (mtime !== this.loadedMtime) {
      this.data = mtime === -1 ? emptyDb() : { ...emptyDb(), ...(JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<DbFile>) };
      this.loadedMtime = mtime;
    }
    return this.data;
  }

  write(mutate: (data: DbFile) => void): void {
    const data = clone(this.read());
    mutate(data);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const json = JSON.stringify(data, null, 2);
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, json);
    try {
      fs.renameSync(tmp, this.file);
    } catch {
      fs.writeFileSync(this.file, json);
      fs.rmSync(tmp, { force: true });
    }
    this.loadedMtime = this.mtime();
    this.data = data;
  }

  private mtime(): number {
    try {
      return fs.statSync(this.file).mtimeMs;
    } catch {
      return -1;
    }
  }
}

type Key = keyof DbFile;
type Row<K extends Key> = DbFile[K][number];

function table<K extends Key>(db: JsonFile, key: K) {
  const rows = () => db.read()[key] as Array<Row<K>>;
  return {
    find: (predicate: (row: Row<K>) => boolean): Row<K> | null => {
      const row = rows().find(predicate);
      return row ? clone(row) : null;
    },
    filter: (predicate: (row: Row<K>) => boolean): Array<Row<K>> => clone(rows().filter(predicate)),
    insert: (row: Row<K>) =>
      db.write((data) => {
        (data[key] as Array<Row<K>>).push(clone(row));
      }),
    update: (row: Row<K> & { id: string }) =>
      db.write((data) => {
        const list = data[key] as Array<Row<K> & { id: string }>;
        const index = list.findIndex((r) => r.id === row.id);
        if (index === -1) throw new Error(`${key}: no row with id ${row.id}`);
        list[index] = clone(row);
      }),
    remove: (id: string) =>
      db.write((data) => {
        (data[key] as Array<{ id: string }>) = (data[key] as Array<{ id: string }>).filter((r) => r.id !== id);
      }),
    mutate: (fn: (list: Array<Row<K>>) => void) => db.write((data) => fn(data[key] as Array<Row<K>>)),
  };
}

export function createFileRepositories(dataDir: string): Repositories {
  const db = new JsonFile(path.join(dataDir, "db.json"));
  const users = table(db, "users");
  const sessions = table(db, "sessions");
  const trips = table(db, "trips");
  const reservations = table(db, "reservations");
  const inspirations = table(db, "inspirations");
  const accountReels = table(db, "accountReels");
  const accountPlaces = table(db, "accountPlaces");
  const accountReelJobs = table(db, "accountReelJobs");
  const places = table(db, "places");
  const itineraries = table(db, "itineraries");
  const shares = table(db, "shares");
  const jobs = table(db, "jobs");
  const assets = table(db, "assets");

  return {
    users: {
      getById: async (id) => users.find((u) => u.id === id),
      getByEmail: async (email) => users.find((u) => u.email === email),
      insert: async (user) => users.insert(user),
    },
    sessions: {
      get: async (id) => sessions.find((s) => s.id === id),
      insert: async (session) => sessions.insert(session),
      delete: async (id) => sessions.remove(id),
    },
    trips: {
      listByOwner: async (ownerId) => trips.filter((t) => t.ownerId === ownerId),
      get: async (id) => trips.find((t) => t.id === id),
      insert: async (trip) => trips.insert(trip),
      delete: async (id) => db.write((data) => {
        if (!data.trips.some((trip) => trip.id === id)) throw new AppError("NOT_FOUND", "Trip not found.");
        dropTrip(data, id);
      }),
      update: async (trip, expected) => {
        let result!: Trip;
        trips.mutate((list) => {
          const index = list.findIndex((item) => item.id === trip.id);
          if (index === -1) throw new AppError("NOT_FOUND", "Trip not found.");
          const comparable = ({ currentItineraryVersion: _v, updatedAt: _at, ...fields }: Trip) => fields;
          if (expected && !isDeepStrictEqual(comparable(list[index]!), comparable(expected))) {
            throw new AppError("STALE_TRIP", "Trip details changed. Reload and review the latest values before saving again.");
          }
          result = { ...clone(trip), currentItineraryVersion: list[index]!.currentItineraryVersion };
          list[index] = result;
        });
        return clone(result);
      },
      setCover: async (trip, asset, expected) => {
        let result!: Trip;
        db.write((data) => {
          const index = data.trips.findIndex((item) => item.id === trip.id);
          if (index === -1) throw new AppError("NOT_FOUND", "Trip not found.");
          const current = data.trips[index]!;
          const comparable = ({ currentItineraryVersion: _v, updatedAt: _at, ...fields }: Trip) => fields;
          if (!isDeepStrictEqual(comparable(current), comparable(expected))) {
            throw new AppError("STALE_TRIP", "Trip details changed. Reload and review the latest values before saving again.");
          }
          if (asset.ownerId !== current.ownerId || asset.tripId !== current.id || trip.coverAssetId !== asset.id
            || data.assets.some((item) => item.id === asset.id)) {
            throw new AppError("INVALID_STATE", "Invalid trip cover metadata.");
          }
          const previousId = current.coverAssetId;
          const previous = previousId ? data.assets.find((item) => item.id === previousId) : undefined;
          const used = data.assets.filter((item) => item.ownerId === current.ownerId)
            .reduce((sum, item) => sum + item.size, 0) - (previous?.size ?? 0);
          if (used + asset.size > PRIVATE_STORAGE_LIMIT_BYTES) {
            throw new AppError("INVALID_STATE", "Private upload storage is full (100 MiB). Remove an upload or use a smaller cover.");
          }
          result = { ...clone(trip), ownerId: current.ownerId, currentItineraryVersion: current.currentItineraryVersion };
          data.trips[index] = result;
          if (previousId) data.assets = data.assets.filter((item) => item.id !== previousId);
          data.assets.push(clone(asset));
        });
        return clone(result);
      },
    },
    reservations: {
      listByTrip: async (tripId) => reservations.filter((r) => r.tripId === tripId),
      get: async (id) => reservations.find((r) => r.id === id),
      insert: async (reservation) => reservations.insert(reservation),
      update: async (reservation) => reservations.update(reservation),
      delete: async (id) => reservations.remove(id),
    },
    inspirations: {
      listByTrip: async (tripId) => inspirations.filter((i) => i.tripId === tripId),
      get: async (id) => inspirations.find((i) => i.id === id),
      insert: async (inspiration) => inspirations.insert(inspiration),
      update: async (inspiration) => inspirations.update(inspiration),
    },
    accountReels: {
      listByOwner: async (ownerId) => accountReels.filter((reel) => reel.ownerId === ownerId),
      listPlacesByOwner: async (ownerId) => accountPlaces.filter((place) => place.ownerId === ownerId),
      updatePlaces: async (reelId, ownerId, places) => db.write((data) => {
        const reel = data.accountReels.find((item) => item.id === reelId && item.ownerId === ownerId);
        if (!reel) throw new AppError("NOT_FOUND", "Reel not found.");
        const existing = new Set(data.accountPlaces
          .filter((place) => place.reelId === reelId && place.ownerId === ownerId)
          .map((place) => place.id));
        if (places.some((place) => place.reelId !== reelId || place.ownerId !== ownerId || !existing.has(place.id))) {
          throw new AppError("VALIDATION_FAILED", "Mapped places must already belong to this reel.");
        }
        const replacements = new Map(places.map((place) => [place.id, clone(place)]));
        data.accountPlaces = data.accountPlaces.map((place) => replacements.get(place.id) ?? place);
      }),
      get: async (id) => accountReels.find((reel) => reel.id === id),
      deleteByOwner: async (id, ownerId) => db.write((data) => {
        if (!data.accountReels.some((reel) => reel.id === id && reel.ownerId === ownerId)) {
          throw new AppError("NOT_FOUND", "Reel not found.");
        }
        data.accountReels = data.accountReels.filter((reel) => reel.id !== id);
        data.accountPlaces = data.accountPlaces.filter((place) => place.reelId !== id);
        data.accountReelJobs = data.accountReelJobs.filter((job) => job.targetId !== id);
      }),
      getJob: async (id) => accountReelJobs.find((job) => job.id === id),
      submit: async (reel, job) => {
        db.write((data) => {
          if (!data.users.some((user) => user.id === reel.ownerId) || job.ownerId !== reel.ownerId || job.targetId !== reel.id) {
            throw new AppError("NOT_FOUND", "Account not found.");
          }
          const ownedTrips = new Set(data.trips.filter((trip) => trip.ownerId === reel.ownerId).map((trip) => trip.id));
          const active = data.jobs.filter((item) => ownedTrips.has(item.tripId) && ["queued", "running"].includes(item.status)).length
            + data.accountReelJobs.filter((item) => item.ownerId === reel.ownerId && ["queued", "running"].includes(item.status)).length;
          if (active >= IMPORT_ACTIVE_LIMIT) throw new AppError("RATE_LIMITED", "You already have 5 active imports. Wait for one to finish.", { retryAfterSeconds: 30 });
          const now = Date.now();
          let quota = data.rateLimits.find((item) => item.key === `import-day:${reel.ownerId}` && item.resetAt > now);
          if (quota && quota.count >= IMPORT_DAILY_LIMIT) throw new AppError("RATE_LIMITED", "Daily import limit reached (30).", { retryAfterSeconds: Math.ceil((quota.resetAt - now) / 1000) });
          if (!quota) {
            quota = { key: `import-day:${reel.ownerId}`, count: 0, resetAt: now + 86_400_000 };
            data.rateLimits.push(quota);
          }
          quota.count += 1;
          data.accountReels.push(clone(reel));
          data.accountReelJobs.push(clone(job));
        });
        return { reel, job };
      },
      recover: async (reelId, ownerId, text, job) => {
        let result!: { reel: AccountReel; job: AccountReelJob };
        db.write((data) => {
          const reel = data.accountReels.find((item) => item.id === reelId && item.ownerId === ownerId);
          if (!reel || job.ownerId !== ownerId || job.targetId !== reelId) throw new AppError("NOT_FOUND", "Reel not found.");
          const active = data.accountReelJobs.find((item) => item.targetId === reelId && ["queued", "running"].includes(item.status));
          if (active) throw new AppError("INVALID_STATE", "This reel is already processing.");
          if (!["needs_input", "failed"].includes(reel.status)) throw new AppError("INVALID_STATE", "This reel does not need details.");
          const details = [reel.details, text].filter(Boolean).join("\n");
          if (details.length > 10_000) throw new AppError("VALIDATION_FAILED", "Details are too long.");
          const ownedTrips = new Set(data.trips.filter((trip) => trip.ownerId === ownerId).map((trip) => trip.id));
          const activeCount = data.jobs.filter((item) => ownedTrips.has(item.tripId) && ["queued", "running"].includes(item.status)).length
            + data.accountReelJobs.filter((item) => item.ownerId === ownerId && ["queued", "running"].includes(item.status)).length;
          if (activeCount >= IMPORT_ACTIVE_LIMIT) throw new AppError("RATE_LIMITED", "You already have 5 active imports. Wait for one to finish.", { retryAfterSeconds: 30 });
          const now = Date.now();
          let quota = data.rateLimits.find((item) => item.key === `import-day:${ownerId}` && item.resetAt > now);
          if (quota && quota.count >= IMPORT_DAILY_LIMIT) throw new AppError("RATE_LIMITED", "Daily import limit reached (30).", { retryAfterSeconds: Math.ceil((quota.resetAt - now) / 1000) });
          if (!quota) {
            quota = { key: `import-day:${ownerId}`, count: 0, resetAt: now + 86_400_000 };
            data.rateLimits.push(quota);
          }
          quota.count += 1;
          Object.assign(reel, { details, status: "queued", failureCode: null, failureMessage: null, updatedAt: job.createdAt });
          data.accountReelJobs.push(clone(job));
          result = { reel: clone(reel), job: clone(job) };
        });
        return result;
      },
      listDue: async ({ now, staleBefore, limit }) => accountReelJobs.filter((job) =>
        (job.status === "queued" && job.runAfter <= now) || (job.status === "running" && job.updatedAt < staleBefore),
      ).sort((a, b) => a.runAfter.localeCompare(b.runAfter)).slice(0, limit),
      claim: async (id, { now, staleBefore }) => {
        let claimed: AccountReelJob | null = null;
        db.write((data) => {
          const job = data.accountReelJobs.find((item) => item.id === id);
          if (!job || !((job.status === "queued" && job.runAfter <= now) || (job.status === "running" && job.updatedAt < staleBefore))) return;
          const reel = data.accountReels.find((item) => item.id === job.targetId);
          if (job.attempt >= job.maxAttempts) {
            job.status = "failed";
            job.lastError = exhaustedImportMessage;
            if (reel && ["queued", "processing"].includes(reel.status)) {
              Object.assign(reel, { status: "failed", failureCode: "EXTRACTION_ERROR", failureMessage: exhaustedImportMessage, updatedAt: now });
            }
          } else {
            job.status = "running";
            job.attempt += 1;
            if (reel) Object.assign(reel, { status: "processing", attempts: job.attempt, updatedAt: now });
          }
          job.updatedAt = now;
          claimed = clone(job);
        });
        return claimed;
      },
      settle: async (job, update) => {
        let saved = false;
        db.write((data) => {
          const current = data.accountReelJobs.find((item) => item.id === job.id);
          const reel = data.accountReels.find((item) => item.id === job.targetId);
          if (!current || !reel || current.status !== "running" || current.attempt !== job.attempt) return;
          Object.assign(current, { status: job.status, lastError: job.lastError, runAfter: job.runAfter, updatedAt: job.updatedAt });
          Object.assign(reel, { status: update.status, failureCode: update.failureCode, failureMessage: update.failureMessage, updatedAt: job.updatedAt });
          if (update.places) {
            data.accountPlaces = data.accountPlaces.filter((place) => place.reelId !== reel.id);
            data.accountPlaces.push(...clone(update.places));
            reel.placeIds = update.places.map((place) => place.id);
          }
          saved = true;
        });
        return saved;
      },
      attachDraftTrip: async (job, trip) => {
        let result: Trip | null = null;
        db.write((data) => {
          const current = data.accountReelJobs.find((item) => item.id === job.id);
          const reel = data.accountReels.find((item) => item.id === job.targetId);
          if (!current || !reel || current.status !== "running" || current.attempt !== job.attempt) return;
          if (trip.ownerId !== reel.ownerId || trip.status !== "draft" || trip.draft?.sourceReelId !== reel.id) {
            throw new AppError("VALIDATION_FAILED", "Draft trip does not belong to this reel.");
          }
          const linked = reel.tripId ? data.trips.find((item) => item.id === reel.tripId) : undefined;
          if (linked) { result = clone(linked); return; }
          data.trips.push(clone(trip));
          Object.assign(reel, { tripId: trip.id, format: "itinerary", updatedAt: trip.createdAt });
          result = clone(trip);
        });
        return result;
      },
      recordFormat: async (job, format) => {
        let saved = false;
        db.write((data) => {
          const current = data.accountReelJobs.find((item) => item.id === job.id);
          const reel = data.accountReels.find((item) => item.id === job.targetId);
          if (!current || !reel || current.status !== "running" || current.attempt !== job.attempt) return;
          reel.format = format;
          saved = true;
        });
        return saved;
      },
      convertDraftToIdeas: async (reelId, ownerId, places, now) => {
        let result!: AccountReel;
        db.write((data) => {
          const reel = data.accountReels.find((item) => item.id === reelId && item.ownerId === ownerId);
          if (!reel) throw new AppError("NOT_FOUND", "Reel not found.");
          const trip = reel.tripId ? data.trips.find((item) => item.id === reel.tripId && item.ownerId === ownerId) : undefined;
          if (!trip || trip.status !== "draft") throw new AppError("INVALID_STATE", "Only a draft trip that has not been planned can become place ideas.");
          if (places.some((place) => place.ownerId !== ownerId || place.reelId !== reelId)) throw new AppError("VALIDATION_FAILED", "Place ideas must belong to this reel.");
          dropTrip(data, trip.id);
          data.accountPlaces = data.accountPlaces.filter((place) => place.reelId !== reelId);
          data.accountPlaces.push(...clone(places));
          Object.assign(reel, { tripId: null, format: "places", placeIds: places.map((place) => place.id), updatedAt: now });
          result = clone(reel);
        });
        return result;
      },
      setReview: async (reelId, ownerId, review, discardPlaceIds, now) => {
        let result!: AccountReel;
        db.write((data) => {
          const reel = data.accountReels.find((item) => item.id === reelId && item.ownerId === ownerId);
          if (!reel) throw new AppError("NOT_FOUND", "Reel not found.");
          const discard = new Set(discardPlaceIds);
          if (discard.size && (reel.status !== "ready" || reel.tripId)) {
            throw new AppError("INVALID_STATE", "Only place ideas from a finished reel without a draft trip can be removed.");
          }
          const before = data.accountPlaces.length;
          data.accountPlaces = data.accountPlaces.filter((place) =>
            !(place.reelId === reelId && place.ownerId === ownerId && discard.has(place.id)));
          const removed = data.accountPlaces.length !== before;
          if (removed) reel.placeIds = reel.placeIds.filter((id) => !discard.has(id));
          if (removed || (reel.review ?? "done") !== review) Object.assign(reel, { review, updatedAt: now });
          result = clone(reel);
        });
        return result;
      },
    },
    imports: {
      create: async (inspiration, job, asset) => submitImport(inspiration, job, asset),
      recover: async (id, job, details) => submitImport(id, job, undefined, details),
      skip: async (id, now) => {
        let result!: Inspiration;
        db.write(data => {
          const source = data.inspirations.find(i => i.id === id);
          if (!source) throw new AppError("NOT_FOUND", "Save not found.");
          if (!["queued", "failed", "needs_input", "skipped"].includes(source.status)) {
            throw new AppError("INVALID_STATE", "This save has already started processing or finished. Reload its status before trying again.");
          }
          source.status = "skipped"; source.updatedAt = now;
          for (const job of data.jobs) if (job.targetId === id && ["queued", "running"].includes(job.status)) {
            job.status = "cancelled"; job.updatedAt = now; job.lastError = null;
          }
          result = clone(source);
        });
        return result;
      },
      transition: async (id, changes, now, lease) => {
        let result: Inspiration | null = null;
        db.write(data => {
          const source = data.inspirations.find(i => i.id === id);
          if (!source || source.status === "skipped") return;
          if (lease && !data.jobs.some(j => j.id === lease.jobId && j.targetId === id
            && j.status === "running" && j.attempt === lease.attempt)) return;
          Object.assign(source, clone(changes), { updatedAt: now });
          if (changes.status === "processing") source.attempts++;
          result = clone(source);
        });
        return result;
      },
    },
    places: {
      updateIfUnchanged: async (place, expected) => {
        let saved = false;
        db.write(data => {
          const index = data.places.findIndex(p => p.id === expected.id);
          if (index >= 0 && isDeepStrictEqual(data.places[index], storedPlaceSnapshot(expected))) {
            data.places[index] = clone(place); saved = true;
          }
        });
        return saved;
      },
      listByTrip: async (tripId) => places.filter((p) => p.tripId === tripId).map(readStoredPlace),
      get: async (id) => {
        const place = places.find((p) => p.id === id);
        return place ? readStoredPlace(place) : null;
      },
      insert: async (place) => places.insert(place),
      update: async (place) => places.update(place),
      delete: async (id) => places.remove(id),
    },
    itineraries: {
      getVersion: async (tripId, version) => itineraries.find((i) => i.tripId === tripId && i.version === version),
      saveVersion: async (itinerary, expectedVersion) =>
        db.write((data) => {
          const trip = data.trips.find((t) => t.id === itinerary.tripId);
          if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
          if (trip.currentItineraryVersion !== expectedVersion || itinerary.version !== (expectedVersion ?? 0) + 1
            || data.itineraries.some((i) => i.tripId === itinerary.tripId && i.version === itinerary.version)) {
            throw new AppError("STALE_VERSION", "Another change saved this itinerary version first. Reload and try again.", {
              currentVersion: trip.currentItineraryVersion,
            });
          }
          data.itineraries.push(clone(itinerary));
          trip.currentItineraryVersion = itinerary.version;
          trip.updatedAt = itinerary.createdAt;
        }),
    },
    shares: {
      listByTrip: async (tripId) => shares.filter((s) => s.tripId === tripId),
      get: async (id) => shares.find((s) => s.id === id),
      getByTokenHash: async (tokenHash) => shares.find((s) => s.tokenHash === tokenHash),
      insert: async (share) => shares.insert(share),
      revoke: async (id, revokedAt) => {
        let result: ShareRecord | null = null;
        shares.mutate((list) => {
          const record = list.find((s) => s.id === id);
          if (!record) return;
          record.revokedAt ??= revokedAt;
          result = clone(record);
        });
        return result;
      },
      markViewed: async (id, viewedAt) => {
        let result: ShareRecord | null = null;
        shares.mutate((list) => {
          const record = list.find((s) => s.id === id);
          if (!record) return;
          if (!record.revokedAt && (!record.lastViewedAt || viewedAt > record.lastViewedAt)) record.lastViewedAt = viewedAt;
          result = clone(record);
        });
        return result;
      },
    },
    rateLimits: {
      consume: async (key, { now, windowMs, limit }) => {
        let allowed = false;
        let retryAfterSeconds = 0;
        db.write((data) => {
          data.rateLimits = data.rateLimits.filter((entry) => entry.resetAt > now);
          let entry = data.rateLimits.find((item) => item.key === key);
          if (!entry) {
            entry = { key, count: 0, resetAt: now + windowMs };
            data.rateLimits.push(entry);
          }
          allowed = entry.count < limit;
          if (allowed) entry.count += 1;
          else retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        });
        return { allowed, retryAfterSeconds };
      },
    },
    jobs: {
      listByTrip: async (tripId) => jobs.filter(j => j.tripId === tripId),
      enqueueVerification: async (job) => {
        let result = job;
        db.write(data => {
          const active = data.jobs.find(j => j.targetId === job.targetId && ["queued", "running"].includes(j.status));
          if (active) result = clone(active);
          else data.jobs.push(clone(job));
        });
        return result;
      },
      get: async (id) => jobs.find((j) => j.id === id),
      latestForTarget: async (targetId) =>
        jobs.filter((j) => j.targetId === targetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
      insert: async (job) => jobs.insert(job),
      update: async (job) => jobs.update(job),
      settle: async (job, changes) => {
        let saved = false;
        db.write(data => {
          const current = data.jobs.find(j => j.id === job.id);
          if (!current || current.status !== "running" || current.attempt !== job.attempt) return;
          const source = data.inspirations.find(i => i.id === current.targetId);
          if (source?.status === "skipped") {
            current.status = "cancelled"; current.updatedAt = job.updatedAt; current.lastError = null;
            return;
          }
          Object.assign(current, { status: job.status, runAfter: job.runAfter, lastError: job.lastError, updatedAt: job.updatedAt });
          if (source && changes) Object.assign(source, clone(changes), { updatedAt: job.updatedAt });
          saved = true;
        });
        return saved;
      },
      listDue: async ({ now, staleBefore, limit }) =>
        jobs
          .filter((j) => (j.status === "queued" && j.runAfter <= now) || (j.status === "running" && j.updatedAt < staleBefore))
          .sort((a, b) => a.runAfter.localeCompare(b.runAfter))
          .slice(0, limit),
      claim: async (id, { now, staleBefore }) => {
        let claimed: Job | null = null;
        db.write((data) => {
          const job = data.jobs.find((j) => j.id === id);
          const due = job?.status === "queued" && job.runAfter <= now;
          const abandoned = job?.status === "running" && job.updatedAt < staleBefore;
          if (!job || !(due || abandoned)) return;
          if (job.attempt >= job.maxAttempts) {
            job.status = "failed";
            job.lastError = exhaustedImportMessage;
            const inspiration = data.inspirations.find((i) => i.id === job.targetId && i.tripId === job.tripId);
            if (inspiration && ["queued", "processing"].includes(inspiration.status)) {
              Object.assign(inspiration, { status: "failed", failureCode: "EXTRACTION_ERROR",
                failureMessage: exhaustedImportMessage, attempts: Math.max(inspiration.attempts, job.attempt), updatedAt: now });
            }
          } else {
            job.status = "running";
            job.attempt += 1;
          }
          job.updatedAt = now;
          claimed = clone(job);
        });
        return claimed;
      },
    },
    assets: {
      listByTrip: async (tripId) => assets.filter((a) => a.tripId === tripId),
      get: async (id) => assets.find((a) => a.id === id),
      insert: async (asset) => assets.insert(asset),
    },
  };

  function submitImport(source: Inspiration | string, job: Job, asset?: AssetRecord, details?: string) {
    let result!: { inspiration: Inspiration; job: Job };
    db.write(data => {
      const trip = data.trips.find(t => t.id === job.tripId);
      if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
      let inspiration = typeof source === "string" ? data.inspirations.find(i => i.id === source && i.tripId === trip.id) : clone(source);
      if (!inspiration) throw new AppError("NOT_FOUND", "Save not found.");
      if (job.targetId !== inspiration.id || inspiration.tripId !== trip.id) throw new AppError("INVALID_STATE", "Import target does not match.");
      if (typeof source === "string") {
        const active = data.jobs.find(j => j.targetId === source && ["queued", "running"].includes(j.status));
        if (active) {
          if (details !== undefined) throw new AppError("INVALID_STATE", "This save is already queued or processing. Wait before adding details.");
          result = clone({ inspiration, job: active }); return;
        }
        if (!["failed", "needs_input"].includes(inspiration.status)) throw new AppError("INVALID_STATE", "Only failed saves or saves needing input can be retried.");
        inspiration = { ...inspiration, details: details === undefined ? inspiration.details : [inspiration.details, details].filter(Boolean).join("\n"),
          status: "queued", failureCode: null, failureMessage: null, updatedAt: job.createdAt };
      }
      const owned = new Set(data.trips.filter(t => t.ownerId === trip.ownerId).map(t => t.id));
      if (data.jobs.filter(j => owned.has(j.tripId) && ["queued", "running"].includes(j.status)).length
        + data.accountReelJobs.filter(j => j.ownerId === trip.ownerId && ["queued", "running"].includes(j.status)).length >= IMPORT_ACTIVE_LIMIT) {
        throw new AppError("RATE_LIMITED", "You already have 5 active imports. Wait for one to finish.", { retryAfterSeconds: 30 });
      }
      const now = Date.now();
      let quota = data.rateLimits.find(q => q.key === `import-day:${trip.ownerId}` && q.resetAt > now);
      if (quota && quota.count >= IMPORT_DAILY_LIMIT) throw new AppError("RATE_LIMITED", "Daily import limit reached (30).", { retryAfterSeconds: Math.max(1, Math.ceil((quota.resetAt-now)/1000)) });
      if (asset && data.assets.filter(a => a.ownerId === trip.ownerId).reduce((sum,a) => sum+a.size,0)+asset.size > PRIVATE_STORAGE_LIMIT_BYTES) {
        throw new AppError("INVALID_STATE", "Private upload storage is full (100 MiB). Contact support or use text.");
      }
      if (data.jobs.some(j => j.id === job.id) || (typeof source !== "string" && data.inspirations.some(i => i.id === source.id))) throw new AppError("INVALID_STATE", "Import already exists.");
      if (asset && (asset.ownerId !== trip.ownerId || asset.tripId !== trip.id || inspiration.assetId !== asset.id || data.assets.some(a => a.id === asset.id))) throw new AppError("INVALID_STATE", "Invalid upload metadata.");
      if (!quota) { data.rateLimits = data.rateLimits.filter(q => q.key !== `import-day:${trip.ownerId}`); quota={key:`import-day:${trip.ownerId}`,count:0,resetAt:now+86400000}; data.rateLimits.push(quota); }
      quota.count++;
      if (typeof source === "string") data.inspirations[data.inspirations.findIndex(i => i.id === source)] = inspiration;
      else data.inspirations.push(inspiration);
      if (asset) data.assets.push(clone(asset));
      data.jobs.push(clone(job));
      result = clone({ inspiration, job });
    });
    return result;
  }
}

export function createFileAssetStorage(dataDir: string): PrivateAssetStorage {
  const dir = path.join(dataDir, "uploads");
  const fileFor = (id: string) => {
    if (!/^asset_[a-z0-9]+$/.test(id)) throw new Error("Invalid asset id");
    return path.join(dir, id);
  };
  return {
    async remove(id) { fs.rmSync(fileFor(id), { force: true }); },
    async put(id, bytes) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fileFor(id), bytes);
    },
    async get(id) {
      try {
        return new Uint8Array(fs.readFileSync(fileFor(id)));
      } catch {
        return null;
      }
    },
  };
}

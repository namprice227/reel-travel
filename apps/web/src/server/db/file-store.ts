import fs from "node:fs";
import path from "node:path";
import type { CandidatePlace, Inspiration, Itinerary, Job, Reservation, Trip, User } from "@reel/contracts";
import { AppError } from "../errors";
import type { AssetRecord, PrivateAssetStorage, Repositories, SessionRecord, ShareRecord } from "./types";

/**
 * DEVELOPMENT ONLY. One JSON file, one process, no real transactions.
 * Good enough to build every feature against; replace with a database before the pilot (D02/D03).
 */
interface DbFile {
  users: User[];
  sessions: SessionRecord[];
  trips: Trip[];
  reservations: Reservation[];
  inspirations: Inspiration[];
  places: CandidatePlace[];
  itineraries: Itinerary[];
  shares: ShareRecord[];
  jobs: Job[];
  assets: AssetRecord[];
}

const emptyDb = (): DbFile => ({
  users: [],
  sessions: [],
  trips: [],
  reservations: [],
  inspirations: [],
  places: [],
  itineraries: [],
  shares: [],
  jobs: [],
  assets: [],
});

const clone = <T>(value: T): T => structuredClone(value);

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
    const data = this.read();
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
      update: async (trip) => trips.update(trip),
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
    places: {
      listByTrip: async (tripId) => places.filter((p) => p.tripId === tripId),
      get: async (id) => places.find((p) => p.id === id),
      insert: async (place) => places.insert(place),
      update: async (place) => places.update(place),
      delete: async (id) => places.remove(id),
    },
    itineraries: {
      getVersion: async (tripId, version) => itineraries.find((i) => i.tripId === tripId && i.version === version),
      insert: async (itinerary) =>
        itineraries.mutate((list) => {
          if (list.some((i) => i.tripId === itinerary.tripId && i.version === itinerary.version)) {
            throw new AppError("STALE_VERSION", "Another change saved this itinerary version first. Reload and try again.");
          }
          list.push(clone(itinerary));
        }),
    },
    shares: {
      listByTrip: async (tripId) => shares.filter((s) => s.tripId === tripId),
      get: async (id) => shares.find((s) => s.id === id),
      getByTokenHash: async (tokenHash) => shares.find((s) => s.tokenHash === tokenHash),
      insert: async (share) => shares.insert(share),
      update: async (share) => shares.update(share),
    },
    jobs: {
      get: async (id) => jobs.find((j) => j.id === id),
      latestForTarget: async (targetId) =>
        jobs.filter((j) => j.targetId === targetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
      insert: async (job) => jobs.insert(job),
      update: async (job) => jobs.update(job),
      listDue: async ({ now, staleBefore, limit }) =>
        jobs
          .filter((j) => (j.status === "queued" && j.runAfter <= now) || (j.status === "running" && j.updatedAt < staleBefore))
          .sort((a, b) => a.runAfter.localeCompare(b.runAfter))
          .slice(0, limit),
      claim: async (id, { now, staleBefore }) => {
        let claimed: Job | null = null;
        jobs.mutate((list) => {
          const job = list.find((j) => j.id === id);
          const due = job?.status === "queued" && job.runAfter <= now;
          const abandoned = job?.status === "running" && job.updatedAt < staleBefore;
          if (!job || !(due || abandoned)) return;
          job.status = "running";
          job.attempt += 1;
          job.updatedAt = now;
          claimed = clone(job);
        });
        return claimed;
      },
    },
    assets: {
      get: async (id) => assets.find((a) => a.id === id),
      insert: async (asset) => assets.insert(asset),
    },
  };
}

export function createFileAssetStorage(dataDir: string): PrivateAssetStorage {
  const dir = path.join(dataDir, "uploads");
  const fileFor = (id: string) => {
    if (!/^asset_[a-z0-9]+$/.test(id)) throw new Error("Invalid asset id");
    return path.join(dir, id);
  };
  return {
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

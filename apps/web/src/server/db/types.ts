import type { CandidatePlace, Inspiration, Itinerary, Job, Reservation, Share, Trip, User } from "@reel/contracts";

export interface SessionRecord {
  /** hashToken(cookie value); the raw token is never stored. */
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ShareRecord extends Share {
  tokenHash: string;
}

export interface AssetRecord {
  id: string;
  ownerId: string;
  tripId: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface RateLimitRecord {
  key: string;
  count: number;
  resetAt: number;
}

/**
 * Persistence boundary (owner: Member 4). Services use only these methods, so replacing the
 * dev JSON file with a real database (BE10) means implementing this interface, not editing features.
 * Rows are returned as copies: mutate them, then call update().
 */
export interface Repositories {
  users: {
    getById(id: string): Promise<User | null>;
    getByEmail(email: string): Promise<User | null>;
    insert(user: User): Promise<void>;
  };
  sessions: {
    get(id: string): Promise<SessionRecord | null>;
    insert(session: SessionRecord): Promise<void>;
    delete(id: string): Promise<void>;
  };
  trips: {
    listByOwner(ownerId: string): Promise<Trip[]>;
    get(id: string): Promise<Trip | null>;
    insert(trip: Trip): Promise<void>;
    /** Update details/preferences while atomically preserving the current itinerary pointer. */
    update(trip: Trip, expected?: Trip): Promise<Trip>;
  };
  reservations: {
    listByTrip(tripId: string): Promise<Reservation[]>;
    get(id: string): Promise<Reservation | null>;
    insert(reservation: Reservation): Promise<void>;
    update(reservation: Reservation): Promise<void>;
    delete(id: string): Promise<void>;
  };
  inspirations: {
    listByTrip(tripId: string): Promise<Inspiration[]>;
    get(id: string): Promise<Inspiration | null>;
    insert(inspiration: Inspiration): Promise<void>;
    update(inspiration: Inspiration): Promise<void>;
  };
  imports: {
    /** Atomically persist source/optional asset metadata and its job, enforcing user quotas. */
    create(inspiration: Inspiration, job: Job, asset?: AssetRecord): Promise<{ inspiration: Inspiration; job: Job }>;
    /** Lock/check the current source; append details atomically. Retry reuses an already active job. */
    recover(inspirationId: string, job: Job, details?: string): Promise<{ inspiration: Inspiration; job: Job }>;
  };
  places: {
    listByTrip(tripId: string): Promise<CandidatePlace[]>;
    get(id: string): Promise<CandidatePlace | null>;
    insert(place: CandidatePlace): Promise<void>;
    update(place: CandidatePlace): Promise<void>;
    delete(id: string): Promise<void>;
  };
  itineraries: {
    getVersion(tripId: string, version: number): Promise<Itinerary | null>;
    /**
     * One transaction: compare the trip's current version, insert unique (tripId, version),
     * and advance its pointer, preserving other trip fields. No partial writes on failure.
     * Reject conflicts with STALE_VERSION and details.currentVersion.
     */
    saveVersion(itinerary: Itinerary, expectedVersion: number | null): Promise<void>;
  };
  shares: {
    listByTrip(tripId: string): Promise<ShareRecord[]>;
    get(id: string): Promise<ShareRecord | null>;
    getByTokenHash(tokenHash: string): Promise<ShareRecord | null>;
    insert(share: ShareRecord): Promise<void>;
    /** Atomically set revokedAt once, preserving lastViewedAt. */
    revoke(id: string, revokedAt: string): Promise<ShareRecord | null>;
    /** Atomically touch only lastViewedAt if active. Return current row, including revocation. */
    markViewed(id: string, viewedAt: string): Promise<ShareRecord | null>;
  };
  rateLimits: {
    /** Atomic fixed-window increment. Denials do not extend the window; expired keys are cleaned up. */
    consume(key: string, options: { now: number; windowMs: number; limit: number }): Promise<{
      allowed: boolean;
      retryAfterSeconds: number;
    }>;
  };
  jobs: {
    get(id: string): Promise<Job | null>;
    latestForTarget(targetId: string): Promise<Job | null>;
    insert(job: Job): Promise<void>;
    update(job: Job): Promise<void>;
    /** Queued jobs due by `now`, plus running jobs not updated since `staleBefore` (crashed runs). */
    listDue(options: { now: string; staleBefore: string; limit: number }): Promise<Job[]>;
    /**
     * Atomically move a due job (queued and runAfter <= now, or running but not updated since staleBefore)
     * to running and increment attempt, only below maxAttempts. Otherwise atomically mark it failed
     * and mark its queued/processing inspiration failed, preserving source and partial results.
     * Return the failed row for that transition; null when not due or another runner holds it.
     */
    claim(id: string, options: { now: string; staleBefore: string }): Promise<Job | null>;
  };
  assets: {
    get(id: string): Promise<AssetRecord | null>;
    insert(asset: AssetRecord): Promise<void>;
  };
}

/** Private screenshot bytes. Never served without an ownership check. */
export interface PrivateAssetStorage {
  put(id: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(id: string): Promise<Uint8Array<ArrayBuffer> | null>;
  remove(id: string): Promise<void>;
}

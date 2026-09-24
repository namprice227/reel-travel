import type { AccountPlace, AccountReel, AccountReelJob, CandidatePlace, Inspiration, Itinerary, Job, Reservation, Share, Trip, User } from "@reel/contracts";

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

/** A worker may write only while it still owns this claimed attempt. */
export interface ImportLease { jobId: string; attempt: number }
export type ImportChanges = Partial<Pick<Inspiration, "status" | "failureCode" | "failureMessage" | "placeIds">>;

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
    /** Remove the trip and all trip-owned rows. Supabase uses FK cascade; file mode mirrors it. */
    delete(id: string): Promise<void>;
    /** Update details/preferences while atomically preserving the current itinerary pointer. */
    update(trip: Trip, expected?: Trip): Promise<Trip>;
    /** Atomically attach new private cover metadata and remove the replaced metadata row. */
    setCover(trip: Trip, asset: AssetRecord, expected: Trip): Promise<Trip>;
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
  accountReels: {
    listByOwner(ownerId: string): Promise<AccountReel[]>;
    listPlacesByOwner(ownerId: string): Promise<AccountPlace[]>;
    /** Replace provider mapping fields on existing places from one owned account reel. */
    updatePlaces(reelId: string, ownerId: string, places: AccountPlace[]): Promise<void>;
    get(id: string): Promise<AccountReel | null>;
    deleteByOwner(id: string, ownerId: string): Promise<void>;
    /** Persist the source and job together, with the same account import limits as trip saves. */
    submit(reel: AccountReel, job: AccountReelJob): Promise<{ reel: AccountReel; job: AccountReelJob }>;
    recover(reelId: string, ownerId: string, text: string, job: AccountReelJob): Promise<{ reel: AccountReel; job: AccountReelJob }>;
    listDue(options: { now: string; staleBefore: string; limit: number }): Promise<AccountReelJob[]>;
    getJob(id: string): Promise<AccountReelJob | null>;
    claim(id: string, options: { now: string; staleBefore: string }): Promise<AccountReelJob | null>;
    /**
     * Itinerary reel: while the attempt still owns the job, insert the draft trip and link it to the reel.
     * A retried attempt gets the already-linked trip back instead of a second one. Null: the lease was lost.
     */
    attachDraftTrip(job: AccountReelJob, trip: Trip): Promise<Trip | null>;
    /** While the attempt owns the job, record how the source presents itself. False: the lease was lost. */
    recordFormat(job: AccountReelJob, format: NonNullable<AccountReel["format"]>): Promise<boolean>;
    /** Undo an automatic draft: delete the still-draft trip and keep its places as account ideas, atomically. */
    convertDraftToIdeas(reelId: string, ownerId: string, places: AccountPlace[], now: string): Promise<AccountReel>;
    /** A claimed attempt may commit source-backed places only while it still owns the job. */
    settle(job: AccountReelJob, update: {
      status: AccountReel["status"];
      failureCode: AccountReel["failureCode"];
      failureMessage: string | null;
      places?: AccountPlace[];
    }): Promise<boolean>;
  };
  imports: {
    /** Atomically persist source/optional asset metadata and its job, enforcing user quotas. */
    create(inspiration: Inspiration, job: Job, asset?: AssetRecord): Promise<{ inspiration: Inspiration; job: Job }>;
    /** Lock/check the current source; append details atomically. Retry reuses an already active job. */
    recover(inspirationId: string, job: Job, details?: string): Promise<{ inspiration: Inspiration; job: Job }>;
    /** Cancel active work and skip together; reject a source that has already started processing. */
    skip(inspirationId: string, now: string): Promise<Inspiration>;
    /** Atomic patch that never revives skipped sources; optional lease fences obsolete worker attempts. */
    transition(inspirationId: string, changes: ImportChanges, now: string, lease?: ImportLease): Promise<Inspiration | null>;
  };
  places: {
    listByTrip(tripId: string): Promise<CandidatePlace[]>;
    get(id: string): Promise<CandidatePlace | null>;
    insert(place: CandidatePlace): Promise<void>;
    update(place: CandidatePlace): Promise<void>;
    /** Compare the full stored candidate atomically; never overwrite intervening user/import changes. */
    updateIfUnchanged(place: CandidatePlace, expected: CandidatePlace): Promise<boolean>;
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
    listByTrip(tripId: string): Promise<Job[]>;
    /** Insert one verification job; reuse a competing active job using the unique target constraint. */
    enqueueVerification(job: Job): Promise<Job>;
    get(id: string): Promise<Job | null>;
    latestForTarget(targetId: string): Promise<Job | null>;
    insert(job: Job): Promise<void>;
    update(job: Job): Promise<void>;
    /** Finish/requeue the claimed attempt and patch its source in one transaction; false for a lost lease. */
    settle(job: Job, changes?: ImportChanges): Promise<boolean>;
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
    listByTrip(tripId: string): Promise<AssetRecord[]>;
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

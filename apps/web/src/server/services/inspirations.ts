import type {
  CandidatePlace,
  EndpointBody,
  Inspiration,
  InspirationStatus,
  Job,
  SourceType,
  User,
} from "@reel/contracts";
import { trackServer } from "../analytics";
import { assetStorage, repos, type AssetRecord } from "../db";
import { invalidState, notFound } from "../errors";
import { newId, nowIso } from "../ids";
import { enqueueImport } from "../jobs/queue";
import { belongsTo, getOwnedTrip } from "./access";

// Saves and import recovery (F1). Storing the save always happens before extraction,
// so a failing job never loses what the traveler saved.

const RECOVERABLE: InspirationStatus[] = ["needs_input", "failed"];
const SKIPPABLE: InspirationStatus[] = ["queued", "needs_input", "failed"];

export async function listInspirations(user: User, tripId: string): Promise<Inspiration[]> {
  const trip = await getOwnedTrip(user, tripId);
  const inspirations = await repos().inspirations.listByTrip(trip.id);
  return inspirations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createInspiration(
  user: User,
  tripId: string,
  input: EndpointBody<"inspirations.create">,
): Promise<{ inspiration: Inspiration; job: Job }> {
  const trip = await getOwnedTrip(user, tripId);
  const inspiration = newInspiration(trip.id, input.sourceType, {
    text: input.sourceType === "text" ? input.text : null,
    url: input.sourceType === "link" ? input.url : null,
    note: input.note ?? null,
  });
  return saveAndQueue(inspiration);
}

export async function createScreenshotInspiration(
  user: User,
  tripId: string,
  input: EndpointBody<"inspirations.createFromScreenshot">,
): Promise<{ inspiration: Inspiration; job: Job }> {
  const trip = await getOwnedTrip(user, tripId);
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const asset: AssetRecord = {
    id: newId("asset"),
    ownerId: user.id,
    tripId: trip.id,
    contentType: input.file.type,
    size: bytes.byteLength,
    createdAt: nowIso(),
  };
  await assetStorage().put(asset.id, bytes);
  await repos().assets.insert(asset);
  return saveAndQueue(newInspiration(trip.id, "screenshot", { assetId: asset.id, note: input.note ?? null }));
}

export async function getInspiration(
  user: User,
  tripId: string,
  inspirationId: string,
): Promise<{ inspiration: Inspiration; places: CandidatePlace[]; job: Job | null }> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const inspiration = belongsTo(await r.inspirations.get(inspirationId), trip, "Save");
  const places = (await r.places.listByTrip(trip.id)).filter((p) => inspiration.placeIds.includes(p.id));
  return { inspiration, places, job: await r.jobs.latestForTarget(inspiration.id) };
}

export async function retryInspiration(user: User, tripId: string, inspirationId: string) {
  const inspiration = await loadRecoverable(user, tripId, inspirationId);
  return requeue(inspiration, {});
}

export async function addInspirationDetails(
  user: User,
  tripId: string,
  inspirationId: string,
  input: EndpointBody<"inspirations.addDetails">,
) {
  const inspiration = await loadRecoverable(user, tripId, inspirationId);
  return requeue(inspiration, { details: [inspiration.details, input.text].filter(Boolean).join("\n") });
}

export async function skipInspiration(user: User, tripId: string, inspirationId: string): Promise<Inspiration> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const inspiration = belongsTo(await r.inspirations.get(inspirationId), trip, "Save");
  if (!SKIPPABLE.includes(inspiration.status)) {
    throw invalidState(`A save that is ${inspiration.status} can't be skipped.`);
  }
  const skipped: Inspiration = { ...inspiration, status: "skipped", updatedAt: nowIso() };
  await r.inspirations.update(skipped);
  return skipped;
}

/** Private upload bytes, owner only. */
export async function getOwnedAsset(user: User, assetId: string) {
  const asset = await repos().assets.get(assetId);
  if (!asset || asset.ownerId !== user.id) throw notFound("Upload");
  const bytes = await assetStorage().get(asset.id);
  if (!bytes) throw notFound("Upload");
  return { asset, bytes };
}

function newInspiration(
  tripId: string,
  sourceType: SourceType,
  fields: Partial<Pick<Inspiration, "text" | "url" | "assetId" | "note">>,
): Inspiration {
  const now = nowIso();
  return {
    id: newId("insp"),
    tripId,
    sourceType,
    text: null,
    url: null,
    assetId: null,
    note: null,
    ...fields,
    details: null,
    status: "queued",
    failureCode: null,
    failureMessage: null,
    attempts: 0,
    placeIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function saveAndQueue(inspiration: Inspiration) {
  await repos().inspirations.insert(inspiration);
  const job = await enqueueImport(inspiration);
  trackServer("import_started", { sourceType: inspiration.sourceType });
  return { inspiration, job };
}

async function loadRecoverable(user: User, tripId: string, inspirationId: string): Promise<Inspiration> {
  const trip = await getOwnedTrip(user, tripId);
  const inspiration = belongsTo(await repos().inspirations.get(inspirationId), trip, "Save");
  if (!RECOVERABLE.includes(inspiration.status)) {
    throw invalidState(`Only saves that need input or failed can be retried (this one is ${inspiration.status}).`);
  }
  return inspiration;
}

async function requeue(inspiration: Inspiration, changes: Partial<Inspiration>) {
  const next: Inspiration = {
    ...inspiration,
    ...changes,
    status: "queued",
    failureCode: null,
    failureMessage: null,
    updatedAt: nowIso(),
  };
  await repos().inspirations.update(next);
  return { inspiration: next, job: await enqueueImport(next) };
}

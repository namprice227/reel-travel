import type {
  CandidatePlace,
  EndpointBody,
  Inspiration,
  Job,
  SourceType,
  User,
} from "@reel/contracts";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_CONTENT_TYPES } from "@reel/contracts";
import { trackServer } from "../analytics";
import { assetStorage, repos, type AssetRecord } from "../db";
import { AppError, notFound } from "../errors";
import { newId, nowIso } from "../ids";
import { newImportJob } from "../jobs/queue";
import { IMPORT_REQUEST_LIMIT } from "../jobs/import-limits";
import { enforceRateLimit } from "./rate-limits";
import { belongsTo, getOwnedTrip } from "./access";

// Saves and import recovery (F1). Storing the save always happens before extraction,
// so a failing job never loses what the traveler saved.

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
  await enforceRateLimit(`import-request:${user.id}`, IMPORT_REQUEST_LIMIT);
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
  if (input.file.size > MAX_SCREENSHOT_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Screenshots must be at most 4 MiB.");
  if (!input.file.size || !(SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(input.file.type)) {
    throw new AppError("VALIDATION_FAILED", "Choose a nonempty PNG, JPEG, WebP or GIF image.");
  }
  await enforceRateLimit(`import-request:${user.id}`, IMPORT_REQUEST_LIMIT);
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const asset: AssetRecord = {
    id: newId("asset"),
    ownerId: user.id,
    tripId: trip.id,
    contentType: input.file.type,
    size: bytes.byteLength,
    createdAt: nowIso(),
  };
  await assetStorage().put(asset.id, bytes, asset.contentType);
  try {
    return await saveAndQueue(newInspiration(trip.id, "screenshot", { assetId: asset.id, note: input.note ?? null }), asset);
  } catch (error) {
    // A lost RPC response might follow a successful commit. Never delete a committed upload.
    try { if (!await repos().assets.get(asset.id)) await assetStorage().remove(asset.id); }
    catch { console.warn("[upload] Unconfirmed upload cleanup requires reconciliation."); }
    throw error;
  }
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

/** Follow evidence across trips without weakening ownership: the save's own trip identifies its owner. */
export async function getOwnedInspiration(
  user: User,
  inspirationId: string,
): Promise<{ inspiration: Inspiration; places: CandidatePlace[]; job: Job | null }> {
  const r = repos();
  const inspiration = await r.inspirations.get(inspirationId);
  if (!inspiration) throw notFound("Save");
  const trip = await getOwnedTrip(user, inspiration.tripId);
  const places = (await r.places.listByTrip(trip.id)).filter((place) => inspiration.placeIds.includes(place.id));
  return { inspiration, places, job: await r.jobs.latestForTarget(inspiration.id) };
}

export async function retryInspiration(user: User, tripId: string, inspirationId: string) {
  return recover(user, tripId, inspirationId);
}

export async function addInspirationDetails(
  user: User,
  tripId: string,
  inspirationId: string,
  input: EndpointBody<"inspirations.addDetails">,
) {
  return recover(user, tripId, inspirationId, input.text);
}

export async function skipInspiration(user: User, tripId: string, inspirationId: string): Promise<Inspiration> {
  const r = repos();
  const trip = await getOwnedTrip(user, tripId);
  const inspiration = belongsTo(await r.inspirations.get(inspirationId), trip, "Save");
  return r.imports.skip(inspiration.id, nowIso());
}

/** Private upload bytes, owner only. */
export async function getOwnedAsset(user: User, assetId: string) {
  const asset = await repos().assets.get(assetId);
  if (!asset || asset.ownerId !== user.id) throw notFound("Upload");
  const bytes = await assetStorage().get(asset.id);
  if (!bytes) throw notFound("Upload");
  return { asset, bytes };
}

export function newInspiration(
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

async function saveAndQueue(inspiration: Inspiration, asset?: AssetRecord) {
  const result = await repos().imports.create(inspiration, newImportJob(inspiration), asset);
  trackServer("import_started", { sourceType: inspiration.sourceType });
  return result;
}

async function recover(user: User, tripId: string, inspirationId: string, details?: string) {
  const trip = await getOwnedTrip(user, tripId);
  const inspiration = belongsTo(await repos().inspirations.get(inspirationId), trip, "Save");
  await enforceRateLimit(`import-request:${user.id}`, IMPORT_REQUEST_LIMIT);
  return repos().imports.recover(inspiration.id, newImportJob(inspiration), details);
}

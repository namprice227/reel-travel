import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reel-trip-cover-"));
vi.stubEnv("DATA_BACKEND", "file");
vi.stubEnv("REEL_DATA_DIR", directory);
const { repos, assetStorage } = await import("../../apps/web/src/server/db");
const { devSignIn } = await import("../../apps/web/src/server/services/auth");
const { createTrip, uploadTripCover } = await import("../../apps/web/src/server/services/trips");

afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith("reel-trip-cover-")) {
    throw new Error("Unsafe test cleanup");
  }
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function fixture() {
  const user = (await devSignIn({ email: `cover-${crypto.randomUUID()}@example.test` })).user;
  const trip = await createTrip(user, {
    title: "Synthetic cover trip", destination: "Bangkok", timezone: "Asia/Bangkok",
    startDate: "2026-10-01", endDate: "2026-10-03",
  });
  return { user, trip };
}

const image = (bytes: number[], name = "cover.webp") => new File([new Uint8Array(bytes)], name, { type: "image/webp" });

it("stores cover bytes privately and atomically replaces its metadata reference", async () => {
  const f = await fixture();
  const first = await uploadTripCover(f.user, f.trip.id, { file: image([1, 2, 3]), expectedUpdatedAt: f.trip.updatedAt });
  expect(first.coverAssetId).toMatch(/^asset_/);
  expect(await repos().assets.get(first.coverAssetId!)).toMatchObject({ ownerId: f.user.id, tripId: f.trip.id, contentType: "image/webp", size: 3 });
  expect(await assetStorage().get(first.coverAssetId!)).toEqual(new Uint8Array([1, 2, 3]));

  const second = await uploadTripCover(f.user, f.trip.id, { file: image([4, 5]), expectedUpdatedAt: first.updatedAt });
  expect(second.coverAssetId).not.toBe(first.coverAssetId);
  expect(await repos().assets.get(first.coverAssetId!)).toBeNull();
  expect(await assetStorage().get(first.coverAssetId!)).toBeNull();
  expect(await assetStorage().get(second.coverAssetId!)).toEqual(new Uint8Array([4, 5]));
});

it("rejects stale cover changes before writing any bytes", async () => {
  const f = await fixture();
  const put = vi.spyOn(assetStorage(), "put");
  await expect(uploadTripCover(f.user, f.trip.id, {
    file: image([1]), expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
  })).rejects.toMatchObject({ code: "STALE_TRIP" });
  expect(put).not.toHaveBeenCalled();
});

it("rejects unsupported cover formats before storage", async () => {
  const f = await fixture();
  const put = vi.spyOn(assetStorage(), "put");
  await expect(uploadTripCover(f.user, f.trip.id, {
    file: new File([new Uint8Array([1])], "cover.gif", { type: "image/gif" }),
  })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(put).not.toHaveBeenCalled();
});

import { config } from "../config";
import { createFileAssetStorage, createFileRepositories } from "./file-store";
import type { PrivateAssetStorage, Repositories } from "./types";

export type { AssetRecord, PrivateAssetStorage, Repositories, SessionRecord, ShareRecord } from "./types";

// Kept on globalThis so Next.js hot reloads and separate route bundles share one instance.
const holder = globalThis as typeof globalThis & {
  __reelData?: { dir: string; repos: Repositories; assets: PrivateAssetStorage };
};

function current() {
  const dir = config.dataDir;
  if (!holder.__reelData || holder.__reelData.dir !== dir) {
    holder.__reelData = { dir, repos: createFileRepositories(dir), assets: createFileAssetStorage(dir) };
  }
  return holder.__reelData;
}

/** Swap the implementation here when the real database lands. */
export const repos = (): Repositories => current().repos;
export const assetStorage = (): PrivateAssetStorage => current().assets;

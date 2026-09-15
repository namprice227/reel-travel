import { config } from "../config";
import { createFileAssetStorage, createFileRepositories } from "./file-store";
import { createSupabaseAdminClient } from "../supabase/client";
import { createSupabaseAssetStorage, createSupabaseRepositories } from "./supabase";
import type { PrivateAssetStorage, Repositories } from "./types";

export type { AssetRecord, PrivateAssetStorage, Repositories, SessionRecord, ShareRecord } from "./types";

// Kept on globalThis so Next.js hot reloads and separate route bundles share one instance.
const holder = globalThis as typeof globalThis & {
  __reelData?: { dir: string; repos: Repositories; assets: PrivateAssetStorage };
  __reelSupabase?: { key: string; repos: Repositories; assets: PrivateAssetStorage };
};

function current() {
  if (config.dataBackend === "supabase") {
    // Compare configuration without logging credentials; never fall back to local storage on failure.
    const key = `${config.supabaseUrl}:${config.supabaseSecretKey}`;
    if (!holder.__reelSupabase || holder.__reelSupabase.key !== key) {
      const client = createSupabaseAdminClient();
      const repos = createSupabaseRepositories(client);
      holder.__reelSupabase = { key, repos, assets: createSupabaseAssetStorage(client) };
    }
    return holder.__reelSupabase;
  }
  const dir = config.dataDir;
  if (!holder.__reelData || holder.__reelData.dir !== dir) {
    holder.__reelData = { dir, repos: createFileRepositories(dir), assets: createFileAssetStorage(dir) };
  }
  return holder.__reelData;
}

/** Select by DATA_BACKEND; production never uses the development store. */
export const repos = (): Repositories => current().repos;
export const assetStorage = (): PrivateAssetStorage => current().assets;

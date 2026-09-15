import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tripFixture } from "@reel/contracts/fixtures";
import { createSupabaseAssetStorage, createSupabaseRepositories } from "../../apps/web/src/server/db/supabase";

afterEach(() => { vi.restoreAllMocks(); });
function clientWith(response: (request: Request) => Response | Promise<Response>) {
  return createClient("https://synthetic.supabase.co", "synthetic-server-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => response(new Request(input, init)) },
  });
}

describe("Supabase HTTP adapter", () => {
  it("scopes owner queries, parses documents and pages beyond one provider response", async () => {
    const seen: URL[] = [];
    const client = clientWith((request) => {
      const url = new URL(request.url); seen.push(url);
      const offset = Number(url.searchParams.get("offset"));
      const rows = offset === 0 ? Array.from({ length: 500 }, (_, i) => ({ data: { ...tripFixture, id: `trip_${i}` } })) : [];
      return Response.json(rows);
    });
    expect(await createSupabaseRepositories(client).trips.listByOwner("owner_test")).toHaveLength(500);
    expect(seen).toHaveLength(2);
    expect(seen.every((url) => url.pathname === "/rest/v1/reel_trips" && url.searchParams.get("owner_id") === "eq.owner_test")).toBe(true);
    expect(seen[1]!.searchParams.get("offset")).toBe("500");
  });

  it("uses the atomic RPC for itinerary versions and preserves stale-version details", async () => {
    const client = clientWith(async (request) => {
      expect(new URL(request.url).pathname).toBe("/rest/v1/rpc/reel_save_itinerary");
      expect(await request.json()).toMatchObject({ p_expected_version: 2 });
      return Response.json({ code: "P0001", message: "STALE_VERSION", details: '{"currentVersion":3}' }, { status: 400 });
    });
    const { itineraryFixtures } = await import("@reel/contracts/fixtures");
    await expect(createSupabaseRepositories(client).itineraries.saveVersion(itineraryFixtures.valid, 2))
      .rejects.toMatchObject({ code: "STALE_VERSION", details: { currentVersion: 3 } });
  });

  it("does not leak provider error contents", async () => {
    const client = clientWith(() => Response.json({ code: "23505", message: "PRIVATE_SENTINEL", details: "PRIVATE_SENTINEL" }, { status: 409 }));
    await expect(createSupabaseRepositories(client).trips.get("missing"))
      .rejects.toMatchObject({ code: "INTERNAL", message: "The data service is unavailable. Try again." });
  });

  it("uses private storage uploads and authenticated downloads, never public URLs", async () => {
    const requests: Request[] = [];
    const client = clientWith(async (request) => {
      requests.push(request);
      if (request.method === "POST") return Response.json({ Key: "reel-private-uploads/asset_test" });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
    });
    const storage = createSupabaseAssetStorage(client);
    await storage.put("asset_test", new Uint8Array([1, 2, 3]), "image/png");
    expect(await storage.get("asset_test")).toEqual(new Uint8Array([1, 2, 3]));
    expect(requests[0]!.headers.get("Content-Type")).toBe("image/png");
    expect(requests[0]!.headers.get("x-upsert")).toBe("false");
    expect(requests.every((r) => new URL(r.url).pathname.includes("reel-private-uploads/asset_test") && !r.url.includes("/public/"))).toBe(true);
    await expect(storage.get("../private")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

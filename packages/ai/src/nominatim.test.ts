import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNominatimPlaceLookup, OSM_ATTRIBUTION } from "./nominatim";

let cacheDir: string;
beforeEach(async () => { cacheDir = await mkdtemp(path.join(os.tmpdir(), "reel-osm-test-")); });
afterEach(async () => { vi.useRealTimers(); await rm(cacheDir, { recursive: true, force: true }); });
const clue = { query: "Synthetic Cafe", hint: "Synthetic Area", excerpt: "Do not send this source passage" };
const context = { destination: "Synthetic City" };
const result = (osm_type = "node", osm_id = 123) => ({ osm_type, osm_id, lat: "35.6", lon: "139.7", name: "Synthetic Cafe",
  display_name: "Synthetic Cafe, Synthetic Area, Synthetic City", type: "cafe", namedetails: { "name:en": "Synthetic Cafe English" } });

it("maps provider identities/coordinates and attribution without inventing hours or sending evidence", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([result()]));
  const gate = vi.fn(async () => {});
  const found = await createNominatimPlaceLookup({ cacheDir, beforeRequest: gate, fetch: fetcher }).search(clue, context);
  expect(found[0]).toMatchObject({ providerPlaceId: "osm:node:123", name: "Synthetic Cafe English", location: { lat: 35.6, lng: 139.7 },
    details: { provider: "openstreetmap", openingHours: { status: "unknown" }, priceLevel: null, typicalVisitMinutes: null, attribution: OSM_ATTRIBUTION } });
  const [url, init] = fetcher.mock.calls[0]!;
  expect(String(url)).not.toContain("source+passage");
  expect(new URL(String(url)).searchParams.get("q")).toBe("Synthetic Cafe, Synthetic Area, Synthetic City");
  expect(init?.headers).toMatchObject({ "User-Agent": expect.stringContaining("ReelTravel/") });
  expect(gate).toHaveBeenCalledOnce();
});

it("persists cache across adapter instances and caches empty searches", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([]));
  const gate = vi.fn(async () => {});
  for (let i = 0; i < 2; i++) expect(await createNominatimPlaceLookup({ cacheDir, beforeRequest: gate, fetch: fetcher }).search(clue, context)).toEqual([]);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(gate).toHaveBeenCalledOnce();
  expect(await readdir(cacheDir)).toHaveLength(1);
});

it("deduplicates only identical OSM type/id, retaining separate branches", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([result(), result(), result("way", 123)]));
  const found = await createNominatimPlaceLookup({ cacheDir, beforeRequest: async () => {}, fetch: fetcher }).search(clue, context);
  expect(found.map(p => p.providerPlaceId)).toEqual(["osm:node:123", "osm:way:123"]);
});

it("refreshes cached provider results after seven days", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-19T00:00:00Z"));
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([result()]));
  const lookup = createNominatimPlaceLookup({ cacheDir, beforeRequest: async () => {}, fetch: fetcher });
  await lookup.search(clue, context);
  vi.setSystemTime(new Date("2026-09-27T00:00:00Z"));
  await lookup.search(clue, context);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([{ lat: "" }, { lon: "999" }, { osm_type: "unknown" }, { osm_id: 0 }])("rejects malformed facts %j", async bad => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ ...result(), ...bad }]));
  await expect(createNominatimPlaceLookup({ cacheDir, beforeRequest: async () => {}, fetch: fetcher }).search(clue, context))
    .rejects.toMatchObject({ code: "LOOKUP_ERROR" });
  expect(await readdir(cacheDir)).toEqual([]);
});

it("does not accept a capped result set as a complete branch search", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(Array.from({ length: 10 }, (_, n) => result("node", n + 1))));
  await expect(createNominatimPlaceLookup({ cacheDir, beforeRequest: async () => {}, fetch: fetcher }).search(clue, context))
    .rejects.toThrow(/more specific/);
});

it("separates endpoint caches and never caches provider errors", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([result()]));
  await createNominatimPlaceLookup({ cacheDir, beforeRequest: async () => {}, fetch: fetcher }).search(clue, context);
  fetcher.mockResolvedValue(new Response("Synthetic error", { status: 429 }));
  await expect(createNominatimPlaceLookup({ endpoint: "https://synthetic.example.test/search", cacheDir, beforeRequest: async () => {}, fetch: fetcher }).search(clue, context))
    .rejects.toMatchObject({ code: "LOOKUP_ERROR" });
  expect(await readdir(cacheDir)).toHaveLength(1);
});

it("never fetches if the shared rate-limit gate is unavailable", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(createNominatimPlaceLookup({ cacheDir, fetch: fetcher, beforeRequest: async () => { throw Error("synthetic database down"); } }).search(clue, context)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

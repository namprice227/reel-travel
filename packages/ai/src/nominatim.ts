import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PlaceOption } from "@reel/contracts";
import type { PlaceLookup } from "./types";
import { ProviderError, providerJson } from "./provider-request";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors — https://www.openstreetmap.org/copyright (ODbL)";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const coordinate = (min: number, max: number) => z.union([z.string().trim().min(1), z.number()])
  .transform(Number).pipe(z.number().finite().min(min).max(max));
const resultSchema = z.object({
  osm_type: z.enum(["node", "way", "relation"]),
  osm_id: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9]\d*$/)]).transform(String),
  lat: coordinate(-90, 90), lon: coordinate(-180, 180),
  name: z.string().optional(), display_name: z.string().min(1), type: z.string().optional(),
  namedetails: z.record(z.string(), z.string()).optional(),
});
const cacheSchema = z.object({ expiresAt: z.number(), options: z.array(PlaceOption).max(10) });

/** Server-only. The caller must supply the app-wide request gate, shared across worker processes. */
export function createNominatimPlaceLookup(options: {
  endpoint?: string; cacheDir: string; beforeRequest: () => Promise<void>;
  fetch?: typeof fetch; timeoutMs?: number;
}): PlaceLookup {
  const endpoint = new URL(options.endpoint ?? NOMINATIM_URL);
  if (!(["https:", "http:"].includes(endpoint.protocol)) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new ProviderError("INVALID_CONFIGURATION", "NOMINATIM_SEARCH_URL must be an HTTP(S) search endpoint without credentials or query parameters.");
  return { maxClues: 10, async search(clue, context) {
    const query = [...new Set([clue.query, clue.hint, context.destination].filter((s): s is string => Boolean(s?.trim())).map(s => s.trim()))].join(", ");
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "10", namedetails: "1", "accept-language": "en", dedupe: "1" }).toString();
    const key = createHash("sha256").update(`v1:${url}`).digest("hex");
    const file = path.join(options.cacheDir, `${key}.json`);
    const cached = async () => {
      try {
        const parsed = cacheSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
        return parsed.success && parsed.data.expiresAt > Date.now() ? parsed.data.options : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
        throw new ProviderError("LOOKUP_ERROR", "OpenStreetMap lookup cache is unavailable.");
      }
    };
    const hit = await cached();
    if (hit !== null) return hit;
    // Fail before any external call if persistent caching cannot be created.
    await mkdir(options.cacheDir, { recursive: true });
    await options.beforeRequest();
    const recent = await cached();
    if (recent !== null) return recent;
    const raw = await providerJson(url.toString(), { method: "GET", headers: {
      "User-Agent": "ReelTravel/0.1 (+https://reel-travel.vercel.app)", Accept: "application/json",
    } }, { fetch: options.fetch, timeoutMs: options.timeoutMs ?? 20_000, code: "LOOKUP_ERROR" });
    const parsed = z.array(resultSchema).max(10).safeParse(raw);
    if (!parsed.success) throw new ProviderError("LOOKUP_ERROR", "Invalid OpenStreetMap response; no guessed place facts accepted.");
    if (parsed.data.length === 10) throw new ProviderError("LOOKUP_ERROR", "Too many OpenStreetMap matches. Add a more specific venue or area.");
    const found = new Map<string, PlaceOption>();
    for (const result of parsed.data) {
      const id = `osm:${result.osm_type}:${result.osm_id}`;
      found.set(id, PlaceOption.parse({ providerPlaceId: id,
        name: result.namedetails?.["name:en"] || result.name || result.namedetails?.name || result.display_name.split(",")[0]!.trim(),
        address: result.display_name, location: { lat: result.lat, lng: result.lon },
        details: { provider: "openstreetmap", providerPlaceId: id, fetchedAt: new Date().toISOString(), category: result.type || null,
          openingHours: { status: "unknown" }, typicalVisitMinutes: null, priceLevel: null,
          unknownFields: ["openingHours", "typicalVisitMinutes", "priceLevel", ...(!result.type ? ["category"] : [])], attribution: OSM_ATTRIBUTION } }));
    }
    const matches = [...found.values()];
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ expiresAt: Date.now() + CACHE_MS, options: matches }), { mode: 0o600 });
    await rename(temporary, file);
    return matches;
  } };
}

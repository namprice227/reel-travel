# Google Maps for every map display (23 September 2026)

**Status:** implemented locally; key-free and keyed maps verified in the running app on `localhost:3000` with the
user's browser Embed API key. Not reviewed by a human.
**Tasks:** FE10 (map views), FE04 (place detail map).

## Problem

Place lookup uses Google, but any map with two or more pins (day panel, Map tab, shared itinerary, magazine) was
drawn by Leaflet with OpenStreetMap tiles. The site's content security policy does not allow
`tile.openstreetmap.org`, so those maps rendered without a base map in production; the browser console showed the
blocked tiles during the create-trip live check.

## Change

- `apps/web/src/components/MapView.tsx` is Google-only. With `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` set, several stops show
  the day's route through the Maps Embed API (`/maps/embed/v1/directions`, up to 20 waypoints); **All stops** and
  numbered stop buttons switch between the route and one stop. Without the key, the existing keyless embed shows one
  stop at a time with the same stop buttons.
- Only coordinates go to Google, never place names, so fictional fixtures stay local.
- The route mode follows the trip's getting-around choice (walking or driving). Transit is used only for two stops,
  because the Embed API does not route transit through waypoints; longer transit days use Google's default mode.
- The Map tab's "Journey / Google Maps" toggle became **Route / One stop** and appears only when a key is set.
- The day panel's small map hides its own stop buttons and caption; the panel already lists stops and links out.
- Leaflet, react-leaflet and @types/leaflet were removed. Styles that sized `.leaflet-container` now size the Google map.
- No content security policy change: `frame-src https://www.google.com` already allows the embeds.
- The Maps JavaScript API was not used: Google's allowlist policy for it requires `'unsafe-eval'` and broad script
  sources.

## Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 613 tests; new cases cover the route URL (origin, waypoints, destination, mode, 20-waypoint cap, transit rule, no key → none) and keyed vs keyless place embeds |
| `npm run test:e2e:offline` | PASS, 34 checks. `my-trip-ux.mjs` previously **asserted** OpenStreetMap tiles were requested; it now asserts none are, and that the map-style toggle is hidden without a key |
| Live app (file store, fake providers, no key) | Map tab and day panel load `maps.google.com` embeds; 0 OpenStreetMap requests; stop button 2 moves the map to the second stop's coordinates |

## To enable the route view (owner action)

1. In Google Cloud, create a **new** API key (do not reuse the server Places key).
2. Restrict it to **Maps Embed API** and to the site's HTTP referrers (production domain and `localhost` for dev).
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` in Vercel and in `apps/web/.env.local`, then rebuild.

Then check a multi-stop day on the Map tab: the route should appear with **All stops** selected.

## Keyed check (same day, after the user added the key)

The user added `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` to `apps/web/.env.local` (value not read or recorded). With the
file store and fake providers on `localhost:3000`, synthetic Bob account, trip "Four days in Tokyo" (two fictional
fixture stops, transport Car):

- Map tab: Google drew the route between the two stops (`/maps/embed/v1/directions`, `mode=driving`, about 6 min).
  Stop 2 switched to `/maps/embed/v1/place`; **All stops** returned to the route. 0 OpenStreetMap requests.
- **Bug found and fixed:** the Map tab opened on stop 1 although **Route** was selected, because the page passed its
  default selection to the map. `RouteMap.tsx` now passes only a stop the traveler picked, so the route shows first.
- Itinerary day panel: the route embed showed with no stop buttons, as intended.
- Rerun after the fix: 613 unit tests and 34 offline browser checks PASS.

## Not verified

- A day with three or more stops (waypoints) in a browser; only unit tests cover the waypoint URL.
- The public shared-trip map, and the production domain in the key's referrer list.
- Google Maps Platform billing or quota for the Embed API on this project.

/**
 * End-to-end API smoke test of the core demo through the HTTP contract. Needs a running app:
 *
 *   npm run dev          (terminal 1)
 *   npm run smoke        (terminal 2; SMOKE_BASE_URL defaults to http://localhost:3000)
 *
 * Uses fresh example.test accounts each run, so it does not touch seeded data.
 */
import type { EndpointId } from "@reel/contracts";
import { ApiError, createApiClient } from "../apps/web/src/lib/api-client";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

function clientWithCookies() {
  let cookie = "";
  const cookieFetch: typeof fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(input, { ...init, headers });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0]!;
      if (pair.startsWith("reel_session=")) cookie = pair.endsWith("=") ? "" : pair;
    }
    return response;
  };
  return createApiClient({ baseUrl, fetch: cookieFetch });
}

let step = 0;
function pass(message: string) {
  step += 1;
  console.log(`  ✓ ${String(step).padStart(2, "0")} ${message}`);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
async function expectError(code: string, action: () => Promise<unknown>, what: EndpointId | string) {
  try {
    await action();
  } catch (error) {
    if (error instanceof ApiError && error.code === code) return;
    throw error;
  }
  throw new Error(`${what}: expected ${code}, but the call succeeded`);
}

const alice = clientWithCookies();
const bob = clientWithCookies();
const visitor = createApiClient({ baseUrl });
const stamp = Date.now();

async function waitForImports(tripId: string) {
  for (let i = 0; i < 40; i += 1) {
    const { inspirations } = await alice("inspirations.list", { params: { tripId } });
    if (!inspirations.some((s) => s.status === "queued" || s.status === "processing")) return inspirations;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Imports did not finish within 20 s");
}

console.log(`Smoke test against ${baseUrl}`);

await expectError("UNAUTHENTICATED", () => alice("trips.list"), "trips.list");
pass("signed-out request is rejected");

const realAuth = process.env.SMOKE_AUTH === "supabase";
if (realAuth) {
  const required = (key: string) => {
    if (!process.env[key]) throw new Error(`${key} is required with SMOKE_AUTH=supabase.`);
    return process.env[key]!;
  };
  await alice("auth.signIn", { body: { email: required("SMOKE_ALICE_EMAIL"), password: required("SMOKE_ALICE_PASSWORD") } });
  await bob("auth.signIn", { body: { email: required("SMOKE_BOB_EMAIL"), password: required("SMOKE_BOB_PASSWORD") } });
  await expectError("FORBIDDEN", () => visitor("auth.devSignIn", { body: { email: "disabled@example.test" } }), "dev sign-in disabled");
} else {
  await alice("auth.devSignIn", { body: { email: `smoke-alice-${stamp}@example.test` } });
  await bob("auth.devSignIn", { body: { email: `smoke-bob-${stamp}@example.test` } });
}
pass("two accounts signed in");

const { trip } = await alice("trips.create", {
  body: { title: "Smoke trip", destination: "Tokyo", timezone: "Asia/Tokyo", startDate: "2026-10-01", endDate: "2026-10-04" },
});
pass(`trip created (${trip.id})`);

await expectError("NOT_FOUND", () => bob("trips.get", { params: { tripId: trip.id } }), "trips.get as other user");
pass("another account cannot read the trip");

const params = { tripId: trip.id };
await alice("inspirations.create", {
  params,
  body: { sourceType: "text", text: "Kumo Ramen for lunch, the sky deck at sunset, and the lantern temple early." },
});
const { inspiration: link } = await alice("inspirations.create", {
  params,
  body: { sourceType: "link", url: "https://www.instagram.com/reel/smoke" },
});
let saves = await waitForImports(trip.id);
assert(saves.find((s) => s.id === link.id)?.status === "needs_input", "unreadable link needs input");
pass("text imported; unreadable link kept and marked needs_input");

await alice("inspirations.addDetails", { params: { ...params, inspirationId: link.id }, body: { text: "The light museum" } });
saves = await waitForImports(trip.id);
assert(saves.find((s) => s.id === link.id)?.status !== "needs_input", "link recovered");
pass("link recovered after adding details");

let { places } = await alice("places.list", { params });
const branch = places.find((p) => p.status === "ambiguous");
assert(branch && branch.options.length > 1, "ambiguous branch present");
await alice("places.confirm", { params: { ...params, placeId: branch.id }, body: { providerPlaceId: branch.options[0]!.providerPlaceId } });
for (const place of places.filter((p) => p.status === "pending")) {
  await alice("places.confirm", { params: { ...params, placeId: place.id }, body: { providerPlaceId: place.options[0]!.providerPlaceId } });
}
({ places } = await alice("places.list", { params, query: { status: "confirmed" } }));
assert(places.length >= 4, "at least four confirmed places");
pass(`branch resolved; ${places.length} places confirmed`);

await alice("reservations.create", {
  params,
  body: { title: "Locked dinner", start: "2026-10-01T19:30", end: "2026-10-01T21:00", locked: true },
});
const { itinerary: v1 } = await alice("itinerary.generate", { params, body: { expectedVersion: null } });
const dinner = v1.days[0]!.stops.find((s) => s.kind === "reservation");
assert(dinner?.start === "19:30" && dinner.locked, "dinner fixed at 19:30");
pass(`itinerary v${v1.version} generated (${v1.validationStatus})`);

const movable = v1.days.flatMap((d) => d.stops).find((s) => s.kind === "place");
assert(movable, "a place stop exists");
const { itinerary: v2 } = await alice("itinerary.edit", {
  params,
  body: { expectedVersion: v1.version, edit: { type: "move_stop", stopId: movable.id, toDate: "2026-10-04", toIndex: 0 } },
});
assert(v2.version === v1.version + 1 && v2.days[3]!.stops[0]!.id === movable.id, "stop moved with same id");
pass(`stop moved to day 4 (v${v2.version})`);

await expectError(
  "STALE_VERSION",
  () => alice("itinerary.edit", { params, body: { expectedVersion: v1.version, edit: { type: "remove_stop", stopId: movable.id } } }),
  "stale edit",
);
pass("stale edit rejected");

const lockedStop = v2.days[0]!.stops.find((s) => s.kind === "reservation")!;
await expectError(
  "EDIT_REJECTED",
  () => alice("itinerary.edit", { params, body: { expectedVersion: v2.version, edit: { type: "move_stop", stopId: lockedStop.id, toDate: "2026-10-02", toIndex: 0 } } }),
  "move locked dinner",
);
pass("moving the locked dinner rejected");

const { itinerary: current } = await alice("itinerary.get", { params });
const { view: bobView } = { view: null };
void bobView;
const { share, token } = await alice("shares.create", { params });
const { view } = await visitor("shared.get", { params: { token } });
assert(view.itinerary?.version === current?.version, "viewer sees current version");
assert(!JSON.stringify(view).includes("sourceInspirationIds"), "no private source links in shared view");
pass("viewer sees the read-only projection");

await alice("shares.revoke", { params: { ...params, shareId: share.id } });
await expectError("SHARE_REVOKED", () => visitor("shared.get", { params: { token } }), "revoked share");
pass("revoked link rejected");

console.log(`All ${step} checks passed.`);

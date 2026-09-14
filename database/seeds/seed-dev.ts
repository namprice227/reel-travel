/**
 * Reset the local dev store and load SYNTHETIC demo data (fictional venues, example.test emails).
 *
 *   npm run seed
 *
 * alice@example.test  Tokyo trip: 15 saves (one unreadable link, one ambiguous branch, one unknown place),
 *                     confirmed places, a locked dinner and a generated itinerary.
 * bob@example.test    No trips. Sign in as Bob to check Alice's trip is not visible.
 *
 * Uses the same services as the API, so the data always matches the contracts.
 */
import fs from "node:fs";
import { config } from "../../apps/web/src/server/config";
import { runJob } from "../../apps/web/src/server/jobs/queue";
import { devSignIn } from "../../apps/web/src/server/services/auth";
import { createInspiration } from "../../apps/web/src/server/services/inspirations";
import { generateItinerary } from "../../apps/web/src/server/services/itinerary";
import { confirmPlace, listPlaces } from "../../apps/web/src/server/services/places";
import { createReservation, createTrip } from "../../apps/web/src/server/services/trips";

type Save = { sourceType: "text"; text: string } | { sourceType: "link"; url: string };

const SAVES: Save[] = [
  { sourceType: "text", text: "Sunrise at the Lantern Temple before the crowds, then Hoshi Coffee in Kiyosumi for a pour-over." },
  { sourceType: "text", text: "Kumo Ramen was the best bowl of my life!!" },
  { sourceType: "text", text: "Sky deck at sunset. Book tickets early." },
  { sourceType: "text", text: "Tsukiji morning market for breakfast sushi (closed Wednesdays apparently)" },
  { sourceType: "text", text: "The light museum in Toyosu, give it 2 hours at least" },
  { sourceType: "link", url: "https://www.instagram.com/reel/sample-shibuya-food-tour" },
  { sourceType: "text", text: "Memory Lane yakitori alley in Shinjuku at night" },
  { sourceType: "text", text: "Harajuku forest shrine walk, so peaceful" },
  { sourceType: "text", text: "Retro arcade in Akihabara, bring coins" },
  { sourceType: "text", text: "Botanical garden picnic (closed Mondays)" },
  { sourceType: "text", text: "Tower observatory for the night view" },
  { sourceType: "text", text: 'My friend swears by "Nowhere Bar" in Golden Gai' },
  { sourceType: "text", text: "Ueno garden park and the museums around it" },
  { sourceType: "text", text: "Odaiba seaside park for the bay view" },
  { sourceType: "text", text: "Scramble lookout above the Shibuya crossing" },
];

process.env.FAKE_AI_DELAY_MS = "0";

fs.rmSync(config.dataDir, { recursive: true, force: true });

const { user: alice } = await devSignIn({ email: "alice@example.test", displayName: "Alice" });
await devSignIn({ email: "bob@example.test", displayName: "Bob" });

const trip = await createTrip(alice, {
  title: "Tokyo long weekend (sample data)",
  destination: "Tokyo",
  timezone: "Asia/Tokyo",
  startDate: "2026-10-01",
  endDate: "2026-10-04",
});

for (const save of SAVES) {
  const { job } = await createInspiration(alice, trip.id, save);
  await runJob(job.id);
}

// Confirm the single matches; leave the ambiguous branch, the unknown place and the unreadable link for the demo.
for (const place of await listPlaces(alice, trip.id)) {
  if (place.status !== "pending") continue;
  await confirmPlace(alice, trip.id, place.id, { providerPlaceId: place.options[0]!.providerPlaceId }).catch(() => undefined);
}

await createReservation(alice, trip.id, {
  title: "Dinner at Ginza Sushi Counter (sample booking)",
  start: "2026-10-01T19:30",
  end: "2026-10-01T21:00",
  locked: true,
  placeId: null,
  note: null,
});

const itinerary = await generateItinerary(alice, trip.id, { expectedVersion: null });
const places = await listPlaces(alice, trip.id);
const count = (status: string) => places.filter((p) => p.status === status).length;

console.log(`Seeded ${config.dataDir}`);
console.log(`  alice@example.test  trip ${trip.id}: ${SAVES.length} saves, ${count("confirmed")} confirmed, ${count("ambiguous")} ambiguous, ${count("not_found")} not found`);
console.log(`  itinerary v${itinerary.version}: ${itinerary.validationStatus}, ${itinerary.conflicts.length} checks`);
console.log("  bob@example.test    no trips");
console.log(`Open http://localhost:3000/trips/${trip.id}/inbox after signing in as Alice.`);

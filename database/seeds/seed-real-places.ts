/**
 * One demo trip whose places are looked up through the CONFIGURED places provider, so the screens
 * show real matches, hours and photos instead of the fictional gazetteer:
 *
 *   npx tsx --env-file=apps/web/.env.local database/seeds/seed-real-places.ts
 *
 * Needs PLACES_PROVIDER=google and GOOGLE_PLACES_API_KEY in apps/web/.env.local. Each save below is
 * one Text Search (up to 3 pages), so this calls the billed API a handful of times per run.
 * Re-running skips the trip if it already exists. The extractor stays fake: it picks up the
 * "quoted names" and hands them to the provider.
 */
import { config } from "../../apps/web/src/server/config";
import { runJob } from "../../apps/web/src/server/jobs/queue";
import { devSignIn } from "../../apps/web/src/server/services/auth";
import { createInspiration } from "../../apps/web/src/server/services/inspirations";
import { generateItinerary } from "../../apps/web/src/server/services/itinerary";
import { confirmPlace, listPlaces } from "../../apps/web/src/server/services/places";
import { createTrip, listTrips, updateTrip } from "../../apps/web/src/server/services/trips";

const TITLE = "Tokyo with real places";
const SAVES = [
  'Queued 20 minutes for "Ichiran Shibuya" and it was worth it',
  'Booked "teamLab Planets TOKYO" for the morning slot',
  'Sunrise walk to "Senso-ji" before the shops open',
  'Sunset from "Shibuya Sky", book the last slot',
  'Breakfast sushi at "Tsukiji Outer Market"',
  'Quiet hour in "Meiji Jingu" after the crowds',
];

process.env.FAKE_AI_DELAY_MS = "0";
if (config.dataBackend !== "file" || config.isProduction) throw new Error("Seeding is only allowed in local file mode.");
if (config.placesProvider === "fake") {
  throw new Error("PLACES_PROVIDER is fake, so this would seed fixture venues. Run with --env-file=apps/web/.env.local.");
}

const DAY_MS = 86_400_000;
const isoDate = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

const email = (process.argv[2] ?? "alice@example.test").trim().toLowerCase();
const { user } = await devSignIn({ email, displayName: email.split("@")[0]! });
if ((await listTrips(user)).some((trip) => trip.title === TITLE)) {
  console.log(`"${TITLE}" already exists for ${email}; nothing to do.`);
  process.exit(0);
}

const trip = await createTrip(user, {
  title: TITLE,
  destination: "Tokyo",
  timezone: "Asia/Tokyo",
  startDate: isoDate(12),
  endDate: isoDate(15),
});
await updateTrip(user, trip.id, { preferences: { pace: "balanced", transport: "transit" } });

for (const text of SAVES) {
  const { job } = await createInspiration(user, trip.id, { sourceType: "text", text });
  await runJob(job.id);
}

// Take the provider's first match for each place, so there is something to plan with.
for (const place of await listPlaces(user, trip.id)) {
  if (place.status === "confirmed" || place.status === "rejected" || !place.options[0]) continue;
  await confirmPlace(user, trip.id, place.id, { providerPlaceId: place.options[0].providerPlaceId }).catch(() => undefined);
}

const places = await listPlaces(user, trip.id);
const withPhotos = places.filter((p) => (p.selected ?? p.options[0])?.details.photos.length).length;
const itinerary = await generateItinerary(user, trip.id, { expectedVersion: null });
console.log(`${TITLE}  ${trip.id}`);
console.log(`  ${places.length} places, ${withPhotos} with photos, itinerary v${itinerary.version} (${itinerary.validationStatus})`);
for (const place of places) console.log(`  ${place.status.padEnd(10)} ${place.name} → ${(place.selected ?? place.options[0])?.name ?? "no match"}`);

/**
 * Add SYNTHETIC demo trips to the local dev store WITHOUT resetting it, so the My trips screens
 * have a trip happening now, trips coming up, a draft and several past trips to show.
 *
 *   npm run seed:demo                  # alice@example.test
 *   npm run seed:demo -- bob@example.test
 *
 * Venues come from the fictional Tokyo gazetteer in packages/ai, so every trip has matched places,
 * a map and an itinerary. They are not real places, hours or prices; never demo them as real.
 * Re-running skips trips whose title already exists for that user.
 */
import { config } from "../../apps/web/src/server/config";
import { runJob } from "../../apps/web/src/server/jobs/queue";
import { devSignIn } from "../../apps/web/src/server/services/auth";
import { createInspiration } from "../../apps/web/src/server/services/inspirations";
import { generateItinerary } from "../../apps/web/src/server/services/itinerary";
import { confirmPlace, listPlaces } from "../../apps/web/src/server/services/places";
import { createReservation, createTrip, listTrips, updateTrip } from "../../apps/web/src/server/services/trips";
import type { TripPreferences } from "@reel/contracts";

type Save = string;

/** A demo trip. `offset` is days from today for the start date, so the set keeps its shape over time. */
interface DemoTrip {
  title: string;
  offset: number;
  nights: number;
  saves: Save[];
  /** Left as a draft (no itinerary) when false. */
  plan?: boolean;
  preferences?: Partial<TripPreferences>;
  booking?: { title: string; dayOffset: number; start: string; end: string };
}

const SAVES = {
  classics: [
    "Sunrise at the Lantern Temple before the crowds",
    "Sky deck at sunset, book tickets early",
    "Harajuku forest shrine walk, so peaceful",
    "Scramble lookout above the Shibuya crossing",
    "Tower observatory for the night view",
  ],
  food: [
    "Kumo Ramen was the best bowl of my life!!",
    "Memory Lane yakitori alley in Shinjuku at night",
    "Tsukiji morning market for breakfast sushi (closed Wednesdays apparently)",
    "Hoshi Coffee in Kiyosumi for a pour-over",
    "Ginza sushi counter, ten seats only",
  ],
  slow: [
    "Ueno garden park and the museums around it",
    "Shinjuku botanical garden picnic (closed Mondays)",
    "Odaiba seaside park for the bay view",
    "The light museum in Toyosu, give it 2 hours at least",
  ],
  play: [
    "Retro arcade in Akihabara, bring coins",
    "Kumo Ramen after the arcade",
    "Scramble lookout at night",
  ],
};

const TRIPS: DemoTrip[] = [
  {
    title: "Tokyo in autumn",
    offset: -2,
    nights: 4,
    saves: [...SAVES.classics, ...SAVES.food, ...SAVES.slow, ...SAVES.play.slice(0, 1)],
    plan: true,
    preferences: { pace: "balanced", accommodation: { name: "Kiyosumi guesthouse (synthetic)", location: { lat: 35.6809, lng: 139.7996 } } },
    booking: { title: "Dinner at Ginza Sushi Counter (sample booking)", dayOffset: 1, start: "19:30", end: "21:00" },
  },
  {
    title: "Four days with Mei",
    offset: 19,
    nights: 3,
    saves: [...SAVES.food, ...SAVES.play.slice(0, 2)],
    plan: true,
    preferences: { pace: "packed", transport: "walk", interests: ["food", "night markets"] },
  },
  {
    title: "New Year in Tokyo",
    offset: 99,
    nights: 5,
    saves: SAVES.classics.slice(0, 3),
    plan: false,
    preferences: { pace: "relaxed" },
  },
  {
    title: "Cherry blossom week",
    offset: -171,
    nights: 5,
    saves: [...SAVES.slow, ...SAVES.classics.slice(0, 2)],
    plan: true,
    preferences: { pace: "relaxed", transport: "walk" },
  },
  {
    title: "Winter food crawl",
    offset: -247,
    nights: 3,
    saves: SAVES.food,
    plan: true,
    preferences: { pace: "packed", budget: "medium" },
  },
  {
    title: "First time in Tokyo",
    offset: -317,
    nights: 5,
    saves: [...SAVES.classics, ...SAVES.slow.slice(0, 2)],
    plan: true,
    preferences: { pace: "balanced" },
  },
  {
    title: "Long weekend with mum and dad",
    offset: -485,
    nights: 3,
    saves: [...SAVES.slow.slice(0, 3), ...SAVES.food.slice(3)],
    plan: true,
    preferences: { pace: "relaxed", breakMinutes: 120 },
  },
];

process.env.FAKE_AI_DELAY_MS = "0";
if (config.dataBackend !== "file" || config.isProduction) throw new Error("Synthetic seeding is only allowed in local file mode.");

const email = (process.argv[2] ?? "alice@example.test").trim().toLowerCase();
const { user } = await devSignIn({ email, displayName: email.split("@")[0]! });
const existing = new Set((await listTrips(user)).map((trip) => trip.title));

const DAY_MS = 86_400_000;
const isoDate = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

for (const demo of TRIPS) {
  if (existing.has(demo.title)) {
    console.log(`  skipped  ${demo.title} (already there)`);
    continue;
  }
  const startDate = isoDate(demo.offset);
  const endDate = isoDate(demo.offset + demo.nights);
  const trip = await createTrip(user, { title: demo.title, destination: "Tokyo", timezone: "Asia/Tokyo", startDate, endDate });
  if (demo.preferences) await updateTrip(user, trip.id, { preferences: demo.preferences });

  for (const text of demo.saves) {
    const { job } = await createInspiration(user, trip.id, { sourceType: "text", text });
    await runJob(job.id);
  }

  // Confirm the single matches; ambiguous branches and unknown places stay for the demo.
  for (const place of await listPlaces(user, trip.id)) {
    if (place.status !== "pending") continue;
    await confirmPlace(user, trip.id, place.id, { providerPlaceId: place.options[0]!.providerPlaceId }).catch(() => undefined);
  }

  if (demo.booking) {
    const date = isoDate(demo.offset + demo.booking.dayOffset);
    await createReservation(user, trip.id, {
      title: demo.booking.title,
      start: `${date}T${demo.booking.start}`,
      end: `${date}T${demo.booking.end}`,
      locked: true,
      placeId: null,
      note: null,
    });
  }

  const places = await listPlaces(user, trip.id);
  const confirmed = places.filter((place) => place.status === "confirmed").length;
  if (demo.plan === false) {
    console.log(`  draft    ${demo.title}  ${startDate} → ${endDate}  ${places.length} places, no itinerary`);
    continue;
  }
  const itinerary = await generateItinerary(user, trip.id, { expectedVersion: null });
  const stops = itinerary.days.reduce((total, day) => total + day.stops.length, 0);
  console.log(`  planned  ${demo.title}  ${startDate} → ${endDate}  ${confirmed}/${places.length} confirmed, ${stops} stops, ${itinerary.validationStatus}`);
}

console.log(`Demo trips ready for ${email} in ${config.dataDir}. Sign in and open http://localhost:3000/my-trip`);

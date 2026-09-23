import { comparisonCases, type ComparisonCase } from "./comparison-cases";

// Regression set, not held-out: the first twelve cases have previously been evaluated.
export const currentCases: ComparisonCase[] = structuredClone(comparisonCases);
const rainy = structuredClone(currentCases.find(c => c.id === "summer-pace")!);
rainy.id = "rainy-afternoon";
rainy.description = "Synthetic dated afternoon rain: prefer the garden before rain and indoor art during it";
rainy.input.weather = [{ date: rainy.input.startDate, location: { lat: 35.68, lng: 139.76 },
  fetchedAt: "2027-08-08T00:00:00Z", hours: Array.from({length: 10}, (_,i) => ({time: `${String(9+i).padStart(2,"0")}:00`,
    apparentTemperature: 25, precipitationProbability: i < 4 ? 10 : 95, weatherCode: i < 4 ? 1 : 63})) }];
currentCases.push(rainy);
const hotel = structuredClone(currentCases.find(c => c.id === "three-day-clusters")!);
hotel.id = "changing-hotels";
hotel.description = "Use the correct hotel location for each date in a three-day trip";
hotel.input.preferences.accommodations = [
  { name: "Fictional west hotel", location: {lat:35.66,lng:139.70}, checkIn: hotel.input.startDate, checkOut: "2026-12-08" },
  { name: "Fictional east hotel", location: {lat:35.71,lng:139.80}, checkIn: "2026-12-08", checkOut: "2026-12-10" },
];
currentCases.push(hotel);

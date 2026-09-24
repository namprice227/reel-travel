// Supported trip countries. A trip stays in one country, so travel times stay realistic.

export interface Country {
  name: string;
  timezone: string;
  cities: string[];
}

export const SUPPORTED_COUNTRIES: Country[] = [
  { name: "Japan", timezone: "Asia/Tokyo", cities: ["Tokyo", "Kyoto", "Osaka"] },
  { name: "South Korea", timezone: "Asia/Seoul", cities: ["Seoul", "Busan"] },
  { name: "Thailand", timezone: "Asia/Bangkok", cities: ["Bangkok", "Chiang Mai"] },
  { name: "Singapore", timezone: "Asia/Singapore", cities: ["Singapore"] },
  { name: "Taiwan", timezone: "Asia/Taipei", cities: ["Taipei", "Tainan"] },
  { name: "United Kingdom", timezone: "Europe/London", cities: ["London", "Edinburgh"] },
  { name: "France", timezone: "Europe/Paris", cities: ["Paris", "Lyon"] },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Supported country for a source-named city or country; null when it is not a supported destination. */
export function supportedCountry(city: string | null, country: string | null): Country | null {
  return SUPPORTED_COUNTRIES.find((c) => (country && same(c.name, country)) || (city && c.cities.some((name) => same(name, city)))) ?? null;
}

/** Timezone for a source-named city or country; null when it is not a supported destination. */
export function supportedTimezone(city: string | null, country: string | null): string | null {
  return supportedCountry(city, country)?.timezone ?? null;
}

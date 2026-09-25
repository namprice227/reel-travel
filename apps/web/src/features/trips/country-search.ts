import { countryAliases, countryCodes, countryName, type CountryCode } from "@reel/contracts";

export type CountryChoice = { code: CountryCode; name: string; timezone: string | null; cities: string[] };

const preferredNames: Record<string, string> = { GB: "United Kingdom", KR: "South Korea", US: "United States", VN: "Vietnam" };

export const countryChoices: CountryChoice[] = countryCodes.map((code) => ({
  code: code as CountryCode,
  name: preferredNames[code] ?? countryName(code),
  timezone: null,
  cities: [],
}));

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en").trim();

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    }
    previous = row;
  }
  return previous[b.length]!;
}

function score(query: string, code: string, name: string): number {
  const values = [code, name, ...Object.entries(countryAliases).filter(([, candidate]) => candidate === code).map(([alias]) => alias)];
  return Math.min(...values.map((value) => {
    const candidate = normalize(value);
    if (query === candidate) return 0;
    if (candidate.startsWith(query)) return 1;
    if (candidate.split(/\W+/).some((word) => word.startsWith(query))) return 2;
    if (query.length >= 4 && candidate.includes(query)) return 3;
    if (query.length >= 4 && candidate[0] === query[0] && Math.abs(candidate.length - query.length) <= 2 && distance(query, candidate) <= 2) return 4;
    return 99;
  }));
}

export function searchCountries(query: string, limit = 10): CountryChoice[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  return countryChoices.map((country) => ({ country, rank: score(normalized, country.code, country.name) }))
    .filter(({ rank }) => rank < 99)
    .sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name))
    .slice(0, limit)
    .map(({ country }) => country);
}

export function destinationCountryCode(destination: string): CountryCode | null {
  const value = normalize(destination);
  return countryChoices.find((country) => value === normalize(country.name)
    || value.endsWith(`, ${normalize(country.name)}`))?.code ?? null;
}

import type { CSSProperties } from "react";
import { SUPPORTED_COUNTRIES } from "@reel/contracts";

// Decorative artwork only. Country identity comes from the saved source, never from these images.
const atlas = "/images/library/country-covers.png";
const single = (filename: string): CSSProperties => ({
  backgroundImage: `url('/images/library/${filename}')`,
  backgroundPosition: "center",
  backgroundSize: "cover",
});

const covers: Record<string, CSSProperties> = {
  JP: { backgroundImage: `url('${atlas}')`, backgroundPosition: "0% center", backgroundSize: "300% 100%" },
  KR: { backgroundImage: `url('${atlas}')`, backgroundPosition: "50% center", backgroundSize: "300% 100%" },
  TH: { backgroundImage: `url('${atlas}')`, backgroundPosition: "100% center", backgroundSize: "300% 100%" },
  SG: single("singapore.webp"),
  TW: single("taiwan.webp"),
  GB: single("united-kingdom.webp"),
  FR: single("france.webp"),
};

const other = single("other-country.webp");

export function hasDedicatedCountryCover(code: string): boolean {
  return Object.hasOwn(covers, code);
}

/** A known source country without dedicated artwork gets the neutral travel cover. */
export function countryCoverStyle(code: string): CSSProperties {
  return covers[code] ?? other;
}

const codeByName: Record<string, string> = {
  Japan: "JP", "South Korea": "KR", Thailand: "TH", Singapore: "SG",
  Taiwan: "TW", "United Kingdom": "GB", France: "FR",
};

export function tripCoverStyle(destination: string): CSSProperties {
  const parts = destination.split(",").map((part) => part.trim().toLocaleLowerCase("en"));
  const country = SUPPORTED_COUNTRIES.find((item) =>
    parts.includes(item.name.toLocaleLowerCase("en"))
    || item.cities.some((city) => parts.includes(city.toLocaleLowerCase("en"))));
  const code = country && codeByName[country.name];
  return code ? countryCoverStyle(code) : other;
}

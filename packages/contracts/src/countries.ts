import { z } from "zod";
import { named } from "./registry";

const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");
export const CountryCode = named(z.enum(COUNTRY_CODES as [string, ...string[]]), "CountryCode");
export type CountryCode = z.infer<typeof CountryCode>;
const names = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string): string => names.of(code) ?? code;
export const countryAliases: Record<string, string> = {
  usa: "US", "united states of america": "US", uk: "GB", "south korea": "KR", vietnam: "VN", turkey: "TR",
};
const words = (text: string) => ` ${text.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
/** Require an explicit country name in the cited source; a city or cuisine alone is insufficient. */
export function mentionsCountry(text: string, code: string): boolean {
  const aliases = Object.entries(countryAliases).filter(([, value]) => value === code).map(([key]) => key);
  return [countryName(code), ...aliases].some(name => words(text).includes(words(name)));
}
/** Convert only an explicit country name/code. City, cuisine and landmark knowledge are deliberately excluded. */
export function countryCodeFromName(value: string): CountryCode | null {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en");
  if (!normalized) return null;
  const alias = countryAliases[normalized];
  if (alias) return CountryCode.parse(alias);
  const code = COUNTRY_CODES.find((candidate) =>
    candidate.toLocaleLowerCase("en") === normalized || countryName(candidate).toLocaleLowerCase("en") === normalized,
  );
  return code ? CountryCode.parse(code) : null;
}
export const countryCodes: readonly string[] = COUNTRY_CODES;

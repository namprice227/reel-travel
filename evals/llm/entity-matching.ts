import { normalize } from "./schema";

export type NameMatch = "exact" | "review" | "none";
const suffixAbbreviations: Record<string, string> = {
  st: "street", rd: "road", ave: "avenue", av: "avenue", blvd: "boulevard",
  bldg: "building", sta: "station", stn: "station",
};
const types = new Set(["street", "road", "avenue", "boulevard", "statue", "building", "museum", "park", "station"]);
/** Positional expansion avoids interpreting initial St (Saint) as Street. */
export function normalizedEntityName(name: string): string {
  const words = normalize(name).split(" ");
  if (words.length > 1) {
    if (words[0] === "mt") words[0] = "mount";
    const last = words.length - 1;
    words[last] = suffixAbbreviations[words[last]] ?? words[last];
  }
  return words.join(" ");
}
function untyped(name: string): string {
  const words = name.split(" ");
  if (words.length > 1 && types.has(words[0])) words.shift();
  if (words.length > 1 && types.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}
/** Similarity can request review, never establish identity. No place-name dictionary. */
export function matchEntityName(left: string, right: string): NameMatch {
  const a = normalizedEntityName(left), b = normalizedEntityName(right);
  if (!a || !b) return "none";
  if (a === b) return "exact";
  const ac = untyped(a), bc = untyped(b);
  // Removing a type on one side is ambiguous; conflicting explicit types are not equivalent.
  if (ac === bc && (ac === a || bc === b) && !types.has(ac)) return "review";
  // Saint is ambiguous with Street; never expand initial St automatically.
  if (a.replace(/^st /, "saint ") === b || b.replace(/^st /, "saint ") === a) return "review";
  const aw = a.split(" "), bw = b.split(" ");
  if (aw.length !== bw.length || a.replace(/[^0-9]/g, "") !== b.replace(/[^0-9]/g, "")) return "none";
  const differences = aw.map((word, i) => [word, bw[i]]).filter(([x, y]) => x !== y);
  if (differences.length === 1) {
    const [x, y] = differences[0];
    if (Math.min(x.length, y.length) >= 5 && !types.has(x) && !types.has(y) && oneEdit(x, y)) return "review";
  }
  return "none";
}

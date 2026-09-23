import type { PlaceLookup } from "../../packages/ai/src/types";
import { normalize } from "./schema";
import { proposePlaces } from "./review-candidates";
import type { Ask, EvidenceArtifact, Labels } from "./youtube-review";

export type LookupApproval = {
  sourceName: string; queryContext: string; provider: "google";
  match: { name: string; address: string; placeId: string };
};
/** External suggestions never become extraction evidence or benchmark truth. */
export async function reviewLookups(artifact: EvidenceArtifact, labels: Labels, lookup: PlaceLookup,
  ask: Ask, show: (text: string) => void): Promise<LookupApproval[]> {
  const source = proposePlaces(artifact.evidence);
  const approved: LookupApproval[] = [];
  for (const label of labels.ground_truth ?? []) {
    if (label.location_context && label.google_place_id) continue;
    const own = source.filter(p => normalize(p.label.name) === normalize(label.name));
    // Only co-mentioned source names/context, never other lookup results or unrelated montage stops.
    const related = source.filter(p => normalize(p.label.name) !== normalize(label.name) &&
      p.evidence.some(e => own.some(o => o.evidence.some(s => s.source === e.source && s.quote === e.quote))));
    const context = [...new Set([...own.map(p => p.label.location_context),
      ...related.map(p => p.label.name)].filter((s): s is string => Boolean(s)))].slice(0, 3).join(" ");
    show("Google Maps lookup suggestions for " + JSON.stringify(label.name) +
      ": external matches only; not proof of the video's location.");
    let matches: LookupApproval["match"][];
    try {
      const results = await lookup.search({ query: label.name, hint: context || null,
        excerpt: own[0]?.evidence[0]?.quote.slice(0, 300) ?? label.name }, { destination: "" });
      const seen = new Set<string>();
      matches = results.filter(p => {
        const wanted = normalize(label.name).split(" ");
        const words = normalize(p.name).split(" ");
        const plausible = wanted.every(w => words.includes(w));
        if (!plausible || !p.address || seen.has(p.providerPlaceId)) return false;
        seen.add(p.providerPlaceId); return true;
      }).slice(0, 3).map(p => ({ name: p.name, address: p.address!, placeId: p.providerPlaceId }));
    } catch {
      show("Lookup unavailable; location remains unknown. No automatic retry."); continue;
    }
    if (!matches.length) { show("No sufficiently matching result; location remains unknown."); continue; }
    matches.forEach((m, i) => show("  [" + (i + 1) + "] " + JSON.stringify(m)));
    for (;;) {
      const answer = (await ask("Approve lookup match 1-" + matches.length + " (blank keeps unknown): ")).trim();
      if (!answer) break;
      if (!/^[1-3]$/.test(answer) || !matches[Number(answer) - 1]) { show("Invalid match number."); continue; }
      approved.push({ sourceName: label.name, queryContext: context, provider: "google", match: matches[Number(answer) - 1] });
      break;
    }
  }
  if (approved.length) show("Human-approved lookup information (separate from source ground truth):\n" + JSON.stringify(approved, null, 2));
  return approved;
}

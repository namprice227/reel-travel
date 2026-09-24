import { z } from "zod";
import type { VideoEvidenceOutput } from "../../packages/ai/src/reel-schema";
import { normalize, TruthSchema } from "./schema";

export type ReviewTruth = z.infer<typeof TruthSchema>;
export type Support = { source: string; timestamp: number | null; quote: string; uncertainties: string[] };
export type SuggestedPlace = {
  label: ReviewTruth; status: "proposed" | "uncertain";
  reasons: string[]; evidence: Support[];
};
const word = "[\\p{Lu}][\\p{L}\\p{N}'’\\-]*";
const proper = word + "(?:\\s+(?:(?:of|the|and)\\s+)?" + word + "){0,4}";
const endings = ["crossing", "tower", "temple", "shrine", "station", "park", "museum", "cafe", "café",
  "coffee", "ramen", "bakery", "garden", "gardens", "castle", "market", "bridge", "beach", "palace",
  "restaurant", "hotel", "aquarium", "zoo", "street", "avenue", "observatory", "skytree", "yokocho", "parco", "building", "mall", "shop", "store", "hills", "valley", "island", "islands", "region", "city", "district", "neighbourhood", "neighborhood"];
const suffix = "(?:" + endings.map(s => [...s].map(c => "[" + c.toUpperCase() + c + "]").join("")).join("|") + ")";
// Recognition vocabulary only: match literal source mentions, never infer nearby places or branches.
// Contextual names and typed entities below also support names outside this vocabulary.
const travelNames = ["Kabukicho", "Hachiko", "Asakusa", "Ueno", "Akihabara", "Tsukiji", "Ginza",
  "Odaiba", "teamLab", "Hakone", "Tokyo", "Kyoto", "Osaka", "Hokkaido", "Omotesando"];
const explicitTravelName = new RegExp("(?<![\\p{L}\\p{N}])(?:" + travelNames.join("|") + ")(?![\\p{L}\\p{N}])", "giu");
const generic = new Set(("a an the we i then next our this that these those multiple traditional japanese busy snowy snow covered high angle panoramic beautiful green red blue white black old new small large local famous stunning amazing street food hot spring coffee cafe restaurant hotel temple shrine park garden market river mountain landscape skyline sign exit entrance welcome open closed sale vision").split(" "));
// Country-level travel context is not a venue suggestion. No location is inferred from this list.
const regions = new Intl.DisplayNames(["en"], { type: "region" });
const countryNames = new Set<string>();
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b), name = regions.of(code);
  if (name && name !== code) countryNames.add(normalize(name));
}
for (const term of [...endings, "pedestrian", "crowded", "bustling", "illuminated", "intersection", "modern", "ancient", "commercial", "urban", "major", "downtown", "busy"]) generic.add(term);
function venueSignContext(description: string, visible: string, count: number) {
  // Advertising text identifies what is advertised, not necessarily a place in the scene.
  if (/\b(?:billboard|advertis\w*|poster|lineup|line-up|performer|festival|concert)\b/i.test(description)) return false;
  const venue = "(?:storefront|shopfront|entrance|facade|façade|restaurant|cafe|café|hotel|museum|bookstore|shop|store|building)";
  const contextual = new RegExp(venue + ".{0,45}(?:sign|named|called)|(?:sign|named|called).{0,45}" + venue, "i").test(description);
  return contextual && (count === 1 || normalize(description).includes(normalize(visible)));
}
const instruction = /ignore (?:all |previous )?instructions|ignore previous|(?:output|return|print) (?:only |the |a )?(?:json|disneyland)|system prompt/i;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
function nameAllowed(name: string) {
  const words = normalize(name).split(" ");
  return !/^(?:day\s*\d+|plan in\b|see captions?\b|choose one\b|swipe\b|subscribe\b|follow\b|click\b)/i.test(name) && !countryNames.has(normalize(name)) && name.length <= 120 && words.length > 0 && !words.every(w => generic.has(w)) &&
    !["a", "an", "the", "we", "i", "then", "this", "our", "crowded", "busy", "scenic", "narrow", "beautiful", "panoramic"].includes(words[0]);
}
const titleSuffix = clean; // Preserve source identity; no removal/addition of name words.
function locationFor(name: string, quote: string): string | null {
  // Nearby explicit context only; no geographic dictionary or inference from a landmark's real address.
  const start = quote.toLowerCase().indexOf(name.toLowerCase());
  const tail = start < 0 ? quote : quote.slice(start + name.length);
  const explicit = new RegExp("^\\s+(?:in|near|within)\\s+(" + proper + ")", "u").exec(tail)?.[1];
  if (explicit && nameAllowed(explicit) && explicit.length <= 60) return explicit;
  const skyline = new RegExp("(" + word + ") skyline", "u").exec(quote)?.[1];
  if (skyline && name.startsWith(skyline + " ")) return skyline;
  // 'Shibuya crossing' supplies Shibuya directly as the crossing's textual qualifier.
  if (/ crossing$/i.test(name)) return name.replace(/ crossing$/i, "").slice(0, 60);
  return null;
}
/** Deterministic review aids only. Does not verify places or use fictional venue fixtures. */
export function proposePlaces(evidence: VideoEvidenceOutput): SuggestedPlace[] {
  const found: SuggestedPlace[] = [];
  const ocrSpelling = new Map<string, string>();
  function add(name: string, support: Support, reason?: string) {
    const sourceName = clean(name);
    name = titleSuffix(sourceName);
    if (!nameAllowed(name)) return;
    const label = TruthSchema.safeParse({ name, location_context: locationFor(name, support.quote), aliases: normalize(sourceName) === normalize(name) ? [] : [sourceName] });
    if (!label.success) return;
    const reasons = [...(reason ? [reason] : []), ...support.uncertainties];
    if (/\b(?:possibly|perhaps|maybe|might|unclear|unidentified|unknown|unreadable)\b/i.test(support.quote))
      reasons.push("Source expresses uncertainty");
    const status = reasons.length ? "uncertain" : "proposed";
    if (!label.data.location_context) reasons.push("Location/branch not supplied; identity retained without guessing");
    found.push({ label: label.data, status, reasons, evidence: [support] });
  }
  function scan(quote: string, support: Support) {
    if (instruction.test(quote)) return;
    const matched = new Set<string>();
    const spans: Array<[number, number]> = [];
    const namedText = quote.replace(new RegExp("(" + suffix + ")\\s+and\\s+(?=\\p{Lu})", "gu"), "$1; ");
    for (const pattern of [
      new RegExp("(" + proper + "\\s+(?:(?:pedestrian|scramble)\\s+)?" + suffix + ")(?![\\p{L}\\p{N}])", "gu"),
      new RegExp("((?:[Mm][Oo][Uu][Nn][Tt]|[Mm][Tt]\\.?|[Ll][Aa][Kk][Ee])\\s+" + proper + ")", "gu"),
    ]) {
      for (const m of namedText.matchAll(pattern)) {
        add(m[1], support);
        matched.add(normalize(m[1]));
        spans.push([m.index!, m.index! + m[0].length]);
      }
    }
    for (const m of namedText.matchAll(explicitTravelName)) {
      if (!spans.some(([start, end]) => m.index! >= start && m.index! < end)) {
        add(m[0], support);
        matched.add(normalize(m[0]));
      }
    }
    // Bare proper names after explicit travel verbs are useful but require individual review.
    const visits = new RegExp("(?:visited|visiting|went to|stopped at|arrived at|explored|visit|city of|island of|district of|neighborhood of|neighbourhood of|in|near)\\s+(" + proper + ")", "gu");
    for (const m of namedText.matchAll(visits)) {
      if (![...matched].some(n => n === normalize(m[1]) || n.startsWith(normalize(m[1]) + " ")))
        add(m[1], support, "Name near a visit phrase; identity requires review");
    }
  }
  const sentences = evidence.audio.transcript.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  for (const quote of sentences) scan(quote, { source: "audio", timestamp: null, quote, uncertainties: evidence.uncertainties });
  evidence.visual_observations.forEach((observation, index) => {
    const uncertainties = [...evidence.uncertainties, ...observation.uncertainties];
    const support = (quote: string): Support => ({ source: "visual_" + (index + 1),
      timestamp: observation.timestamp_seconds, quote, uncertainties });
    // Descriptions support explicit source names; they never seed entities.
    for (const visible of observation.visible_text) {
      if (instruction.test(visible)) continue;
      const name = clean(visible);
      if (!nameAllowed(name)) continue;
      const corroborated = found.some(p => normalize(p.label.name) === normalize(name));
      const advertising = /\b(?:billboard|advertis\w*|poster|lineup|line-up|performer|festival|concert)\b/i.test(observation.description);
      const namedPlace = new RegExp("^" + proper + "\\s+" + suffix + "$", "iu").test(name) ||
        /^(?:mount|mt\.?|lake)\s+\p{L}[\p{L}\s'-]+$/iu.test(name);
      const districtLabel = /\b(?:district|neighbou?rhood|location caption|area label|city label|region label)\b/i.test(observation.description) &&
        (observation.visible_text.length === 1 || normalize(observation.description).includes(normalize(name)));
      const recognized = travelNames.some(term => normalize(term) === normalize(name));
      const contextual = venueSignContext(observation.description, name, observation.visible_text.length) || districtLabel;
      if (corroborated || (!advertising && (namedPlace || recognized || contextual) && name.length <= 120 &&
        name.split(/\s+/).length <= 8 && /^[\p{L}\p{N}][\p{L}\p{N}\s&'’.-]*$/u.test(name))) {
        ocrSpelling.set(normalize(name), ocrSpelling.get(normalize(name)) ?? name);
        add(name, support(visible), namedPlace || corroborated ? undefined : "Explicit visible name; verify identity and OCR spelling");
      }
    }
  });
  // A second pass attaches descriptions only to independently named OCR/speech candidates.
  for (const p of found) evidence.visual_observations.forEach((observation, index) => {
    const description = normalize(observation.description), name = normalize(p.label.name);
    if (!(" " + description + " ").includes(" " + name + " ")) return;
    const support: Support = { source: "visual_" + (index + 1), timestamp: observation.timestamp_seconds,
      quote: observation.description, uncertainties: [...evidence.uncertainties, ...observation.uncertainties] };
    if (!p.evidence.some(e => JSON.stringify(e) === JSON.stringify(support))) p.evidence.push(support);
    if (!p.label.location_context) p.label.location_context = locationFor(p.label.name, observation.description);
    if (/\b(?:possibly|perhaps|maybe|might|unclear|unidentified|unknown|unreadable)\b/i.test(observation.description)) {
      p.status = "uncertain"; p.reasons.push("Supporting description expresses uncertainty");
    }
    if (support.uncertainties.length) {
      p.status = "uncertain"; p.reasons.push(...support.uncertainties);
    }
  });
  // Merge unknown context only when there is one explicit context for this name.
  const locations = new Map<string, Set<string>>();
  for (const p of found) if (p.label.location_context) {
    const key = normalize(p.label.name);
    locations.set(key, new Set([...(locations.get(key) ?? []), p.label.location_context]));
  }
  const merged = new Map<string, SuggestedPlace>();
  for (const p of found) {
    const contexts = [...(locations.get(normalize(p.label.name)) ?? [])];
    const distinct = [...new Set(contexts.map(normalize))];
    if (!p.label.location_context && distinct.length === 1) p.label.location_context = contexts[0];
    if (!p.label.location_context && distinct.length > 1) {
      p.status = "uncertain"; p.reasons.push("Repeated name with multiple explicit locations");
    }
    const key = normalize(p.label.name) + "|" + normalize(p.label.location_context);
    const previous = merged.get(key);
    if (!previous) merged.set(key, p);
    else {
      previous.label.aliases = [...new Set([...previous.label.aliases, ...p.label.aliases])];
      previous.evidence.push(...p.evidence.filter(e => !previous.evidence.some(old => JSON.stringify(old) === JSON.stringify(e))));
      previous.reasons = [...new Set([...previous.reasons, ...p.reasons])];
      if (p.status === "uncertain") previous.status = "uncertain";
    }
  }
  return [...merged.values()].map(p => ({ ...p, label: { ...p.label, name: ocrSpelling.get(normalize(p.label.name)) ?? p.label.name },
    reasons: [...new Set(p.reasons)].filter(reason => !p.label.location_context || reason !== "Location/branch not supplied; identity retained without guessing"),
    evidence: p.evidence.sort((a, b) => (a.timestamp ?? -1) - (b.timestamp ?? -1)) }));
}

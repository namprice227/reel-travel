import { fixturePlaces, type FixturePlace } from "./gazetteer";
import type { ExtractionInput, ExtractionResult, Extractor, PlaceClue } from "./types";

const SOCIAL_HOSTS = [
  "instagram.com",
  "tiktok.com",
  "xiaohongshu.com",
  "xhslink.com",
  "facebook.com",
  "youtube.com",
  "youtu.be",
];

/** Marker for exercising retries and failure UI. Ignored once the traveler adds details. */
export const FAKE_FAILURE_MARKER = "[[fail]]";

/**
 * Stand-in for the real extractor (task B02). Deterministic, offline, never fetches URLs.
 * - text: matches fixture venue names/aliases; "quoted names" that match nothing become not-found clues
 * - link / screenshot: can't be read, so returns needs_input unless a note or details were given
 */
export function createFakeExtractor(options: { delayMs?: number } = {}): Extractor {
  return {
    async extract(input) {
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      return extractFromFixtures(input);
    },
  };
}

export function extractFromFixtures(input: ExtractionInput): ExtractionResult {
  const extra = [input.note, input.details].filter(Boolean).join("\n");
  let text: string;

  if (input.sourceType === "text") {
    text = [input.text, extra].filter(Boolean).join("\n");
  } else if (input.sourceType === "link") {
    if (!extra) {
      const host = hostOf(input.url);
      const social = SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
      return {
        status: "needs_input",
        failureCode: "SOURCE_INACCESSIBLE",
        message: social
          ? `Posts on ${host} can't be read automatically. Add the place names or paste the caption.`
          : "This link couldn't be read. Add the place names or paste the text.",
      };
    }
    text = `${extra}\n${slugWords(input.url)}`;
  } else {
    if (!extra) {
      return {
        status: "needs_input",
        failureCode: "IMAGE_UNREADABLE",
        message: "Couldn't read place names from this screenshot. Type the names you can see.",
      };
    }
    text = extra;
  }

  if (!input.details && text.includes(FAKE_FAILURE_MARKER)) {
    throw new Error("Simulated extraction failure (fixture marker)");
  }

  const clues = findClues(text);
  if (clues.length === 0) {
    return {
      status: "needs_input",
      failureCode: "NO_PLACES_FOUND",
      message: "No places recognised. Add the place name.",
    };
  }
  return { status: "ok", clues };
}

function findClues(text: string): PlaceClue[] {
  const lower = text.toLowerCase();
  const found: Array<PlaceClue & { at: number }> = [];

  const groups = new Map<string, FixturePlace[]>();
  for (const place of fixturePlaces) groups.set(place.group, [...(groups.get(place.group) ?? []), place]);

  for (const [group, members] of groups) {
    const phrases = new Set(members.flatMap((m) => [m.group.toLowerCase(), m.name.toLowerCase(), ...m.aliases]));
    let at = -1;
    let length = 0;
    for (const phrase of phrases) {
      const index = lower.indexOf(phrase);
      if (index !== -1 && (at === -1 || index < at)) {
        at = index;
        length = phrase.length;
      }
    }
    if (at === -1) continue;
    const nearby = lower.slice(Math.max(0, at - 40), at + length + 40);
    const hint = members.flatMap((m) => m.branchHints).find((h) => nearby.includes(h)) ?? null;
    found.push({ query: group, hint, excerpt: excerptAround(text, at, length), at });
  }

  for (const match of text.matchAll(/"([^"\n]{3,60})"/g)) {
    const query = match[1]!.trim();
    const q = query.toLowerCase();
    if (found.some((c) => q.includes(c.query.toLowerCase()) || c.query.toLowerCase().includes(q))) continue;
    found.push({ query, hint: null, excerpt: excerptAround(text, match.index ?? 0, match[0].length), at: match.index ?? 0 });
  }

  return found.sort((a, b) => a.at - b.at).map(({ at: _at, ...clue }) => clue);
}

function excerptAround(text: string, at: number, length: number): string {
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + length + 60);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function slugWords(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[-_/]+/g, " ");
  } catch {
    return "";
  }
}

import { describe, expect, it } from "vitest";
import { ClueListSchema, extractFromFixtures, lookupFixtures } from "./index";

const text = (value: string, details: string | null = null) =>
  ({ sourceType: "text", text: value, note: null, details }) as const;

describe("fake extractor", () => {
  it("finds fixture places in order with excerpts and branch hints", () => {
    const result = extractFromFixtures(text("Kumo Ramen near Shibuya station, then the sky deck at sunset"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.clues.map((c) => c.query)).toEqual(["Kumo Ramen", "Sumida Sky Deck"]);
    expect(result.clues[0]!.hint).toBe("shibuya");
    expect(result.clues[0]!.excerpt).toContain("Kumo Ramen");
    expect(ClueListSchema.safeParse({ clues: result.clues }).success).toBe(true);
  });

  it("turns unknown quoted names into clues that look up to nothing", () => {
    const result = extractFromFixtures(text('Friends loved "Nowhere Bar"'));
    expect(result).toMatchObject({ status: "ok", clues: [{ query: "Nowhere Bar" }] });
    expect(lookupFixtures({ query: "Nowhere Bar", hint: null, excerpt: null })).toEqual([]);
  });

  it("asks for input when a social link can't be read, and recovers with details", () => {
    const link = { sourceType: "link", url: "https://www.instagram.com/reel/abc", note: null } as const;
    expect(extractFromFixtures({ ...link, details: null })).toMatchObject({
      status: "needs_input",
      failureCode: "SOURCE_INACCESSIBLE",
    });
    expect(extractFromFixtures({ ...link, details: "It was the Light Museum" })).toMatchObject({ status: "ok" });
  });

  it("simulates a failure until details are added", () => {
    expect(() => extractFromFixtures(text("sky deck [[fail]]"))).toThrow();
    expect(extractFromFixtures(text("sky deck [[fail]]", "sky deck"))).toMatchObject({ status: "ok" });
  });
});

describe("fake lookup", () => {
  it("keeps branches ambiguous unless a hint narrows them", () => {
    expect(lookupFixtures({ query: "Kumo Ramen", hint: null, excerpt: null })).toHaveLength(2);
    expect(lookupFixtures({ query: "Kumo Ramen", hint: "shinjuku", excerpt: null })).toHaveLength(1);
  });

  it("marks unknown provider fields instead of guessing", () => {
    const [shrine] = lookupFixtures({ query: "Harajuku Forest Shrine", hint: null, excerpt: null });
    expect(shrine!.details.openingHours).toEqual({ status: "unknown" });
    expect(shrine!.details.unknownFields).toContain("openingHours");
  });
});

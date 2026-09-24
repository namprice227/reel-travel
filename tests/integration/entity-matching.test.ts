import { describe, expect, it } from "vitest";
import { matchEntityName } from "../../evals/llm/entity-matching";
import { CaseSchema, type Prediction } from "../../evals/llm/schema";
import { score } from "../../evals/llm/metrics";
const data = (name: string, aliases: string[] = [], location_context: string | null = null) =>
  CaseSchema.parse({ id: "matching", synthetic: true, transcript: "An explicit source quotation.", ground_truth: [{ name, aliases, location_context }] });
const prediction = (name: string, location_context: string | null = null): Prediction =>
  ({ name, location_context, evidence: "An explicit source quotation.", confidence: 1 });
describe("general entity matching", () => {
  it.each([["MT FUJI", "Mount Fuji"], ["Mt. Silver", "Mount Silver"],
    ["TOKYO SKYTREE", "Tokyo Skytree"], [" Cedar?Museum! ", "cedar museum"],
    ["Cedar St.", "Cedar Street"], ["Cedar Bldg", "Cedar Building"], ["Cedar Stn", "Cedar Station"]])(
    "automatically matches safe normalization: %s / %s", (a, b) => {
      expect(matchEntityName(a, b)).toBe("exact");
      expect(score(data(a), [prediction(b)]).tp).toBe(1);
    });
  it.each([["HACHIKO", "Hachiko Statue"], ["Cedar", "Cedar Museum"], ["Museum Cedar", "Cedar"],
    ["Cedar", "Cedar Station"], ["Cedar", "Cedar Park"], ["Cedar", "Cedar Street"],
    ["Cedar", "Cedar Building"], ["Silverwood Museum", "Silverwod Museum"], ["St Mary", "Saint Mary"]])(
    "routes uncertain variants to review: %s / %s", (a, b) => {
      expect(matchEntityName(a, b)).toBe("review");
      expect(matchEntityName(b, a)).toBe("review");
      const result = score(data(a), [prediction(b)]);
      expect(result).toMatchObject({ tp: 0, unsupported: 0, predicted: 1 });
      expect(result.manualReview).toHaveLength(1);
    });
  it.each([["Cedar Park", "Cedar Station"], ["Cedar Museum", "Cedar Building"],
    ["Tower 1", "Tower 2"], ["Ueno", "Ueda"], ["Cedar", "Cedar East"], ["Museum", "Park"]])(
    "rejects conflicting types, branches and weak similarity: %s / %s", (a, b) => {
      expect(score(data(a), [prediction(b)])).toMatchObject({ tp: 0, unsupported: 1 });
    });
  it("lets explicit human aliases establish equivalence and deduplicates safe variants", () => {
    expect(score(data("Cedar", ["Cedar Statue"]), [prediction("Cedar Statue")]).tp).toBe(1);
    expect(score(data("Mount Silver"), [prediction("Mt. Silver"), prediction("Mount Silver")]))
      .toMatchObject({ tp: 1, predicted: 1, duplicateCount: 1 });
  });
  it("keeps hallucination checks strict for invented evidence and wrong locations", () => {
    expect(score(data("Cedar"), [{ ...prediction("Cedar Statue"), evidence: "invented" }]).unsupported).toBe(1);
    expect(score(data("Cedar", [], "East"), [prediction("Cedar Statue", "West")]).unsupported).toBe(1);
    expect(score(data("Mt Silver", [], "East"), [prediction("Mount Silver")])).toMatchObject({ tp: 1, audit: { branchResolution: { eligible: 1, correct: 0 } } });
  });
  it("does not guess between shared aliases or suffix candidates", () => {
    const c = data("Cedar Museum", ["Cedar"]);
    c.ground_truth.push({ ...c.ground_truth[0], name: "Cedar Park" });
    expect(score(c, [prediction("Cedar")])).toMatchObject({ tp: 0, unsupported: 0 });
    expect(score(c, [prediction("Cedar")]).manualReview).toHaveLength(1);
    expect(score(c, [prediction("Cedar Museum")]).matched[0].truthIndex).toBe(0);
  });
});

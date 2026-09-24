import { describe, expect, it, vi } from "vitest";
import type { PlaceLookup } from "../../packages/ai/src/types";
import { reviewLookups } from "../../evals/llm/review-lookup";
import { EvidenceArtifactSchema, confirmReview, newLabels, reviewHash } from "../../evals/llm/youtube-review";
const artifact = EvidenceArtifactSchema.parse({ version: 1,
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", model: "mock", promptVersion: "test",
  capturedAt: "2026-09-22T00:00:00.000Z", latencyMs: 0,
  evidence: { status: "ok", audio: { transcript: "Hoshi Coffee in Ginza. Kyoto is later.", language: "English" },
    visual_observations: [], uncertainties: [] } });
const labels = () => ({ ...newLabels(), ground_truth: [{ name: "Hoshi Coffee", location_context: null, aliases: [], location_aliases: [] }] });
// Minimal provider test doubles: these fields are the only ones consumed by review tooling.
const option = (name: string, id: string, address: string | null = "Example address") =>
  ({ name, providerPlaceId: id, address } as Awaited<ReturnType<PlaceLookup["search"]>>[number]);
describe("external review suggestions", () => {
  it("uses source context and caps deduplicated plausible matches at three without modifying truth", async () => {
    const search = vi.fn(async () => [option("Unrelated", "x"), option("Hoshi Coffee", "1"),
      option("Hoshi Coffee", "1"), option("Hoshi Coffee East", "2"), option("Hoshi Coffee West", "3"), option("Hoshi Coffee South", "4")]);
    const draft = labels(), before = reviewHash(artifact, draft), show = vi.fn();
    const approved = await reviewLookups(artifact, draft, { search }, async () => "2", show);
    expect(search.mock.calls[0]).toEqual([{ query: "Hoshi Coffee", hint: "Ginza", excerpt: "Hoshi Coffee in Ginza." }, { destination: "" }]);
    expect(approved[0].match.placeId).toBe("2");
    expect(show.mock.calls.filter(([text]) => text.startsWith("  ["))).toHaveLength(3);
    expect(reviewHash(artifact, draft)).toBe(before);
    expect(draft.ground_truth[0].location_context).toBeNull();
  });
  it("requires an explicit valid selection and allows leaving unknown", async () => {
    const ask = vi.fn().mockResolvedValueOnce("A").mockResolvedValueOnce("4").mockResolvedValueOnce("");
    expect(await reviewLookups(artifact, labels(), { search: async () => [option("Hoshi Coffee", "1")] }, ask, () => {})).toEqual([]);
    expect(ask).toHaveBeenCalledTimes(3);
  });
  it("keeps unknown on unrelated results, missing addresses and provider failures", async () => {
    const ask = vi.fn();
    for (const search of [async () => [option("Other Cafe", "1"), option("Hoshi Coffee", "2", null)],
      async () => { throw Error("secret provider error"); }]) {
      const show = vi.fn();
      expect(await reviewLookups(artifact, labels(), { search }, ask, show)).toEqual([]);
      expect(JSON.stringify(show.mock.calls)).not.toContain("secret provider error");
    }
    expect(ask).not.toHaveBeenCalled();
  });
  it("skips resolved locations and still requires final reviewer attestation", async () => {
    const search = vi.fn(async () => []);
    const draft = { ...labels(), ground_truth: [{ ...labels().ground_truth[0], location_context: "Ginza", google_place_id: "id" }] };
    await reviewLookups(artifact, draft, { search }, vi.fn(), vi.fn());
    expect(search).not.toHaveBeenCalled();
    expect(() => confirmReview(artifact, labels(), "Reviewer", "yes")).toThrow("not confirmed");
  });
});

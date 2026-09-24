import { proposePlaces } from "./review-candidates";
import { z } from "zod";
import { VideoEvidenceOutputSchema, normalizeVideoEvidence, evidenceSources } from "../../packages/ai/src/reel-schema";
import { normalizeYouTubeUrl } from "../../packages/ai/src/youtube";
import { DatasetSchema, TruthSchema, hash, normalize, type Dataset } from "./schema";

export class ReviewError extends Error {}
export const EvidenceArtifactSchema = z.strictObject({
  version: z.literal(1), sourceUrl: z.string().refine(url => normalizeYouTubeUrl(url) === url),
  model: z.string().min(1), promptVersion: z.string().min(1), capturedAt: z.iso.datetime(),
  latencyMs: z.number().nonnegative(),
  evidence: VideoEvidenceOutputSchema.refine(e => e.status === "ok"),
});
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;
export const LabelsSchema = z.strictObject({
  version: z.literal(1),
  ground_truth: z.array(TruthSchema).max(50).nullable(),
  human_reviewed: z.boolean(),
  reviewer: z.string().trim().min(1).max(100).nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewHash: z.string().nullable(),
});
export type Labels = z.infer<typeof LabelsSchema>;
export const newLabels = (): Labels => ({
  version: 1, ground_truth: null, human_reviewed: false, reviewer: null, reviewedAt: null, reviewHash: null,
});
export function reviewHash(artifact: EvidenceArtifact, labels: Labels) {
  return hash({ artifact: EvidenceArtifactSchema.parse(artifact), ground_truth: LabelsSchema.parse(labels).ground_truth });
}
export function datasetFor(artifact: EvidenceArtifact, labels: Labels): Dataset {
  if (labels.ground_truth === null) throw new ReviewError("Labels are incomplete. Enter ground_truth or explicitly confirm no places.");
  const evidence = normalizeVideoEvidence(artifact.evidence);
  return DatasetSchema.parse({
    description: "Human-labelled YouTube extraction evaluation; Gemini evidence is model-generated and may omit video content.",
    split: "development",
    cases: [{
      id: "youtube-" + new URL(artifact.sourceUrl).searchParams.get("v"),
      synthetic: false, category: "youtube-human-labelled",
      transcript: evidence.audio.transcript,
      visual_observations: [...evidenceSources(evidence)].filter(([id]) => id !== "audio").map(([, text]) => text),
      ground_truth: labels.ground_truth,
    }],
  });
}
export function confirmReview(artifact: EvidenceArtifact, labels: Labels, reviewer: string, confirmation: string): Labels {
  datasetFor(artifact, labels); // Includes duplicate-entity and field validation.
  const required = labels.ground_truth!.length ? "REVIEWED" : "CONFIRM EMPTY";
  if (confirmation !== required) throw new ReviewError("Review not confirmed; no benchmark was started.");
  return LabelsSchema.parse({ ...labels, human_reviewed: true, reviewer,
    reviewedAt: new Date().toISOString(), reviewHash: reviewHash(artifact, labels) });
}
export function requireReview(artifact: EvidenceArtifact, labels: Labels): Dataset {
  if (!labels.human_reviewed || !labels.reviewer || !labels.reviewedAt ||
      labels.reviewHash !== reviewHash(artifact, labels))
    throw new ReviewError("Human review is missing or stale. Run --review before benchmarking.");
  return datasetFor(artifact, labels);
}
export type Ask = (question: string) => Promise<string>;
/** Offline suggestions are review aids, never accepted labels until the user confirms. */
export async function labelInteractively(artifact: EvidenceArtifact, original: Labels, ask: Ask,
  show: (text: string) => void, reviewExternal?: (labels: Labels) => Promise<void>): Promise<Labels> {
  type Entry = { label: z.infer<typeof TruthSchema>; status: "proposed" | "uncertain" | "approved";
    evidence: ReturnType<typeof proposePlaces>[number]["evidence"]; reasons: string[] };
  const labels = structuredClone(original);
  const suggestions = proposePlaces(artifact.evidence);
  const entries: Entry[] = original.ground_truth === null ? structuredClone(suggestions) :
    original.ground_truth.map(label => ({ label: structuredClone(label), status: "proposed",
      evidence: suggestions.filter(p => normalize(p.label.name) === normalize(label.name)).flatMap(p => p.evidence),
      reasons: ["Existing manually entered label; retained without replacement"] }));
  show("Watch the source video and check the saved evidence. Label intentionally presented or recommended travel places; exclude incidental map/background labels. Review independently of comparator outputs.");
  // Display the original evidence once; JSON escaping prevents terminal control sequences.
  show(JSON.stringify({ sourceUrl: artifact.sourceUrl, evidence: artifact.evidence }, null, 2));
  show("Offline suggestions only: inspect the video and evidence before confirming ground truth.");
  show("Names are source spellings. Generic scenery is excluded; inspect sign text and uncertain evidence before approving.");
  const display = () => {
    show("Proposed ground truth:");
    entries.forEach((entry, i) => {
      const refs = [...new Set(entry.evidence.map(e => e.timestamp === null ? "speech" : e.timestamp + "s"))];
      show("[" + (i + 1) + "] " + JSON.stringify(entry.label.name) + "\n  Location: " +
        JSON.stringify(entry.label.location_context ?? "unknown") + "\n  Evidence: " + (refs.join(", ") || "manual") +
        "\n  Status: " + entry.status);
      if (entry.reasons.length) show("  Notes: " + JSON.stringify(entry.reasons));
    });
    if (!entries.length) show("(empty list; use N to add missing places, or F to confirm no supported places)");
  };
  async function edit(index?: number) {
    const old = index === undefined ? undefined : entries[index];
    const name = (await ask(old ? "Name (blank keeps current): " : "New place name (blank cancels): ")).trim();
    if (!old && !name) return;
    const location = (await ask(old ? "Location (blank keeps current; - clears): " : "Location (blank if unknown): ")).trim();
    const aliases = (await ask(old ? "Aliases separated by | (blank keeps current; - clears): " : "Aliases separated by | (blank if none): ")).trim();
    const parsed = TruthSchema.safeParse({
      ...(old?.label ?? {}),
      name: name || old!.label.name,
      location_context: old && !location ? old.label.location_context : location === "-" || !location ? null : location,
      location_aliases: old && !location ? old.label.location_aliases : [],
      aliases: old && !aliases ? old.label.aliases : aliases === "-" || !aliases ? [] : aliases.split("|").map(s => s.trim()).filter(Boolean),
    });
    if (!parsed.success) { show("Invalid label: check name/location/alias lengths. Entry was not changed."); return; }
    const entry: Entry = { label: parsed.data, status: "approved", evidence: old?.evidence ?? [], reasons: ["Manually added or edited"] };
    if (index === undefined) entries.push(entry); else entries[index] = entry;
  }
  function ready() {
    if (entries.some(e => e.status !== "approved")) {
      show("Some entries still need a decision. A approves all entries; R or E reviews individual entries; D removes them.");
      return false;
    }
    labels.ground_truth = entries.map(e => e.label);
    try { datasetFor(artifact, labels); return true; }
    catch { show("Labels failed validation: check duplicate names/locations or the 50-place limit. Edit/delete entries before finishing."); return false; }
  }
  for (;;) {
    display();
    const command = (await ask("A approve all | R review individually | D # delete | E # edit | N add | V # evidence | F finish | Q cancel: ")).trim();
    const [action, number] = command.toUpperCase().split(/\s+/);
    if (action === "Q") throw new ReviewError("Review cancelled; labels were not changed.");
    if (action === "A") {
      for (const entry of entries) entry.status = "approved";
      if (ready()) break;
    } else if (action === "F") {
      if (ready()) break;
    } else if (action === "N") await edit();
    else if (["D", "E", "V"].includes(action)) {
      const index = Number(number ?? (await ask("Entry number: ")).trim()) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= entries.length) { show("Invalid entry number."); continue; }
      if (action === "D") entries.splice(index, 1);
      else if (action === "E") await edit(index);
      else show(JSON.stringify(entries[index].evidence, null, 2));
    } else if (action === "R") {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        show("[" + (i + 1) + "] " + JSON.stringify(entry.label) + " (" + entry.status + ")");
        show(JSON.stringify(entry.evidence, null, 2));
        const choice = (await ask("A approve this entry | E edit | D delete | S skip: ")).trim().toUpperCase();
        if (choice === "A") entry.status = "approved";
        else if (choice === "E") await edit(i);
        else if (choice === "D") { entries.splice(i, 1); i--; }
        else if (choice !== "S") show("No decision recorded.");
      }
    } else show("Unknown option.");
  }
  await reviewExternal?.(structuredClone(labels));
  show("Final ground truth:");
  show(JSON.stringify(labels.ground_truth, null, 2));
  const reviewer = (await ask("Reviewer name or pseudonym: ")).trim();
  const phrase = labels.ground_truth!.length ? "REVIEWED" : "CONFIRM EMPTY";
  return confirmReview(artifact, labels, reviewer,
    (await ask("Type " + phrase + " to attest this list is complete for the saved evidence: ")).trim());
}


import { z } from "zod";
import { providerJson } from "./provider-request";

export const MAX_YOUTUBE_SECONDS = 120;
export const SHORT_VIDEO_MESSAGE = "We only support short video content up to 2 minutes, such as YouTube Shorts.";
export const ENGLISH_VIDEO_MESSAGE = "We only support English-language videos.";
export const isEnglish = (language: string | null | undefined) =>
  typeof language === "string" && /^(?:english|en(?:-[a-z0-9]{2,8})*)$/i.test(language.trim());

// Observed single-video response from the user-selected duration API. Do not accept partial playlist totals.
const durationSchema = z.object({ success: z.literal(true), results: z.array(z.object({
  id: z.string(), videoCount: z.literal(1), fetchedVideoCount: z.literal(1), consideredCount: z.literal(1),
  unavailableCount: z.literal(0), isTruncated: z.literal(false), rangeStart: z.literal(1), rangeEnd: z.literal(1),
  totalSeconds: z.number().positive().finite(),
  videos: z.array(z.object({ id: z.string(), durationSeconds: z.number().positive().finite(), considered: z.literal(true) })).length(1),
})).length(1) });

/** Reject before model input. Only send a normalized public video URL; never forward credentials or notes. */
export async function checkYouTubeDuration(sourceUrl: string, options: { fetch?: typeof fetch }) {
  const id = new URL(sourceUrl).searchParams.get("v");
  const form = new FormData();
  form.set("search_string", sourceUrl);
  form.set("range_start", "1");
  form.set("range_end", "1");
  const raw = await providerJson("https://ytplaylistlength.one/api/calculate", { method: "POST", body: form },
    { fetch: options.fetch, timeoutMs: 10000, code: "VIDEO_DURATION_FAILED" });
  const parsed = durationSchema.safeParse(raw);
  const result = parsed.success ? parsed.data.results[0] : undefined;
  const video = result?.videos[0];
  if (!result || !video || result.id !== id || video.id !== id || result.totalSeconds !== video.durationSeconds) {
    return { allowed: false as const, failureCode: "SOURCE_INACCESSIBLE" as const,
      message: "We could not verify this video's duration. Please use a public video up to 2 minutes, or provide text." };
  }
  if (video.durationSeconds > MAX_YOUTUBE_SECONDS) return { allowed: false as const,
    failureCode: "UNSUPPORTED_SOURCE" as const, message: SHORT_VIDEO_MESSAGE };
  return { allowed: true as const };
}

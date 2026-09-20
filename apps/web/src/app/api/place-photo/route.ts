import { NextResponse } from "next/server";
import { config } from "@/server/config";
import { currentUser } from "@/server/auth/session";

// Provider photos, streamed through the server.
// This is not a contract endpoint (those return JSON): it passes image bytes through so the
// Places key stays on the server, as DEC-05 and the provider terms require. Nothing is stored.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "places/<place id>/photos/<photo reference>" and nothing else, so this can't be pointed elsewhere. */
const PHOTO_REF = /^places\/[A-Za-z0-9_-]{1,120}\/photos\/[A-Za-z0-9_-]{1,400}$/;
const SIZES = [200, 400, 800, 1600];

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  if (!PHOTO_REF.test(ref)) return NextResponse.json({ error: "BAD_REFERENCE" }, { status: 400 });

  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (config.placesProvider !== "google" || !key) {
    return NextResponse.json({ error: "PHOTOS_UNAVAILABLE", message: "Set PLACES_PROVIDER=google and GOOGLE_PLACES_API_KEY." }, { status: 503 });
  }

  const asked = Number(url.searchParams.get("w") ?? 800);
  const width = SIZES.find((size) => size >= asked) ?? 800;
  const media = new URL(`https://places.googleapis.com/v1/${ref}/media`);
  media.searchParams.set("maxWidthPx", String(width));
  media.searchParams.set("key", key);

  const response = await fetch(media, { redirect: "follow", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ error: "PHOTO_UNAVAILABLE" }, { status: 502 });

  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return NextResponse.json({ error: "NOT_AN_IMAGE" }, { status: 502 });

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": type,
      // The viewer's browser may keep it briefly; the app never stores provider images.
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

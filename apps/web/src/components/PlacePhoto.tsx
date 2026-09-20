"use client";

import type { PlacePhoto } from "@reel/contracts";
import { useState } from "react";
import { StopArt } from "./Illustration";

// A provider photo, fetched through /api/place-photo so the Places key stays on the server.
// Falls back to the category tile when the provider has no photo, or the fetch fails.
// Photos belong to the provider: they are shown with their credit and never stored by the app.

export const CATEGORY_DEFAULT_PHOTOS: Record<string, string> = {
  temple: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=800&q=80",
  shrine: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80",
  viewpoint: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=800&q=80",
  museum: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
  park: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80",
  garden: "https://images.unsplash.com/photo-1578637387939-43c525550085?auto=format&fit=crop&w=800&q=80",
  market: "https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=800&q=80",
  restaurant: "https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=800&q=80",
  cafe: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
  coffee: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
  entertainment: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
  arcade: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
  ramen: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
  bar: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80",
  hotel: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  shopping: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80",
};

export function getCategoryPhoto(category?: string | null): string | null {
  if (!category) return "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80";
  const c = category.toLowerCase().trim();
  if (CATEGORY_DEFAULT_PHOTOS[c]) return CATEGORY_DEFAULT_PHOTOS[c]!;
  for (const [key, url] of Object.entries(CATEGORY_DEFAULT_PHOTOS)) {
    if (c.includes(key) || key.includes(c)) return url;
  }
  return "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80";
}

export function PlaceImage({
  photo,
  category,
  className,
  width = 400,
  alt,
  size = "md",
}: {
  photo?: PlacePhoto | null;
  category?: string | null;
  className?: string;
  /** Width to ask the provider for; the served image is the next size up. */
  width?: number;
  alt?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  // Provider images and illustrated fallbacks must use the same frame. Google
  // photos have many intrinsic aspect ratios, so letting the <img> size itself
  // makes a card's layout depend on whichever photo happens to be returned.
  const imageClassName = `art stop-art-${size} place-photo${className ? ` ${className}` : ""}`;

  const isDirectUrl = photo?.ref && (photo.ref.startsWith("http://") || photo.ref.startsWith("https://") || photo.ref.startsWith("/"));
  const primarySrc = photo?.ref
    ? isDirectUrl
      ? photo.ref
      : `/api/place-photo?ref=${encodeURIComponent(photo.ref)}&w=${width}`
    : null;

  if (primarySrc && !photoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external or proxy images
      <img
        className={imageClassName}
        src={primarySrc}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        onError={() => setPhotoFailed(true)}
      />
    );
  }

  const categoryFallback = getCategoryPhoto(category);
  if (categoryFallback && !fallbackFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fallback travel photo
      <img
        className={imageClassName}
        src={categoryFallback}
        alt={alt ?? category ?? "Place photo"}
        loading="lazy"
        decoding="async"
        onError={() => setFallbackFailed(true)}
      />
    );
  }

  return <StopArt category={category} className={className} size={size} />;
}

/** "Photo: Jane Doe · Google Maps" — required credit under the photo. */
export const photoCredit = (photo: PlacePhoto) => `Photo: ${photo.attribution}`;

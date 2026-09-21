"use client";

import type { PlacePhoto } from "@reel/contracts";
import { useState } from "react";
import { GooglePlacePhoto } from "@/features/places/GooglePlacePhoto";
import { StopArt } from "./Illustration";

// Owner Google matches use fresh, attributed photos through the places.photo contract.
// App-owned stock URLs were removed: missing photos use the deterministic category artwork.

export function PlaceImage({
  photo,
  google,
  category,
  className,
  alt,
  size = "md",
}: {
  photo?: PlacePhoto | null;
  google?: { tripId: string; placeId: string; providerPlaceId: string };
  category?: string | null;
  className?: string;
  /** Legacy presentation hint; Google display requests use the bounded photo endpoint. */
  width?: number;
  alt?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  // Provider images and illustrated fallbacks must use the same frame. Google
  // photos have many intrinsic aspect ratios, so letting the <img> size itself
  // makes a card's layout depend on whichever photo happens to be returned.
  const imageClassName = `art stop-art-${size} place-photo${className ? ` ${className}` : ""}`;

  if (google) return <GooglePlacePhoto {...google} name={alt || "Place"} compact />;

  const isDirectUrl = photo?.ref && (photo.ref.startsWith("http://") || photo.ref.startsWith("https://") || photo.ref.startsWith("/"));
  const primarySrc = photo?.ref
    ? isDirectUrl
      ? photo.ref
      : null
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

  return <StopArt category={category} className={className} size={size} />;
}

/** "Photo: Jane Doe · Google Maps" — required credit under the photo. */
export const photoCredit = (photo: PlacePhoto) => `Photo: ${photo.attribution}`;

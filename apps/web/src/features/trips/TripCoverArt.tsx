"use client";

import type { Trip } from "@reel/contracts";
import { CoverArt } from "@/components/Illustration";
import { uploadUrl } from "@/lib/api-client";

export function TripCoverArt({
  trip,
  className,
  caption,
  showLabel = true,
}: {
  trip: Trip;
  className?: string;
  caption?: string;
  showLabel?: boolean;
}) {
  return (
    <CoverArt
      seed={trip.destination}
      className={className}
      caption={caption}
      showLabel={showLabel}
      photoSrc={trip.coverAssetId ? uploadUrl(trip.coverAssetId) : null}
      photoAlt={`${trip.title} cover`}
    />
  );
}

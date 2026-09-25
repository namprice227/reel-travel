"use client";

import type { Trip } from "@reel/contracts";
import { CoverArt } from "@/components/Illustration";
import { uploadUrl } from "@/lib/api-client";
import { hasDedicatedCountryCover } from "@/lib/country-cover";
import { destinationCountryCode } from "./country-search";

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
  const countryCode = destinationCountryCode(trip.destination);
  const neutralCover = countryCode && !hasDedicatedCountryCover(countryCode) ? "/images/library/other-country.webp" : null;
  return (
    <CoverArt
      seed={trip.destination}
      className={className}
      caption={caption}
      showLabel={showLabel}
      photoSrc={trip.coverAssetId ? uploadUrl(trip.coverAssetId) : neutralCover}
      photoAlt={trip.coverAssetId ? `${trip.title} cover` : "Travel cover"}
    />
  );
}

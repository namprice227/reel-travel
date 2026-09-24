"use client";

import type { PlacePhotoResponse } from "@reel/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";

export function AccountPlacePhoto({
  reelId,
  placeId,
  providerPlaceId,
  name,
  fallback,
  possibleMatch = false,
}: {
  reelId: string;
  placeId: string;
  providerPlaceId: string;
  name: string;
  fallback: ReactNode;
  possibleMatch?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [photo, setPhoto] = useState<PlacePhotoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!container.current) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "120px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setPhoto(null);
    setLoading(true);
    void api("accountReels.placePhoto", {
      params: { reelId, placeId },
      query: { providerPlaceId },
    }).then((result) => {
      if (active) setPhoto(result.photo);
    }).catch(() => {
      if (active) setPhoto(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [visible, reelId, placeId, providerPlaceId]);

  return (
    <figure ref={container} className="account-place-photo" aria-label={`Photo of ${name}`} aria-busy={loading}>
      {photo ? (
        <>
          <img src={photo.imageUrl} alt={name} loading="lazy" referrerPolicy="no-referrer"
            onError={() => setPhoto(null)} />
          <figcaption>
            {possibleMatch && <span>Possible match</span>}
            <a href={photo.googleMapsUrl} target="_blank" rel="noopener noreferrer" translate="no">Google Maps</a>
            {photo.authors.map((author, index) => (
              <span key={`${author.name}:${index}`}>
                {author.url
                  ? <a href={author.url} target="_blank" rel="noopener noreferrer">{author.name}</a>
                  : author.name}
              </span>
            ))}
          </figcaption>
        </>
      ) : <div className="account-place-photo-fallback">{fallback}</div>}
    </figure>
  );
}

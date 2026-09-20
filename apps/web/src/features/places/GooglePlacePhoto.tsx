"use client";

import type { PlacePhoto } from "@reel/contracts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import styles from "./GooglePlacePhoto.module.css";

type Props = { tripId: string; placeId: string; providerPlaceId: string; name: string };

export function GooglePlacePhoto(props: Props) {
  // A branch change must discard the previous branch's image immediately.
  return <Photo key={`${props.tripId}:${props.placeId}:${props.providerPlaceId}`} {...props} />;
}

function Photo({ tripId, placeId, providerPlaceId, name }: Props) {
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [photo, setPhoto] = useState<PlacePhoto | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!container.current) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "100px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void api("places.photo", { params: { tripId, placeId }, query: { providerPlaceId } })
      .then(result => { if (active) setPhoto(result.photo); })
      .catch(() => { if (active) setPhoto(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, tripId, placeId, providerPlaceId]);

  return <figure ref={container} className={styles.photo} aria-label={`Photo of ${name}`}>
    {photo ? <>
      <img className={styles.image} src={photo.imageUrl} alt={name} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setPhoto(null)} />
      <figcaption className={styles.caption}>
        <a href={photo.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={styles.google} translate="no">Google Maps</a>
        {photo.authors.map((author, index) => <span className={styles.author} key={`${author.name}:${index}`}>
          {author.avatarUrl && <img src={author.avatarUrl} alt="" width={20} height={20} loading="lazy" referrerPolicy="no-referrer" />}
          {author.url ? <a href={author.url} target="_blank" rel="noopener noreferrer">{author.name}</a> : author.name}
        </span>)}
      </figcaption>
    </> : <div className={styles.fallback}>{loading ? "Loading place photo…" : "Photo unavailable"}</div>}
  </figure>;
}

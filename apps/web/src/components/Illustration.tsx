"use client";

import type { StopKind } from "@reel/contracts";
import { useState } from "react";
import { Icon, type IconName } from "./icons";

// App-owned photos are private uploads served by the application. When no upload exists,
// render a deterministic SVG rather than guessing a destination from a stock-photo table.

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SKIES = [
  ["#f6c9b8", "#f3dfd6", "#b9cfee"],
  ["#fbd6a8", "#f6c4bd", "#8fb2e3"],
  ["#cfe0f7", "#e9eef7", "#f7d9cf"],
  ["#f2b8a2", "#d7c3e0", "#7d9fd6"],
];

/** Scene used for trip covers and hero banners. Uses photography where available with SVG skyline fallback. */
export function CoverArt({
  seed,
  className,
  caption,
  showLabel = true,
  photoSrc,
  photoAlt,
}: {
  seed: string;
  className?: string;
  caption?: string;
  showLabel?: boolean;
  /** Same-origin, owner-authorized private asset URL. */
  photoSrc?: string | null;
  photoAlt?: string;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  if (photoSrc && failedPhoto !== photoSrc) {
    return (
      <div className={`art cover-art cover-art-photo${className ? ` ${className}` : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private, cookie-authenticated upload */}
        <img
          src={photoSrc}
          alt={photoAlt ?? caption ?? `${seed} trip cover`}
          className="cover-photo-img"
          loading="lazy"
          decoding="async"
          onError={() => setFailedPhoto(photoSrc)}
        />
        <div className="cover-photo-scrim" />
        {caption && <span className="art-caption">{caption}</span>}
        {showLabel && <span className="art-label">Destination</span>}
      </div>
    );
  }

  const h = hash(seed);
  const sky = SKIES[h % SKIES.length]!;
  const id = `cover-${h.toString(36)}`;
  const buildings = Array.from({ length: 22 }, (_, i) => {
    const r = hash(`${seed}:${i}`);
    return { x: i * 28 + (r % 9), w: 16 + (r % 14), h: 28 + ((r >>> 5) % 70) };
  });
  const towerX = 150 + (h % 320);
  return (
    <div className={`art cover-art${className ? ` ${className}` : ""}`}>
      <svg viewBox="0 0 640 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[2]} />
            <stop offset="0.55" stopColor={sky[1]} />
            <stop offset="1" stopColor={sky[0]} />
          </linearGradient>
          <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7f9fce" />
            <stop offset="1" stopColor="#3c5f99" />
          </linearGradient>
        </defs>
        <rect width="640" height="260" fill={`url(#${id}-sky)`} />
        <circle cx={480 - (h % 200)} cy="118" r="30" fill="#fff4e6" opacity="0.75" />
        <path d="M0 170 L90 128 L170 158 L260 112 L360 150 L450 118 L540 150 L640 126 V200 H0Z" fill="#aab8d6" opacity="0.55" />
        <g fill="#5b6f9a" opacity="0.85">
          {buildings.map((b, i) => (
            <rect key={i} x={b.x} y={200 - b.h} width={b.w} height={b.h} />
          ))}
          <path d={`M${towerX} 200 L${towerX + 7} 62 L${towerX + 14} 200Z`} />
          <rect x={towerX + 3} y="110" width="8" height="6" />
          <rect x={towerX + 5.5} y="40" width="3" height="24" />
        </g>
        <g fill="#34497a">
          {buildings.map((b, i) => (i % 3 === 0 ? <rect key={i} x={b.x + 300} y={214 - b.h / 2} width={b.w} height={b.h / 2} /> : null))}
        </g>
        <rect y="206" width="640" height="54" fill={`url(#${id}-water)`} />
        <path d="M0 222 H640 M40 236 H300 M360 244 H620" stroke="#c9d8f0" strokeWidth="1.2" opacity="0.5" />
        <g fill="#f4a9b8" opacity="0.9">
          {Array.from({ length: 26 }, (_, i) => {
            const r = hash(`${seed}:b${i}`);
            return <circle key={i} cx={(r % 150) - 10} cy={(r >>> 8) % 110} r={6 + (r % 9)} />;
          })}
        </g>
        <g fill="#fbd0da" opacity="0.8">
          {Array.from({ length: 12 }, (_, i) => {
            const r = hash(`${seed}:c${i}`);
            return <circle key={i} cx={560 + (r % 100)} cy={(r >>> 7) % 80} r={5 + (r % 8)} />;
          })}
        </g>
      </svg>
      {caption && <span className="art-caption">{caption}</span>}
      {showLabel && <span className="art-label">Illustrative</span>}
    </div>
  );
}

type Palette = { from: string; to: string; ink: string; icon: IconName; label: string };

const CATEGORY: Record<string, Palette> = {
  temple: { from: "#f6d5c8", to: "#e9a38c", ink: "#8a2f1d", icon: "temple", label: "Culture" },
  shrine: { from: "#f6d5c8", to: "#e9a38c", ink: "#8a2f1d", icon: "temple", label: "Culture" },
  museum: { from: "#e5e3f3", to: "#b9b4dc", ink: "#443c7a", icon: "museum", label: "Culture" },
  viewpoint: { from: "#d8e6fb", to: "#98b8ea", ink: "#1f4c8f", icon: "view", label: "Views" },
  park: { from: "#dcefd9", to: "#9ccd98", ink: "#2c6b2f", icon: "tree", label: "Nature" },
  garden: { from: "#dcefd9", to: "#9ccd98", ink: "#2c6b2f", icon: "tree", label: "Nature" },
  market: { from: "#fbe6c4", to: "#f0b76a", ink: "#8a4b06", icon: "bag", label: "Food & drink" },
  restaurant: { from: "#fbe1c9", to: "#eea77a", ink: "#8a3f10", icon: "food", label: "Food & drink" },
  cafe: { from: "#f1e3d3", to: "#cfa98a", ink: "#6b4125", icon: "cafe", label: "Food & drink" },
  entertainment: { from: "#f9dbe8", to: "#e79ac0", ink: "#86214f", icon: "game", label: "Entertainment" },
};

const KIND: Record<StopKind, Palette> = {
  meal: { from: "#fbe1c9", to: "#eea77a", ink: "#8a3f10", icon: "food", label: "Meal" },
  suggestion: { from: "#dcefd9", to: "#9ccd98", ink: "#2c6b2f", icon: "pin", label: "Suggestion" },
  place: { from: "#e3ebf7", to: "#b8c9e6", ink: "#27477c", icon: "pin", label: "Place" },
  reservation: { from: "#dfe4f2", to: "#8e9cc4", ink: "#1f2d57", icon: "lock", label: "Booking" },
  break: { from: "#f3efe6", to: "#ddd3bf", ink: "#6b5d3f", icon: "pause", label: "Break" },
};

export function categoryPalette(category: string | null | undefined, kind: StopKind = "place"): Palette {
  return (category && CATEGORY[category.toLowerCase()]) || KIND[kind];
}

/** Friendly type group for a provider category, e.g. "restaurant" -> "Food & drink". */
export const categoryGroup = (category: string | null | undefined) => (category ? (CATEGORY[category.toLowerCase()]?.label ?? "Other") : "Unsorted");

/** Category tile used where the references show a venue photo. */
export function StopArt({
  category,
  kind = "place",
  className,
  size = "md",
}: {
  category?: string | null;
  kind?: StopKind;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const palette = categoryPalette(category, kind);
  return (
    // A span so it can sit inside buttons and links.
    <span
      className={`art stop-art stop-art-${size}${className ? ` ${className}` : ""}`}
      style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`, color: palette.ink }}
      aria-hidden="true"
    >
      <svg className="stop-art-hills" viewBox="0 0 120 40" preserveAspectRatio="none">
        <path d="M0 40 V24 Q20 10 40 22 T80 18 T120 22 V40Z" fill="currentColor" opacity="0.12" />
      </svg>
      <Icon name={palette.icon} size={size === "sm" ? 22 : size === "lg" ? 44 : 32} />
    </span>
  );
}

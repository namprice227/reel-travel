import type { ReactNode } from "react";

// Line icons shared by the app shell and screens. Decorative by default (aria-hidden).

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
  trips: <><rect x="3.5" y="7" width="17" height="13" rx="2" /><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M8 7v13m8-13v13" /></>,
  library: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  discover: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4m8-4v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  note: <><path d="M6 3h9l4 4v14H6z" /><path d="M14.5 3v4.5H19M9 12h7M9 16h5" /></>,
  map: <><path d="m3 6 6-2.5 6 2.5 6-2.5V18l-6 2.5L9 18l-6 2.5z" /><path d="M9 3.5V18m6-12v14.5" /></>,
  timeline: <><path d="M4 6h4M4 12h4M4 18h4M11 6h9M11 12h9M11 18h9" /></>,
  magazine: <><rect x="3.5" y="4" width="17" height="16" rx="1.5" /><path d="M12 4v16M6.5 8h3M6.5 11.5h3M14.5 8h3M14.5 11.5h3" /></>,
  share: <><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  arrowRight: <path d="M4 12h15m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M20 12H5m6-6-6 6 6 6" />,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16.5 9.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></>,
  alert: <><path d="M12 3.5 22 20H2z" /><path d="M12 10v4.5M12 17.2v.2" /></>,
  transit: <><rect x="5" y="3.5" width="14" height="14" rx="3" /><path d="M5 11h14M8.5 14.5h.1m6.8 0h.1M8 21l1.5-3.5m6.5 3.5-1.5-3.5" /></>,
  walk: <><circle cx="13" cy="4.5" r="1.8" /><path d="m10 21 2-6-2.5-2.5 1-5 3.5 3 3 1M9.5 7.5 6.5 10v3M14 15l1.5 6" /></>,
  car: <><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3.5 16h17v3h-3v-1.5h-11V19h-3zM5 11h14" /><circle cx="8" cy="13.5" r=".6" /><circle cx="16" cy="13.5" r=".6" /></>,
  food: <><path d="M7 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M9 13v8M17 21V3c-2 1-3.5 3.5-3.5 7v3H17" /></>,
  bed: <><path d="M3 18V6m0 7h18v5M3 15h18" /><path d="M7 13V10.5h5.5A2.5 2.5 0 0 1 15 13" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13.5h9l1-13.5" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5-5 4 4 2.5-2.5L20 19" /></>,
  text: <><path d="M5 5h14M5 10h14M5 15h9M5 20h6" /></>,
  sparkle: <path d="M12 3c.8 4.5 2.5 6.2 7 7-4.5.8-6.2 2.5-7 7-.8-4.5-2.5-6.2-7-7 4.5-.8 6.2-2.5 7-7Z" />,
  mountain: <><path d="m2.5 19 7-11 4 6 2-3 6 8z" /><path d="m8 10.5 1.5 1.5 1.5-1.5" /></>,
  route: <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" /></>,
  signOut: <><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>,
  temple: <><path d="M3 8.5h18L12 4zM5 12h14M6 8.5V12m12-3.5V12M7 12v8.5m10-8.5v8.5M4 20.5h16M10 20.5v-4.5h4v4.5" /></>,
  view: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  tree: <><path d="M12 21v-5M12 3 6 11h3l-4 5h14l-4-5h3z" /></>,
  museum: <><path d="M3 9h18L12 4zM5 9v9m4.7-9v9m4.6-9v9M19 9v9M3 20.5h18" /></>,
  cafe: <><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5m4-2.5v2.5" /></>,
  bag: <><path d="M5 8h14l-1 12.5H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  game: <><rect x="2.5" y="7" width="19" height="11" rx="5" /><path d="M7.5 10.5v4M5.5 12.5h4M15.5 11.5h.1m2 2h.1" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6m4-6v6" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}

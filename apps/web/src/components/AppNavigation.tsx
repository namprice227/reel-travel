"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";

type IconName = "home" | "trips" | "saved" | "discover" | "settings";

const items: Array<{ href: string; label: string; icon: IconName; match: (path: string) => boolean }> = [
  { href: "/", label: "Home", icon: "home", match: (path) => path === "/" },
  { href: "/trips", label: "My trips", icon: "trips", match: (path) => path === "/trips" || /^\/trips\/[^/]+\/(itinerary|setup|share)/.test(path) },
  { href: "/trips", label: "Saved inspiration", icon: "saved", match: (path) => /\/trips\/[^/]+\/(inbox|places)/.test(path) },
];

export function AppNavigation({ email }: { email: string }) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const tripId = pathname.match(/^\/trips\/([^/]+)/)?.[1];

  return (
    <aside className={`app-sidebar${pinned ? " is-pinned" : ""}`} aria-label="Main navigation">
      <div className="sidebar-top">
        <Link href="/" className="sidebar-brand" aria-label="Reel Travel home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span className="sidebar-label brand-name">Reel Travel</span>
        </Link>
        <button
          className="sidebar-pin"
          type="button"
          aria-pressed={pinned}
          aria-label={pinned ? "Collapse navigation" : "Keep navigation open"}
          onClick={() => setPinned((value) => !value)}
        >
          <span aria-hidden="true">{pinned ? "‹" : "›"}</span>
        </button>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.label === "Saved inspiration" && tripId ? `/trips/${tripId}/inbox` : item.href}
            className={item.match(pathname) ? "active" : undefined}
            title={item.label}
          >
            <NavIcon name={item.icon} />
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}
        <span className="sidebar-disabled" title="Discover — coming later" aria-disabled="true">
          <NavIcon name="discover" />
          <span className="sidebar-label">Discover <small>Later</small></span>
        </span>
      </nav>

      <div className="sidebar-bottom">
        <span className="sidebar-user" title={email}>
          <span className="user-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span>
          <span className="sidebar-label user-email">{email}</span>
        </span>
        <span className="sidebar-settings">
          <NavIcon name="settings" />
          <span className="sidebar-label"><SignOutButton /></span>
        </span>
      </div>
    </aside>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
    trips: <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5a3 3 0 0 1 6 0v2M8 11v5m8-5v5" /></>,
    saved: <path d="M6 3h12v18l-6-4-6 4z" />,
    discover: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}


"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CoverArt } from "./Illustration";
import { Icon, type IconName } from "./icons";
import { SignOutButton } from "./SignOutButton";

// Global navigation: a 76px icon rail that expands over the page on hover or keyboard focus.
// On narrow screens it becomes a bottom bar (see globals.css), so hover is never the only way in.

const items: Array<{ href: string; label: string; icon: IconName; match: (path: string) => boolean; soon?: boolean }> = [
  { href: "/home", label: "Home", icon: "home", match: (path) => path === "/home" },
  { href: "/my-trip", label: "My trips", icon: "trips", match: (path) => path.startsWith("/my-trip") },
  { href: "/inspiration-library", label: "Inspiration library", icon: "library", match: (path) => path.startsWith("/inspiration-library") },
  { href: "/discover", label: "Discover", icon: "discover", match: (path) => path.startsWith("/discover"), soon: true },
];

export function AppNavigation({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <Link href="/home" className="sidebar-brand" aria-label="Reel Travel home">
        <span className="brand-mark" aria-hidden="true"><Icon name="mountain" size={26} /></span>
        <span className="sidebar-label">
          <span className="brand-name">Reel Travel</span>
          <span className="brand-tagline">Turn inspiration into real trips</span>
        </span>
      </Link>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.match(pathname) ? "active" : undefined}
            aria-current={item.match(pathname) ? "page" : undefined}
            title={item.label}
          >
            <Icon name={item.icon} size={22} className="nav-icon" />
            <span className="sidebar-label">
              {item.label}
              {item.soon && <small className="soon-tag">Soon</small>}
            </span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-art sidebar-label" aria-hidden="true">
        <CoverArt seed="sidebar" showLabel={false} caption="Better trips live here." />
      </div>

      <div className="sidebar-bottom">
        <span className="sidebar-user" title={email}>
          <span className="user-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span>
          <span className="sidebar-label user-email">{email}</span>
        </span>
        <span className="sidebar-signout">
          <Icon name="signOut" size={22} className="nav-icon" />
          <span className="sidebar-label"><SignOutButton /></span>
        </span>
      </div>
    </aside>
  );
}

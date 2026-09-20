"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { SignOutButton } from "./SignOutButton";

// Persistent labels on desktop; the same destinations form a safe-area-aware mobile dock.

const items: Array<{ href: string; label: string; icon: IconName; match: (path: string) => boolean; soon?: boolean }> = [
  { href: "/home", label: "Home", icon: "home", match: (path) => path === "/home" },
  { href: "/my-trip", label: "My trips", icon: "trips", match: (path) => path.startsWith("/my-trip") },
  { href: "/inspiration-library", label: "Inspiration library", icon: "library", match: (path) => path.startsWith("/inspiration-library") },
  { href: "/discover", label: "Discover", icon: "discover", match: (path) => path.startsWith("/discover"), soon: true },
];

export function AppNavigation({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="app-sidebar">
      <Link href="/home" className="sidebar-brand" aria-label="Reel Travel home">
        <span className="brand-mark" aria-hidden="true"><Icon name="mountain" size={26} /></span>
        <span className="sidebar-label">
          <span className="brand-name">Reel Travel</span>
          <span className="brand-tagline">Save it. Go live it.</span>
        </span>
      </Link>

      <nav className="sidebar-nav" aria-label="Main navigation">
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

      <div className="sidebar-bottom">
        <Link href="/my-trip/new" className="nav-new-trip"><Icon name="plus" size={18} /><span>New trip</span></Link>
        <details className="nav-account" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
          <summary aria-label="Account menu"><span className="user-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span></summary>
          <div className="nav-account-menu"><strong>Your account</strong><span className="user-email">{email}</span><SignOutButton /></div>
        </details>
      </div>
    </header>
  );
}

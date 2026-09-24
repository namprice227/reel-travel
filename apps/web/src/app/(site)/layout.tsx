import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { TrackedLink } from "@/features/landing/TrackedLink";
import { currentUser } from "@/server/auth/session";
import { RouteletBrand } from "@/components/RouteletBrand";

// Public chrome for the landing page (/), sign-in and shared trip links. Signed-in visitors see the same
// landing page, with a way back into the app instead of sign-up prompts.

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="public-container site-header-row">
          <Link href="/" className="brand site-brand" aria-label="Routelet home">
            <RouteletBrand size={38} />
            Routelet
          </Link>
          <nav className="public-nav" aria-label="Site">
            <a className="public-nav-link" href="/#how-it-works">How it works</a>
            <a className="public-nav-link" href="/#pricing">Pricing</a>
            {user ? (
              <Link className="btn btn-primary" href="/home">Open my trips <Icon name="arrowRight" size={18} /></Link>
            ) : (
              <>
                <Link className="public-nav-link" href="/sign-in">Sign in</Link>
                <TrackedLink href="/sign-in?next=%2Fmy-trip%2Fnew" className="btn btn-primary">Start a trip <Icon name="arrowRight" size={18} /></TrackedLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="public-container public-main">{children}</main>
      <footer className="site-footer">
        <div className="public-container site-footer-row">
          <span className="site-footer-brand">Routelet</span>
          <span className="muted small">A CS3216 student project. Venues, dates and bookings shown on this page are sample data.</span>
          <nav className="row small" aria-label="Footer">
            <a href="/#how-it-works">How it works</a>
            <a href="/#pricing">Pricing</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href={user ? "/home" : "/sign-in"}>{user ? "My trips" : "Sign in"}</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

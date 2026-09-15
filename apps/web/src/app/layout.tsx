import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppNavigation } from "@/components/AppNavigation";
import { currentUser } from "@/server/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Reel Travel", template: "%s · Reel Travel" },
  description: "Turn saved travel inspiration into confirmed places and an editable travel magazine.",
  openGraph: {
    title: "Reel Travel",
    description: "Turn saved travel inspiration into confirmed places and an editable travel magazine.",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        {user ? (
          <div className="app-shell">
            <AppNavigation email={user.email} />
            <div className="app-stage">
              <header className="app-topbar">
                <span className="topbar-search">Search trips, places, or saves…</span>
                <span className="topbar-avatar" aria-label={`Signed in as ${user.email}`}>{user.email.slice(0, 1).toUpperCase()}</span>
              </header>
              <main className="app-main">{children}</main>
            </div>
          </div>
        ) : (
          <>
            <header className="site-header">
              <div className="public-container row between">
                <Link href="/" className="brand">Reel Travel</Link>
                <nav className="row public-nav"><a href="/#how-it-works">How it works</a><Link href="/sign-in">Sign in</Link><Link className="btn btn-primary" href="/sign-in">Start a trip</Link></nav>
              </div>
            </header>
            <main className="public-container public-main">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}

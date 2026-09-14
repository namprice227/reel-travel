import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/SignOutButton";
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
        <header className="site-header">
          <div className="container row between">
            <Link href="/" className="brand">
              Reel Travel
            </Link>
            <nav className="row">
              {user ? (
                <>
                  <Link href="/trips">My trips</Link>
                  <span className="muted small">{user.email}</span>
                  <SignOutButton />
                </>
              ) : (
                <Link href="/sign-in">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

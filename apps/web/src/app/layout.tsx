import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import type { Metadata } from "next";
import { Figtree, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";
import "./styles/home.css";
import "./styles/dashboard.css";
import "./styles/landing.css";
import "./styles/trips.css";
import "./styles/itinerary.css";
import "./styles/shared-itinerary.css";
import "./styles/setup-share.css";
import "./styles/place.css";
import "./styles/library.css";
import "./styles/account-reels.css";

// Root layout: document shell, fonts and site-wide metadata only.
// Chrome lives in route groups: (site) = public header for "/", sign-in and shared links; (app) = signed-in shell.

// Self-hosted at build time by next/font (no requests to Google from the browser). Used through --serif / --sans.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", style: ["normal", "italic"], axes: ["opsz"], display: "swap" });

const description =
  "Turn saved travel links, notes and screenshots into places you choose and a day-by-day trip you can edit and share.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Routelet", template: "%s · Routelet" },
  description,
  applicationName: "Routelet",
  openGraph: {
    title: "Routelet",
    description,
    type: "website",
    siteName: "Routelet",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Routelet", description },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${newsreader.variable}`}>
      <body>{children}<GoogleAnalytics /></body>
    </html>
  );
}

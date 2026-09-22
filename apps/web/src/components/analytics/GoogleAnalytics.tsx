"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { GA4_MEASUREMENT_ID, ga4PageView } from "../../lib/ga4";

export function GoogleAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    try {
      if (query.get("analytics_debug") === "1")
        sessionStorage.setItem("reel.analytics.debug", "1");
      if (query.get("analytics_debug") === "0")
        sessionStorage.removeItem("reel.analytics.debug");
    } catch {
      /* Tracking must not break navigation when storage is unavailable. */
    }
    ga4PageView(pathname);
  }, [pathname]);
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_GA4_ENABLED === "false"
  )
    return null;
  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
      strategy="afterInteractive"
    />
  );
}

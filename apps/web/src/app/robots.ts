import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Only the public landing page and sign-in are meant for search. Trip, account and shared-link pages stay out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/home", "/my-trip", "/inspiration-library", "/discover", "/s/", "/trips"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

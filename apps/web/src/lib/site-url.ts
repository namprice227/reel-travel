/**
 * Public origin used for search metadata, share images, robots and sitemap.
 * Set SITE_URL on the host (e.g. https://reel.example); local development falls back to localhost.
 */
export const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

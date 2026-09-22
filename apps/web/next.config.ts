import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.ggpht.com https://images.unsplash.com https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "frame-src https://www.google.com https://maps.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@reel/contracts", "@reel/ai", "@reel/planner"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
  // Screen routes were renamed to explicit names; keep old links working.
  async redirects() {
    return [
      { source: "/my-trip/:tripId/details", destination: "/my-trip/:tripId/setup", permanent: false },
      { source: "/trips", destination: "/my-trip", permanent: false },
      { source: "/trips/:tripId/inbox", destination: "/inspiration-library?trip=:tripId", permanent: false },
      { source: "/trips/:tripId/magazine", destination: "/my-trip/:tripId/itinerary", permanent: false },
      { source: "/trips/:path*", destination: "/my-trip/:path*", permanent: false },
      { source: "/my-trip/:tripId/inbox", destination: "/inspiration-library?trip=:tripId", permanent: false },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@reel/contracts", "@reel/ai", "@reel/planner"],
  // Screen routes were renamed to explicit names; keep old links working.
  async redirects() {
    return [
      { source: "/trips", destination: "/my-trip", permanent: false },
      { source: "/trips/:tripId/inbox", destination: "/inspiration-library?trip=:tripId", permanent: false },
      { source: "/trips/:tripId/magazine", destination: "/my-trip/:tripId/itinerary", permanent: false },
      { source: "/trips/:path*", destination: "/my-trip/:path*", permanent: false },
      { source: "/my-trip/:tripId/inbox", destination: "/inspiration-library?trip=:tripId", permanent: false },
    ];
  },
};

export default nextConfig;

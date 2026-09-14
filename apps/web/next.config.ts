import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: ["@reel/contracts", "@reel/ai", "@reel/planner"],
};

export default nextConfig;

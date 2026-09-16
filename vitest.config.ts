import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/offline-setup.ts"],
    env: { AI_PROVIDER: "fake", PLACES_PROVIDER: "fake" },
    include: ["packages/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});

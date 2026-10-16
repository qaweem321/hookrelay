import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { include: ["server/**", "web/src/**", "shared/**"] },
    projects: [
      {
        test: {
          name: "server",
          include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
          environment: "node",
          globalSetup: ["server/test/global-setup.ts"],
          testTimeout: 20_000,
          hookTimeout: 120_000,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          include: ["web/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["web/src/test/setup.ts"],
        },
      },
    ],
  },
});

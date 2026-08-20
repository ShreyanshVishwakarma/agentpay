import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    globalSetup: "./tests/global-setup.ts",
    // Single worker: all integration tests share one SQLite file.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});

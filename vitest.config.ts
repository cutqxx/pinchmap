import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { obsidian: fileURLToPath(new URL("./src/obsidian/testSupport/obsidianRuntimeStub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // Seeded random round-trip tests take ~0.3 s locally; leave room for slow, shared CI runners.
    testTimeout: 15_000,
  },
});

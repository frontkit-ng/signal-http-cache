import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["src/test-support/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});

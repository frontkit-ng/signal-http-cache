import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    fileParallelism: false,
    globals: true,
    setupFiles: ["src/test-support/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});

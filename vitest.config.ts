import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    fileParallelism: false,
    globals: true,
    setupFiles: ["src/test-support/setup.ts"],
    exclude: ["**/node_modules/**", "**/*.types-compile.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});

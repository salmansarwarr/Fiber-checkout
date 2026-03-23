import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",       // DOM APIs available in tests
    globals: true,              // describe/it/expect without imports
    setupFiles: ["./src/test/setup.ts"],
    passWithNoTests: true, 
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/test/**", "src/types/**"],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
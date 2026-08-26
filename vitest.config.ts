import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
    testTimeout: 20_000,
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["convex/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "**/_generated/**",
        "**/*.test.ts",
        "convex/env.d.ts",
        "convex/importData.ts",
        "convex/rollcallImport.ts",
        "convex/devE2E.ts",
        "convex/auth.ts",
        "convex/auth.config.ts",
        "convex/http.ts",
        "convex/crons.ts",
      ],
      thresholds: {
        functions: 100,
        lines: 100,
        statements: 98,
        branches: 92,
      },
    },
  },
});

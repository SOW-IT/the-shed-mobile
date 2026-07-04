import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude nested git worktrees (e.g. .claude/worktrees/<branch>) — they're
    // separate checkouts on other branches, not part of this tree's suite.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // The testable surface: backend logic and the shared domain rules.
      include: ["convex/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "**/_generated/**",
        "**/*.test.ts",
        "convex/env.d.ts",
        // Generated data table (scripts/build-import-data.py), not logic.
        "convex/importData.ts",
        // One-shot admin migration tool (scripts/rollcall-import-apply.mjs).
        "convex/rollcallImport.ts",
        // Dev-only E2E harness (gitignored; absent in CI, so excluded here too
        // to keep local `test:coverage` matching the CI run).
        "convex/devE2E.ts",
        // Framework registration with no testable branches: provider/route/
        // cron wiring that would only exercise convexAuth/httpRouter/cronJobs.
        "convex/auth.ts",
        "convex/auth.config.ts",
        "convex/http.ts",
        "convex/crons.ts",
      ],
      // Every function is exercised and every line runs (100% / 100%). The
      // statement/branch floors sit just under the achieved numbers so they
      // act as a regression ratchet: the residual gaps are defensive guards
      // (`?? null` fallbacks, `error instanceof Error ? … : String(error)`,
      // optional notify recipients) where a contrived test would assert on
      // framework internals rather than real behaviour.
      thresholds: {
        functions: 100,
        lines: 100,
        statements: 98,
        branches: 92,
      },
    },
  },
});

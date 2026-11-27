import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  allRoutes,
  classify,
  formatSweepSummary,
  isVersionOnlyDiff,
  planSweep,
  planVerification,
  resolveRoutes,
  routeSlug,
  SWEEP_TOOLING,
} from "./verifyPlan.mjs";

const realMap = JSON.parse(readFileSync(new URL("../verify/feature-map.json", import.meta.url), "utf8"));

const map = {
  static: ["**/*.md", "**/*.test.ts"],
  core: ["package.json", "src/components/ui/**"],
  smoke: ["/", "/home"],
  areas: {
    calendar: { files: ["src/components/calendar/**", "convex/calendar.ts"], routes: ["/calendar"] },
    home: { files: ["src/app/(tabs)/home.tsx"], routes: ["/home", "/edit-home"] },
    billing: { files: ["convex/billing.ts"], routes: ["/plans"], unitOnly: true },
  },
  fullOnlyRoutes: ["/no-such-page"],
};

describe("planVerification", () => {
  test("docs and tests only run the static tier", () => {
    const plan = planVerification({ changed: ["README.md", "convex/calendar.test.ts"], map });
    expect(plan.tier).toBe("static");
    expect(plan.routes).toEqual([]);
    expect(plan.unit).toEqual({ kind: "all" });
  });

  test("no changes is static", () => {
    expect(planVerification({ changed: [], map }).reasons).toEqual(["no changes against the base"]);
  });

  test("an area file opens the smoke routes plus that area's routes", () => {
    const plan = planVerification({ changed: ["convex/calendar.ts", "README.md"], map });
    expect(plan.tier).toBe("scoped");
    expect(plan.areas).toEqual(["calendar"]);
    expect(plan.routes).toEqual(["/", "/home", "/calendar"]);
    expect(plan.unit).toEqual({ kind: "related", files: ["convex/calendar.ts"] });
  });

  test("changed tests and static scripts go to vitest related too", () => {
    const plan = planVerification({ changed: ["convex/calendar.ts", "convex/calendar.test.ts", "README.md"], map });
    expect(plan.unit).toEqual({ kind: "related", files: ["convex/calendar.ts", "convex/calendar.test.ts"] });
  });

  test("routes shared with smoke are not repeated", () => {
    expect(planVerification({ changed: ["src/app/(tabs)/home.tsx"], map }).routes).toEqual(["/", "/home", "/edit-home"]);
  });

  test("a core file runs everything", () => {
    const plan = planVerification({ changed: ["convex/calendar.ts", "src/components/ui/buttons.tsx"], map });
    expect(plan.tier).toBe("full");
    expect(plan.reasons).toEqual(["core: src/components/ui/buttons.tsx"]);
    expect(plan.routes).toEqual(["/", "/home", "/calendar", "/edit-home", "/plans", "/no-such-page"]);
  });

  test("an unmapped file stops the run and names the file", () => {
    const plan = planVerification({ changed: ["convex/calendar.ts", "convex/newThing.ts"], map });
    expect(plan.tier).toBe("blocked");
    expect(plan.unmapped).toEqual(["convex/newThing.ts"]);
    expect(plan.routes).toEqual([]);
  });

  test("unattended, an unmapped file runs everything and still reports it", () => {
    const plan = planVerification({ changed: ["convex/newThing.ts"], map, unattended: true });
    expect(plan.tier).toBe("full");
    expect(plan.unmapped).toEqual(["convex/newThing.ts"]);
  });

  test("a unit-only area opens no screens and says so", () => {
    const plan = planVerification({ changed: ["convex/billing.ts"], map });
    expect(plan.tier).toBe("scoped");
    expect(plan.routes).toEqual([]);
    expect(plan.reasons).toContain("billing: unit tests only, no screens open for it");
  });

  test("--full wins over the diff", () => {
    expect(planVerification({ changed: ["README.md"], map, full: true }).tier).toBe("full");
  });

  test("--only takes an area or a route", () => {
    expect(planVerification({ changed: [], map, only: "calendar" }).routes).toEqual(["/", "/home", "/calendar"]);
    expect(planVerification({ changed: [], map, only: "/admin" }).routes).toEqual(["/", "/home", "/admin"]);
    expect(() => planVerification({ changed: [], map, only: "nope" })).toThrow(/no such area/);
  });
});

describe("helpers", () => {
  test("static wins over an area match", () => {
    expect(classify("src/components/calendar/x.test.ts", { ...map, static: ["**/*.test.ts"] })).toEqual({ kind: "static" });
  });

  test("resolveRoutes fills holes and drops routes it can't fill", () => {
    expect(resolveRoutes(["/a/{eventId}", "/b/{checkInToken}", "/c"], { eventId: "e1", checkInToken: null })).toEqual([
      { template: "/a/{eventId}", route: "/a/e1" },
      { template: "/c", route: "/c" },
    ]);
  });

  test("routeSlug", () => {
    expect(routeSlug("/")).toBe("root");
    expect(routeSlug("/calendar?view=week")).toBe("calendar_view_week");
  });
});

describe("the checked-in feature map", () => {
  test("covers every tracked file", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(tracked.filter((file) => classify(file, realMap).kind === "unmapped")).toEqual([]);
  });

  test("full runs keep every route the CI sweep opened before the map existed", () => {
    expect(allRoutes(realMap)).toEqual(expect.arrayContaining(["/", "/home", "/admin?tab=system", "/no-such-page"]));
  });

  test("no route contains a comma (safe for --routes CSV)", () => {
    expect(allRoutes(realMap).filter((route) => route.includes(","))).toEqual([]);
  });

  test("every SWEEP_TOOLING path exists in the repo", () => {
    const root = new URL("../..", import.meta.url);
    expect(SWEEP_TOOLING.filter((file) => !existsSync(new URL(file, root)))).toEqual([]);
  });
});

describe("isVersionOnlyDiff", () => {
  test("accepts diffs that only change version lines", () => {
    const diff = [
      "@@ -3 +3 @@",
      '-  "version": "2.13.50",',
      '+  "version": "2.13.51",',
      "@@ -9 +9 @@",
      '-      "version": "2.13.50",',
      '+      "version": "2.13.51",',
    ].join("\n");
    expect(isVersionOnlyDiff(diff)).toBe(true);
  });

  test("rejects empty diffs or diffs touching anything besides version", () => {
    expect(isVersionOnlyDiff("")).toBe(false);
    expect(isVersionOnlyDiff('-  "version": "2.13.50",\n+  "version": "2.13.51",\n+  "private": true')).toBe(false);
  });
});

describe("planSweep", () => {
  test("skips the browser run for static-only changes", () => {
    const plan = planSweep({ changed: ["README.md", "convex/calendar.test.ts"], map });
    expect(plan.run).toBe(false);
    expect(plan.tier).toBe("static");
    expect(plan.routes).toEqual([]);
  });

  test("skips the browser run for unit-only areas", () => {
    const plan = planSweep({ changed: ["convex/billing.ts"], map });
    expect(plan.run).toBe(false);
    expect(plan.tier).toBe("scoped");
    expect(plan.routes).toEqual([]);
  });

  test("scopes PR runs to smoke plus affected areas", () => {
    const plan = planSweep({ changed: ["convex/calendar.ts", "README.md"], map });
    expect(plan.run).toBe(true);
    expect(plan.tier).toBe("scoped");
    expect(plan.areas).toEqual(["calendar"]);
    expect(plan.routes).toEqual(["/", "/home", "/calendar"]);
  });

  test("runs every screen on core or unmapped files", () => {
    const core = planSweep({ changed: ["src/components/ui/button.tsx"], map });
    expect(core.run).toBe(true);
    expect(core.tier).toBe("full");
    expect(core.routes).toEqual(allRoutes(map));

    const unmapped = planSweep({ changed: ["convex/newThing.ts"], map });
    expect(unmapped.run).toBe(true);
    expect(unmapped.tier).toBe("full");
    expect(unmapped.unmapped).toEqual(["convex/newThing.ts"]);
  });

  test("runs every screen when sweep or CI tooling itself changed", () => {
    const plan = planSweep({ changed: ["scripts/sweep.mjs", "README.md"], map: realMap });
    expect(plan.run).toBe(true);
    expect(plan.tier).toBe("full");
    expect(plan.reasons).toEqual(["sweep tooling: scripts/sweep.mjs"]);
    expect(plan.routes).toEqual(allRoutes(realMap));
  });

  test("does not trigger a full sweep for tooling test files or feature-map updates alone", () => {
    const testOnly = planSweep({ changed: ["scripts/lib/verifyPlan.test.mjs"], map: realMap });
    expect(testOnly.run).toBe(false);
    expect(testOnly.tier).toBe("static");

    const featurePlusMap = planSweep({
      changed: ["src/world/Person.tsx", "scripts/verify/feature-map.json"],
      map: realMap,
    });
    expect(featurePlusMap.run).toBe(true);
    expect(featurePlusMap.tier).toBe("scoped");
    expect(featurePlusMap.areas).toEqual(["world"]);
  });

  test("runs every screen when full is requested (push to main)", () => {
    const plan = planSweep({ changed: ["README.md"], map, full: true });
    expect(plan.run).toBe(true);
    expect(plan.tier).toBe("full");
    expect(plan.routes).toEqual(allRoutes(map));
  });

  test("formatSweepSummary describes skipped, scoped and full runs", () => {
    const skipped = formatSweepSummary(planSweep({ changed: ["README.md"], map }), { bumped: ["app.json"], base: "HEAD^1 @ abc1234" });
    expect(skipped).toContain("`static`");
    expect(skipped).toContain("skipping Playwright");
    expect(skipped).toContain("`app.json`");

    const scoped = formatSweepSummary(planSweep({ changed: ["convex/calendar.ts"], map }));
    expect(scoped).toContain("`calendar`");
    expect(scoped).toContain("`/calendar`");

    const full = formatSweepSummary(planSweep({ changed: ["convex/newThing.ts"], map }));
    expect(full).toContain("Running **full** web sweep");
    expect(full).toContain("`convex/newThing.ts`");
  });
});

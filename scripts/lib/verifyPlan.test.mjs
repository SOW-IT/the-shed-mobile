import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { allRoutes, classify, planVerification, resolveRoutes, routeSlug } from "./verifyPlan.mjs";

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
    expect(resolveRoutes(["/a/{eventId}", "/b/{checkInToken}", "/c"], { eventId: "e1", checkInToken: null })).toEqual(["/a/e1", "/c"]);
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
});

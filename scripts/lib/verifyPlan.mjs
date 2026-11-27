import { matchesGlob } from "node:path";

/**
 * @typedef {{ files: string[], routes: string[], unitOnly?: boolean, checks?: string[] }} Area
 * @typedef {{
 *   static: string[], core: string[], smoke: string[],
 *   areas: Record<string, Area>, fullOnlyRoutes: string[]
 * }} FeatureMap
 * @typedef {{ kind: "all" } | { kind: "related", files: string[] } | { kind: "none" }} UnitRun
 * @typedef {{
 *   tier: "static" | "scoped" | "full" | "blocked",
 *   reasons: string[], unmapped: string[], areas: string[], routes: string[], unit: UnitRun
 * }} Plan
 */

const matchesAny = (file, globs) => globs.some((glob) => matchesGlob(file, glob));

const unique = (items) => [...new Set(items)];

/**
 * Every PR bumps `"version"` in these three files, which would make each one a
 * full run. A change to nothing but `"version"` lines doesn't count.
 */
export const VERSION_FILES = ["package.json", "package-lock.json", "app.json"];

/** Whether a unified-0 git diff touches nothing but JSON `"version"` lines. */
export const isVersionOnlyDiff = (diff) => {
  const lines = diff.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  return lines.length > 0 && lines.every((l) => /^[+-]\s*"version": "[^"]*",?$/.test(l));
};

/**
 * Sweep and CI files that live under `static` in the feature map, but should
 * still trigger a full CI web sweep whenever a PR changes them.
 */
export const SWEEP_TOOLING = [
  ".github/workflows/ci.yml",
  "scripts/sweep.mjs",
  "scripts/sweep-backend.sh",
  "scripts/sweep-seed.mjs",
  "scripts/sweep-plan.mjs",
  "scripts/lib/verifyPlan.mjs",
  "scripts/lib/stableFrames.mjs",
  "scripts/verify/feature-map.json",
];

/** Every route a full run opens, in map order. */
export const allRoutes = (map) =>
  unique([...map.smoke, ...Object.values(map.areas).flatMap((area) => area.routes), ...map.fullOnlyRoutes]);

/** Which rule each changed file falls under: static wins, then core, then every matching area. */
export const classify = (file, map) => {
  if (matchesAny(file, map.static)) return { kind: "static" };
  if (matchesAny(file, map.core)) return { kind: "core" };
  const areas = Object.entries(map.areas)
    .filter(([, area]) => matchesAny(file, area.files))
    .map(([name]) => name);
  return areas.length > 0 ? { kind: "area", areas } : { kind: "unmapped" };
};

// Changed tests run too, and so do the tests of changed static code (scripts).
const isCodeOrTest = (file) => /\.(ts|tsx|mjs|js)$/.test(file);

/**
 * Pick what to run for a diff.
 * @param {{ changed: string[], map: FeatureMap, full?: boolean, only?: string | null, unattended?: boolean }} input
 * @returns {Plan}
 */
export const planVerification = ({ changed, map, full = false, only = null, unattended = false }) => {
  const fullPlan = (reasons, unmapped = []) => ({
    tier: "full",
    reasons,
    unmapped,
    areas: Object.keys(map.areas),
    routes: allRoutes(map),
    unit: { kind: "all" },
  });

  if (full) return fullPlan(["--full"]);

  if (only) {
    if (only.startsWith("/")) {
      return { tier: "scoped", reasons: [`--only ${only}`], unmapped: [], areas: [], routes: unique([...map.smoke, only]), unit: { kind: "none" } };
    }
    const area = map.areas[only];
    if (!area) throw new Error(`--only ${only}: no such area. Areas: ${Object.keys(map.areas).join(", ")}`);
    return { tier: "scoped", reasons: [`--only ${only}`], unmapped: [], areas: [only], routes: unique([...map.smoke, ...area.routes]), unit: { kind: "none" } };
  }

  const classified = changed.map((file) => ({ file, ...classify(file, map) }));
  const unmapped = classified.filter((c) => c.kind === "unmapped").map((c) => c.file);
  if (unmapped.length > 0) {
    if (unattended) return fullPlan([`${unmapped.length} file(s) match no rule in the feature map; unattended, so running everything`], unmapped);
    return {
      tier: "blocked",
      reasons: [`${unmapped.length} file(s) match no rule in the feature map`],
      unmapped,
      areas: [],
      routes: [],
      unit: { kind: "none" },
    };
  }

  const core = classified.filter((c) => c.kind === "core").map((c) => c.file);
  if (core.length > 0) return fullPlan(core.map((file) => `core: ${file}`));

  const touched = classified.filter((c) => c.kind === "area");
  if (touched.length === 0) {
    return {
      tier: "static",
      reasons: changed.length === 0 ? ["no changes against the base"] : ["every changed file is static"],
      unmapped: [],
      areas: [],
      routes: [],
      unit: { kind: "all" },
    };
  }

  const areaNames = unique(touched.flatMap((c) => c.areas));
  const reasons = touched.map((c) => `${c.areas.join(", ")}: ${c.file}`);
  const unitOnly = areaNames.filter((name) => map.areas[name].unitOnly);
  for (const name of unitOnly) reasons.push(`${name}: unit tests only, no screens open for it`);
  const screenAreas = areaNames.filter((name) => !map.areas[name].unitOnly);
  return {
    tier: "scoped",
    reasons,
    unmapped: [],
    areas: areaNames,
    routes: screenAreas.length > 0 ? unique([...map.smoke, ...screenAreas.flatMap((name) => map.areas[name].routes)]) : [],
    unit: { kind: "related", files: classified.filter((c) => c.kind !== "core").map((c) => c.file).filter(isCodeOrTest) },
  };
};

/**
 * Plan the CI web sweep for a diff. On `push` to main (`full: true`) or when
 * sweep/CI tooling itself changed, runs every screen. Otherwise reuses the
 * feature map in unattended mode: static-only and unit-only PRs skip the
 * browser run, area PRs check smoke + affected routes, and core/unmapped files
 * run every screen.
 * @param {{ changed: string[], map: FeatureMap, full?: boolean, tooling?: readonly string[] }} input
 */
export const planSweep = ({ changed, map, full = false, tooling = SWEEP_TOOLING }) => {
  if (full) {
    return {
      run: true,
      tier: "full",
      reasons: ["full sweep requested"],
      unmapped: [],
      areas: Object.keys(map.areas),
      routes: allRoutes(map),
    };
  }

  const plan = planVerification({ changed, map, unattended: true });
  const touchedTooling = changed.filter((file) => matchesAny(file, tooling));
  if (touchedTooling.length > 0) {
    return {
      run: true,
      tier: "full",
      reasons: [...touchedTooling.map((file) => `sweep tooling: ${file}`), ...plan.reasons.filter((r) => plan.tier === "full")],
      unmapped: plan.unmapped,
      areas: Object.keys(map.areas),
      routes: allRoutes(map),
    };
  }

  return {
    run: plan.routes.length > 0,
    tier: plan.tier,
    reasons: plan.reasons,
    unmapped: plan.unmapped,
    areas: plan.areas,
    routes: plan.routes,
  };
};

/** Plain markdown summary for logs and GitHub step summaries. */
export const formatSweepSummary = (plan, { bumped = [], base = null } = {}) => {
  const lines = [
    `### Web sweep plan: \`${plan.tier}\`${base ? ` (against \`${base}\`)` : ""}`,
    "",
  ];
  if (!plan.run) {
    lines.push("No screens affected — skipping Playwright, local Convex, and Expo web.");
  } else if (plan.tier === "full") {
    lines.push(`Running **full** web sweep (${plan.routes.length} routes, 4 roles).`);
  } else {
    lines.push(`Running **scoped** web sweep for ${plan.areas.map((a) => `\`${a}\``).join(", ")} (${plan.routes.length} routes, 4 roles).`);
  }
  if (plan.reasons.length > 0) {
    lines.push("", "**Reasons:**", ...plan.reasons.map((r) => `- ${r}`));
  }
  if (bumped.length > 0) {
    lines.push("", `Ignored version-only bump(s): ${bumped.map((f) => `\`${f}\``).join(", ")}`);
  }
  if (plan.unmapped.length > 0) {
    lines.push("", "**Unmapped files (add to `scripts/verify/feature-map.json`):**", ...plan.unmapped.map((f) => `- \`${f}\``));
  }
  if (plan.run && plan.tier === "scoped") {
    lines.push("", "**Routes:**", ...plan.routes.map((r) => `- \`${r}\``));
  }
  return lines.join("\n");
};

/**
 * Fill `{eventId}`-style holes from the sweep seed and drop routes whose value
 * is missing. Each keeps its template, which names its screenshots so a
 * before and an after run (with different ids) pair up.
 */
export const resolveRoutes = (templates, seed) =>
  templates.flatMap((template) => {
    let missing = false;
    const route = template.replace(/\{(\w+)\}/g, (_, key) => {
      const value = seed?.[key];
      if (value === undefined || value === null) missing = true;
      return String(value ?? "");
    });
    return missing ? [] : [{ template, route }];
  });

/** A filename-safe name for a route, shared by the web and iOS screenshots. */
export const routeSlug = (route) =>
  route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "root";

#!/usr/bin/env node
// Decides which routes CI's Web sweep should open for the current commit/PR,
// using scripts/verify/feature-map.json. Uses only Node built-ins so CI can
// run it before `npm ci` and skip installs entirely on static-only PRs.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { allRoutes, classify, formatSweepSummary, isVersionOnlyDiff, planSweep, VERSION_FILES } from "./lib/verifyPlan.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const full = hasFlag("full");
const base = arg("base", "origin/main");
const githubOutput = arg("github-output", process.env.GITHUB_OUTPUT || null);
const stepSummary = process.env.GITHUB_STEP_SUMMARY || null;

const map = JSON.parse(readFileSync(new URL("./verify/feature-map.json", import.meta.url), "utf8"));

const git = (...args) =>
  execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

const resolveDiffBase = (ref) => {
  const merged = tryGit("merge-base", ref, "HEAD");
  if (merged) return merged;
  return tryGit("rev-parse", "--verify", `${ref}^{commit}`);
};

const changedAgainst = (diffBase) => {
  // Same deleted-file rule as scripts/verify.mjs: a deleted file whose map
  // rule went with it is omitted (its callers decide the tier). --no-renames
  // keeps both the old and new paths so cross-area moves check both areas.
  const deleted = git("diff", "--name-only", "--no-renames", "--diff-filter=D", diffBase, "HEAD")
    .split("\n")
    .filter((file) => file && classify(file, map).kind === "unmapped");
  const unique = [
    ...new Set(
      git("diff", "--name-only", "--no-renames", diffBase, "HEAD")
        .split("\n")
        .filter((file) => file && !deleted.includes(file)),
    ),
  ];
  const bumped = unique.filter(
    (file) => VERSION_FILES.includes(file) && isVersionOnlyDiff(git("diff", "-U0", diffBase, "HEAD", "--", file)),
  );
  return { files: unique.filter((file) => !bumped.includes(file)), bumped };
};

let plan;
let bumped = [];
let baseLabel = null;

if (full) {
  plan = planSweep({ changed: [], map, full: true });
} else {
  const diffBase = resolveDiffBase(base);
  if (!diffBase) {
    plan = {
      run: true,
      tier: "full",
      reasons: [`could not resolve diff base (${base}); running every screen`],
      unmapped: [],
      areas: Object.keys(map.areas),
      routes: allRoutes(map),
    };
  } else {
    baseLabel = `${base} @ ${diffBase.slice(0, 7)}`;
    const diff = changedAgainst(diffBase);
    bumped = diff.bumped;
    plan = planSweep({ changed: diff.files, map });
  }
}

const summary = formatSweepSummary(plan, { bumped, base: baseLabel });
console.log(summary);

if (stepSummary) {
  appendFileSync(stepSummary, `${summary}\n`);
}

if (githubOutput) {
  const routesOut = plan.run && plan.tier === "scoped" ? plan.routes.join(",") : "";
  if (/[\r\n]/.test(routesOut)) {
    throw new Error("Sweep routes contain an unexpected newline");
  }
  appendFileSync(githubOutput, `run=${plan.run}\ntier=${plan.tier}\nroutes=${routesOut}\n`);
}

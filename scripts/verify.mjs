#!/usr/bin/env node
// One entry point for checking a branch: node scripts/verify.mjs --help.
// docs/verification.md explains the tiers and the feature map.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAME_GAP_MS, FRAME_TRIES, frameJudge, seedInstant } from "./lib/stableFrames.mjs";
import { strayMaestro } from "./lib/strayMaestro.mjs";
import { acquire, currentHolder, ownRecord, release } from "./lib/verifyLock.mjs";
import { classify, planVerification, resolveRoutes, routeSlug } from "./lib/verifyPlan.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const STATE = join(ROOT, ".verify");
// Outside the repo, so tsc, vitest and eslint never pick up a second copy.
// Named after the checkout, so two worktrees running verify can't remove
// each other's.
const BASE_TREE = join(tmpdir(), `theshed-verify-base-${createHash("sha256").update(ROOT).digest("hex").slice(0, 8)}`);
const MAP = JSON.parse(readFileSync(join(ROOT, "scripts/verify/feature-map.json"), "utf8"));
// One for the whole Mac, outside every worktree and $TMPDIR (which a sandbox
// may move): screen runs share the simulator and the ports (verifyLock.mjs).
const LOCK_FILE = join(homedir(), ".cache/theshed-verify/verify.lock");

const HELP = `node scripts/verify.mjs [options]

  --dry-run            print the plan and stop
  --full               run everything, whatever the diff
  --only <area|/route> one area of scripts/verify/feature-map.json, or one route
  --base <ref>         compare against this ref (default origin/main)
  --unattended         unmapped files run everything instead of stopping (default when CI is set)
  --no-before          skip the before screenshots from the base
  --no-web / --no-ios  skip a platform
  --device <name>      simulator name (default "iPhone 17 Pro", or VERIFY_DEVICE)
  --app <path.app>     install this dev-client build first
  --publish            push the screenshots to the verification-artifacts branch and print PR markdown
  --publish-only       publish the last run's screenshots without running anything
  --clean              stop anything a crashed run left behind, then exit

Runs that take screenshots go one at a time on this Mac: a run waits while
another worktree's run has the simulator and ports, then starts by itself.
Start it and let it wait; don't poll for other runs.`;

const parseArgs = (argv) => {
  const flags = new Set();
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, "");
    if (["only", "base", "device", "app"].includes(name)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
      values[name] = value;
    }
    else flags.add(name);
  }
  return {
    help: flags.has("help") || flags.has("h"),
    dryRun: flags.has("dry-run"),
    full: flags.has("full"),
    clean: flags.has("clean"),
    only: values.only ?? null,
    base: values.base ?? "origin/main",
    unattended: flags.has("unattended") || Boolean(process.env.CI),
    before: !flags.has("no-before"),
    web: !flags.has("no-web"),
    ios: !flags.has("no-ios"),
    device: values.device ?? process.env.VERIFY_DEVICE ?? "iPhone 17 Pro",
    app: values.app ?? null,
    publish: flags.has("publish"),
    publishOnly: flags.has("publish-only"),
  };
};

// Another worktree's run may hold the defaults; VERIFY_*_PORT moves this one.
// Node's fetch refuses these ports (undici's bad-ports list, 1024 and up), so
// the readiness checks would time out against them.
const FETCH_BLOCKED_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);
const port = (name, value, fallback) => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`${name}=${value} isn't a port`);
  if (FETCH_BLOCKED_PORTS.has(n)) throw new Error(`${name}=${value} is a port Node's fetch refuses; pick another`);
  return n;
};
const PORTS = {
  convex: port("VERIFY_CONVEX_PORT", process.env.VERIFY_CONVEX_PORT, 3270),
  convexSite: port("VERIFY_CONVEX_SITE_PORT", process.env.VERIFY_CONVEX_SITE_PORT, 3271),
  metro: port("VERIFY_METRO_PORT", process.env.VERIFY_METRO_PORT, 8092),
  web: port("VERIFY_WEB_PORT", process.env.VERIFY_WEB_PORT, 8192),
};
const BUNDLE_ID = "au.org.sow.theshed";
const APP_SCHEME = "theshedmobile";
const DEV_CLIENT_SCHEME = "exp+the-shed-mobile";
const E2E_SECRET = "verify-only-secret";
// Both phases seed events at the same round hour, so before and after
// screenshots match, and so does a rerun within the hour.
const SEED_NOW = seedInstant(Date.now());
const INSTANCE = { name: "theshed-verify", secret: "0".repeat(64) };

const JAVA_HOME = "/opt/homebrew/opt/openjdk";
const ENV = {
  ...process.env,
  JAVA_HOME,
  PATH: `${JAVA_HOME}/bin:${homedir()}/.maestro/bin:${process.env.PATH}`,
  MAESTRO_CLI_NO_ANALYTICS: "1",
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true",
  MAESTRO_DRIVER_STARTUP_TIMEOUT: "180000",
  EXPO_NO_TELEMETRY: "1",
};

const log = (line) => console.log(`[verify] ${line}`);
const holderText = (holder) => holder
  ? `pid ${holder.pid}, ${holder.branch ?? "?"} in ${holder.root ?? "?"}, since ${holder.since ?? "?"}`
  : "a lock file nobody can read";
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", env: ENV, cwd: ROOT, ...opts }).trim();
const git = (...args) => sh("git", args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Processes this script started. Each pid file holds the pid and a marker
// from its command line, so a stale file never kills an unrelated process
// that reused the pid.
const PIDS = join(STATE, "pids");

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const commandOf = (pid) => spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();

const stopRecorded = async (name) => {
  const file = join(PIDS, `${name}.json`);
  if (!existsSync(file)) return;
  const { pid, marker } = JSON.parse(readFileSync(file, "utf8"));
  if (alive(pid) && commandOf(pid).includes(marker)) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
    for (let i = 0; i < 50 && alive(pid); i++) await sleep(100);
    if (alive(pid)) process.kill(-pid, "SIGKILL");
  }
  rmSync(file, { force: true });
};

const stopAll = async () => {
  if (!existsSync(PIDS)) return;
  for (const file of readdirSync(PIDS)) await stopRecorded(file.replace(/\.json$/, ""));
};

const portOwner = (port) =>
  spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).stdout.trim();

const start = (name, cmd, args, { cwd = ROOT, env = {}, marker, logFile }) => {
  const out = openSync(logFile, "a");
  const child = spawn(cmd, args, { cwd, env: { ...ENV, ...env }, stdio: ["ignore", out, out], detached: true });
  mkdirSync(PIDS, { recursive: true });
  writeFileSync(join(PIDS, `${name}.json`), JSON.stringify({ pid: child.pid, marker }));
  child.unref();
  return child;
};

const waitFor = async (what, check, timeoutMs) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check().catch(() => false)) return;
    await sleep(1000);
  }
  throw new Error(`${what} not ready after ${Math.round(timeoutMs / 1000)}s`);
};

const httpOk = async (url) => (await fetch(url)).ok;

const requireFreePort = (port) => {
  const owner = portOwner(port);
  if (owner) throw new Error(`port ${port} is in use by pid ${owner}, which this script didn't start`);
};

// Every PR bumps the version in these three files, which would make each one a
// full run. A change to nothing but `"version"` lines doesn't count.
const VERSION_FILES = ["package.json", "package-lock.json", "app.json"];
const versionOnly = (mergeBase, file) => {
  const lines = git("diff", "-U0", mergeBase, "--", file).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  return lines.length > 0 && lines.every((l) => /^[+-]\s*"version": "[^"]*",?$/.test(l));
};

const changedFiles = (base) => {
  const mergeBase = git("merge-base", base, "HEAD");
  // A deleted file still counts when a map rule covers its path (a deleted
  // route or screen). One whose rule went with it is left out: the files that
  // imported it changed too, and they decide the tier.
  const deleted = git("diff", "--name-only", "--diff-filter=D", mergeBase)
    .split("\n")
    .filter((file) => file && classify(file, MAP).kind === "unmapped");
  const all = [
    ...git("diff", "--name-only", mergeBase).split("\n").filter((file) => !deleted.includes(file)),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ];
  const unique = [...new Set(all.filter(Boolean))];
  const bumped = unique.filter((file) => VERSION_FILES.includes(file) && versionOnly(mergeBase, file));
  return { mergeBase, files: unique.filter((file) => !bumped.includes(file)), bumped, deleted };
};

const printPlan = (plan, mergeBase, args) => {
  log(`tier: ${plan.tier} (against ${args.base} at ${mergeBase.slice(0, 7)})`);
  for (const reason of plan.reasons) log(`  because ${reason}`);
  if (plan.unmapped.length > 0) {
    log("files no rule in scripts/verify/feature-map.json covers:");
    for (const file of plan.unmapped) log(`  ${file}`);
  }
  if (plan.tier === "blocked") return;
  log("steps:");
  log("  lint (eslint . --max-warnings 0), knip, typecheck");
  const unit = plan.unit.kind === "all" ? (plan.tier === "full" ? "all unit tests with coverage" : "all unit tests") : plan.unit.kind === "related" ? `unit tests related to ${plan.unit.files.length} file(s)` : "no unit tests";
  log(`  ${unit}`);
  if (plan.routes.length > 0) {
    const where = [args.web && `web (${plan.tier === "full" ? "four roles" : "signed out and admin"})`, args.ios && "iOS (signed out smoke, then admin)"].filter(Boolean).join(" and ");
    log(`  ${plan.routes.length} route(s) on ${where}, ${args.before ? "before and after" : "after only"}:`);
    for (const route of plan.routes) log(`    ${route}`);
  }
};

// Held from the first screen step until everything is stopped. Given back
// on every way out: return, crash, Ctrl-C, SIGTERM, a closed terminal. A run
// killed outright leaves it behind, and the next run takes it over once the
// holder's pid is gone.
let lock = null;
const releaseLock = () => {
  if (lock) release(LOCK_FILE, lock);
  lock = null;
};
const takeLock = async () => {
  const record = ownRecord({ root: ROOT, branch: git("rev-parse", "--abbrev-ref", "HEAD") });
  const started = Date.now();
  let waitedFor = null;
  await acquire(LOCK_FILE, record, {
    onWait: (holder) => {
      waitedFor = holder;
      log(`waiting for the run that has the simulator and ports: ${holderText(holder)}`);
    },
  });
  lock = record;
  const waited = Math.round((Date.now() - started) / 1000);
  return waitedFor ? `took it after waiting ${waited}s for ${holderText(waitedFor)}` : "free, taken at once";
};
process.on("exit", releaseLock);

const steps = [];
const step = async (name, fn, { soft = false } = {}) => {
  const started = Date.now();
  log(`▶ ${name}`);
  try {
    const detail = await fn();
    steps.push({ name, ok: true, seconds: Math.round((Date.now() - started) / 1000), detail: detail ?? "" });
    log(`✔ ${name}`);
    return true;
  } catch (error) {
    const detail = String(error?.message ?? error).split("\n").slice(-8).join(" ").slice(0, 400);
    steps.push({ name, ok: soft, warning: soft, seconds: Math.round((Date.now() - started) / 1000), detail });
    log(`${soft ? "⚠" : "✘"} ${name}: ${detail}`);
    if (!soft) throw new StepFailed(name);
    return false;
  }
};
class StepFailed extends Error {}

const run = (cmd, args, logFile) => () => {
  const result = spawnSync(cmd, args, { cwd: ROOT, env: ENV, encoding: "utf8" });
  writeFileSync(logFile, `${result.stdout}\n${result.stderr}`);
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed, see ${relative(ROOT, logFile)}\n${result.stdout.slice(-600)}`);
};
const npm = (script, logFile) => run("npm", ["run", "--silent", script], logFile);

const fingerprint = (dir, platform) =>
  JSON.parse(sh("npx", ["expo-updates", "fingerprint:generate", "--platform", platform], { cwd: dir })).hash;

const extractBase = (mergeBase, dir) => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync("sh", ["-c", `git archive ${mergeBase} | tar -x -C "${dir}"`], { cwd: ROOT });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
};

const convexBinary = () => {
  const dir = join(homedir(), ".cache/convex/binaries");
  const builds = existsSync(dir) ? readdirSync(dir).filter((name) => name.startsWith("precompiled-")).sort() : [];
  if (builds.length === 0) throw new Error("no Convex local backend binary in ~/.cache/convex/binaries; run `npx convex dev --local --once` once to download it");
  return join(dir, builds.at(-1), "convex-local-backend");
};

const startBackend = async (label, tree, work) => {
  const dir = join(work, "convex");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "storage"), { recursive: true });
  requireFreePort(PORTS.convex);
  requireFreePort(PORTS.convexSite);
  const binary = convexBinary();
  const adminKey = sh(binary, ["keygen", "admin-key", "--instance-name", INSTANCE.name, "--instance-secret", INSTANCE.secret]);
  start("convex", binary, [
    "--port", String(PORTS.convex), "--site-proxy-port", String(PORTS.convexSite),
    "--instance-name", INSTANCE.name, "--instance-secret", INSTANCE.secret,
    "--local-storage", join(dir, "storage"), "--disable-beacon", join(dir, "db.sqlite3"),
  ], { marker: INSTANCE.name, logFile: join(work, "logs/convex.log") });
  await waitFor("Convex backend", () => httpOk(`http://127.0.0.1:${PORTS.convex}/version`), 60_000);

  const envFile = join(dir, "env");
  writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:${PORTS.convex}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`);
  const convex = (command, rest = []) => sh("npx", ["convex", ...command, "--env-file", envFile, ...rest], { cwd: tree });
  // `convex dev` writes this backend's URLs into the tree's .env.local as
  // EXPO_PUBLIC_CONVEX_URL, which would point the checkout's own Metro at a
  // backend that's gone once verify stops. Put the file back as it was.
  const envLocal = join(tree, ".env.local");
  const envLocalBefore = existsSync(envLocal) ? readFileSync(envLocal) : null;
  try {
    convex(["dev"], ["--once", "--typecheck", "disable", "--codegen", "disable"]);
  } finally {
    if (envLocalBefore) writeFileSync(envLocal, envLocalBefore);
    else rmSync(envLocal, { force: true });
  }

  sh("node", [join(ROOT, "scripts/generate-auth-keys.mjs")], { cwd: dir });
  const settings = {
    JWT_PRIVATE_KEY: readFileSync(join(dir, "jwt_private_key.tmp"), "utf8").trim(),
    JWKS: readFileSync(join(dir, "jwks.tmp"), "utf8").trim(),
    SITE_URL: `http://127.0.0.1:${PORTS.convexSite}`,
    E2E_AUTH_ENABLED: "true",
    E2E_AUTH_SECRET: E2E_SECRET,
  };
  for (const [key, value] of Object.entries(settings)) {
    const valueFile = join(dir, `${key}.value`);
    writeFileSync(valueFile, value);
    convex(["env", "set"], [key, "--from-file", valueFile]);
  }
  sh("node", [join(ROOT, "scripts/sweep-seed.mjs")], {
    cwd: tree,
    env: { ...ENV, CONVEX_ENV_FILE: envFile, SWEEP_SEED_OUT: join(dir, "sweep-seed.json"), SWEEP_NOW: String(SEED_NOW) },
  });
  return `${label} functions on :${PORTS.convex}`;
};

const appEnv = {
  EXPO_PUBLIC_CONVEX_URL: `http://127.0.0.1:${PORTS.convex}`,
  EXPO_PUBLIC_CONVEX_SITE_URL: `http://127.0.0.1:${PORTS.convexSite}`,
  EXPO_PUBLIC_E2E: "1",
  CI: "1",
};

const CHECKS_DIR = join(ROOT, "scripts/verify/checks");
const planChecks = (areas, extension) =>
  [...new Set(areas.flatMap((name) => MAP.areas[name]?.checks ?? []))]
    .map((name) => ({ name, file: join(CHECKS_DIR, `${name}.${extension}`) }))
    .filter(({ file }) => existsSync(file));
const seedVariables = (seed) =>
  Object.entries(seed)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .flatMap(([key, value]) => ["-e", `${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}=${value}`]);

const runWeb = async (label, tree, work, routes, roles, out, checks = []) => {
  requireFreePort(PORTS.web);
  start("web", "npx", ["expo", "start", "--web", "--port", String(PORTS.web), "--clear"], {
    cwd: tree, env: appEnv, marker: `--port ${PORTS.web}`, logFile: join(work, "logs/web.log"),
  });
  try {
    await waitFor("web server", () => httpOk(`http://localhost:${PORTS.web}/`), 180_000);
    const result = spawnSync("node", [
      join(ROOT, "scripts/sweep.mjs"), "--base", `http://localhost:${PORTS.web}`, "--out", out,
      "--seed", join(work, "convex/sweep-seed.json"), "--routes", routes.join(","), "--roles", roles.join(","),
    ], { cwd: work, env: { ...ENV, SWEEP_E2E_SECRET: E2E_SECRET }, encoding: "utf8" });
    writeFileSync(join(work, "logs/sweep.log"), `${result.stdout}\n${result.stderr}`);
    const summary = result.stdout.trim().split("\n").at(-1);
    if (result.status !== 0) throw new Error(`${summary}\n${result.stdout.split("\n").filter((line) => /BROKEN|error/.test(line)).slice(0, 6).join("\n")}`);
    const passed = [];
    for (const { name, file } of checks) {
      const check = spawnSync("node", [
        file, "--base", `http://localhost:${PORTS.web}`, "--out", join(out, "checks"),
        "--seed", join(work, "convex/sweep-seed.json"),
      ], { cwd: work, env: { ...ENV, SWEEP_E2E_SECRET: E2E_SECRET }, encoding: "utf8", timeout: 5 * 60_000 });
      writeFileSync(join(work, `logs/check-${name}-web.log`), `${check.stdout}\n${check.stderr}`);
      if (check.status !== 0) throw new Error(`${summary}; check ${name} failed:\n${check.stdout.split("\n").filter((line) => line.startsWith("✘")).slice(0, 6).join("\n") || check.stderr.slice(-400)}`);
      passed.push(name);
    }
    return passed.length > 0 ? `${summary} Checks passed: ${passed.join(", ")}.` : summary;
  } finally {
    await stopRecorded("web");
  }
};

const simulator = (name) => {
  const { devices } = JSON.parse(sh("xcrun", ["simctl", "list", "devices", "available", "-j"]));
  const all = Object.values(devices).flat();
  const device = all.find((d) => d.name === name);
  if (!device) throw new Error(`no simulator named "${name}"`);
  return device.udid;
};

// Same state every run: the app's data container is emptied and the dev menu
// is told it has already been seen. The flow signs out first, which clears
// the session the app keeps in the keychain. Writing preferences with
// `simctl spawn defaults`, resetting the keychain, or wiping the container while
// the simulator was shut down each left it unable to launch apps.
const DEV_MENU_PREFS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>EXDevMenuIsOnboardingFinished</key><true/>
<key>EXDevMenuShowsAtLaunch</key><false/>
<key>EXDevMenuShowFloatingActionButton</key><false/>
</dict></plist>
`;

// bootstatus returns before apps can launch; an openurl sent then hangs. A
// throwaway launch of Settings shows when launching works.
const boot = async (udid) => {
  spawnSync("xcrun", ["simctl", "boot", udid], { encoding: "utf8" });
  sh("xcrun", ["simctl", "bootstatus", udid, "-b"], { timeout: 180_000 });
  for (let attempt = 0; attempt < 8; attempt++) {
    const probe = spawnSync("xcrun", ["simctl", "launch", udid, "com.apple.Preferences"], { encoding: "utf8", timeout: 20_000 });
    if (probe.status === 0) {
      spawnSync("xcrun", ["simctl", "terminate", udid, "com.apple.Preferences"], { timeout: 20_000 });
      return;
    }
    await sleep(5000);
  }
  throw new Error("the simulator booted but won't launch apps; shut it down and rerun");
};

const resetApp = async (udid, appPath) => {
  await boot(udid);
  if (appPath) sh("xcrun", ["simctl", "install", udid, appPath]);
  const installed = spawnSync("xcrun", ["simctl", "get_app_container", udid, BUNDLE_ID, "data"], { encoding: "utf8" });
  if (installed.status !== 0) throw new Error(`${BUNDLE_ID} isn't on the simulator; build a dev client with \`npx expo run:ios --no-bundler\` and pass --app`);
  const data = installed.stdout.trim();
  spawnSync("xcrun", ["simctl", "terminate", udid, BUNDLE_ID], { timeout: 20_000 });
  const emptyDir = (dir, keepSubdirs) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (keepSubdirs && entry.isDirectory()) emptyDir(path, false);
      else rmSync(path, { recursive: true, force: true });
    }
  };
  emptyDir(join(data, "Documents"), false);
  emptyDir(join(data, "tmp"), false);
  emptyDir(join(data, "Library"), true);
  for (const dir of ["Documents", "tmp", "Library/Caches", "Library/Preferences"]) mkdirSync(join(data, dir), { recursive: true });
  writeFileSync(join(data, "Library/Preferences", `${BUNDLE_ID}.plist`), DEV_MENU_PREFS);
};

// Maestro's waitForAnimationToEnd allows a little movement, which left some
// screenshots mid-transition. So the flow takes frames and asks the frame
// server after each one whether the screen has settled (stableFrames.mjs).
const SETTLE_SCRIPT = `const answer = json(http.post(FRAMES_URL + "?name=" + encodeURIComponent(NAME), { body: "" }).body);
output.settled = answer.settled;
`;

const iosFlow = (routes, smoke, out, adminEmail) => {
  const link = (path) => `${APP_SCHEME}://${path.replace(/^\//, "")}`;
  const visit = (prefix, { template, route }, signedIn = false) => [
    `- openLink: "${link(route)}"`,
    "- waitForAnimationToEnd:",
    "    timeout: 8000",
    "- evalScript: ${output.settled = false}",
    "- repeat:",
    "    while:",
    "      true: ${!output.settled}",
    `    times: ${FRAME_TRIES}`,
    "    commands:",
    `      - takeScreenshot: "${join(out, `${prefix}-${routeSlug(template)}.frame`)}"`,
    "      - runScript:",
    "          file: settle.js",
    "          env:",
    `            NAME: "${prefix}-${routeSlug(template)}"`,
    // Still moving: give it a moment before the next frame, so a screen that
    // is still loading (a lazy screen Metro builds on first open) can finish.
    "      - runFlow:",
    "          when:",
    "            true: ${!output.settled}",
    "          commands:",
    "            - waitForAnimationToEnd:",
    `                timeout: ${FRAME_GAP_MS}`,
    "- assertNotVisible:",
    '    text: "(?i).*(something went wrong|configuration error|unmatched route|\\\\(ESC\\\\)).*"',
    ...(signedIn ? ["- assertNotVisible:", '    text: "(?i).*sign in with your sow account.*"'] : []),
  ];
  const lines = [
    `appId: ${BUNDLE_ID}`,
    "---",
    `- openLink: "${link("e2e-auth?signout=1")}"`,
    "- waitForAnimationToEnd:",
    "    timeout: 8000",
    ...smoke.flatMap((route) => visit("out", { template: route, route })),
    `- openLink: "${link(`e2e-auth?email=${encodeURIComponent(adminEmail)}&secret=${E2E_SECRET}`)}"`,
    "- waitForAnimationToEnd:",
    "    timeout: 8000",
    `- openLink: "${link("home")}"`,
    "- extendedWaitUntil:",
    "    notVisible: \"Sign in\"",
    "    timeout: 15000",
    "- assertNotVisible: \"Sign in\"",
    ...routes.filter(({ route }) => !route.startsWith("/checkin/not-") && route !== "/no-such-page").flatMap((r) => visit("admin", r, true)),
  ];
  return `${lines.join("\n")}\n`;
};

// Answers the flow's "has it settled?" after each frame. The settled frame
// becomes the screenshot.
const startFrameServer = async (out) => {
  const { judge, moving } = frameJudge();
  const server = createServer((req, res) => {
    const name = new URL(req.url, "http://localhost").searchParams.get("name") ?? "";
    const frame = join(out, `${name}.frame.png`);
    let answer;
    try {
      if (!/^[\w-]+$/.test(name) || !existsSync(frame)) throw new Error(`no frame named "${name}"`);
      answer = judge(name, readFileSync(frame));
      if (answer.settled) renameSync(frame, join(out, `${name}.png`));
    } catch (error) {
      res.writeHead(400).end(JSON.stringify({ error: String(error?.message ?? error) }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answer));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/frame`, moving, close: () => server.close() };
};

// The status bar shows the same time, signal and battery in every screenshot.
const STATUS_BAR = ["--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "charged", "--batteryLevel", "100"];

// A Maestro left on this simulator by a run that has gone fights this run's
// driver: screenshots hang, or Maestro quits without a word. This run holds
// the verify lock, so any such process is stale (strayMaestro.mjs).
const stopStrayMaestro = async (udid) => {
  const pids = strayMaestro(spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" }).stdout ?? "", udid);
  if (pids.length === 0) return;
  log(`stopping ${pids.length} Maestro process(es) a finished run left on the simulator: ${pids.join(", ")}`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  await sleep(5000);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Gone after SIGTERM.
    }
  }
};

// Async, because the frame server answers the flow from this process.
const runMaestro = (args, opts) => new Promise((resolve, reject) => {
  const child = spawn("maestro", args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGTERM"), opts.timeout);
  child.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on("close", (status) => {
    clearTimeout(timer);
    resolve({ status, stdout, stderr });
  });
});

const runIos = async (label, tree, work, routes, smoke, out, udid, checks = []) => {
  requireFreePort(PORTS.metro);
  const metroLog = join(work, "logs/metro.log");
  let frames;
  start("metro", "npx", ["expo", "start", "--dev-client", "--port", String(PORTS.metro), "--clear"], {
    cwd: tree, env: appEnv, marker: `--port ${PORTS.metro}`, logFile: metroLog,
  });
  try {
    await waitFor("Metro", async () => (await (await fetch(`http://localhost:${PORTS.metro}/status`)).text()).includes("running"), 180_000);
    const devClientUrl = `${DEV_CLIENT_SCHEME}://expo-development-client/?url=${encodeURIComponent(`http://localhost:${PORTS.metro}`)}`;
    sh("xcrun", ["simctl", "openurl", udid, devClientUrl], { timeout: 60_000 });
    await waitFor("iOS bundle", async () => /iOS Bundled/.test(readFileSync(metroLog, "utf8")), 300_000);
    await sleep(5000);
    mkdirSync(out, { recursive: true });
    const seed = JSON.parse(readFileSync(join(work, "convex/sweep-seed.json"), "utf8"));
    const flowFile = join(work, "ios-flow.yaml");
    writeFileSync(flowFile, iosFlow(routes, smoke, out, seed.people.admin));
    writeFileSync(join(work, "settle.js"), SETTLE_SCRIPT);
    frames = await startFrameServer(out);
    await stopStrayMaestro(udid);
    sh("xcrun", ["simctl", "status_bar", udid, "override", ...STATUS_BAR]);
    const result = await runMaestro(["--device", udid, "test", flowFile, "--test-output-dir", join(work, "maestro"), "-e", `FRAMES_URL=${frames.url}`], {
      cwd: work, env: ENV, timeout: 20 * 60_000,
    });
    writeFileSync(join(work, "logs/maestro.log"), `${result.stdout}\n${result.stderr}`);
    if (result.status !== 0) throw new Error(`maestro failed, see ${relative(ROOT, join(work, "logs/maestro.log"))}\n${result.stdout.split("\n").filter((line) => /FAILED|Assertion|not visible|is visible/i.test(line)).slice(0, 4).join("\n")}`);
    const passed = [];
    for (const { name, file } of checks) {
      mkdirSync(join(out, "checks"), { recursive: true });
      const check = await runMaestro(["--device", udid, "test", file, "--test-output-dir", join(work, "maestro"), ...seedVariables(seed), "-e", `OUT=${join(out, "checks")}`], {
        cwd: work, env: ENV, timeout: 5 * 60_000,
      });
      writeFileSync(join(work, `logs/check-${name}-ios.log`), `${check.stdout}\n${check.stderr}`);
      if (check.status !== 0) throw new Error(`check ${name} failed, see ${relative(ROOT, join(work, `logs/check-${name}-ios.log`))}\n${check.stdout.split("\n").filter((line) => /FAILED|Assertion|not visible|is visible/i.test(line)).slice(0, 4).join("\n")}`);
      passed.push(name);
    }
    const checked = passed.length > 0 ? `; checks passed: ${passed.join(", ")}` : "";
    const shots = readdirSync(out).filter((f) => f.endsWith(".png") && !f.endsWith(".frame.png")).length;
    return (frames.moving.length > 0 ? `${shots} screenshots; still moving after ${FRAME_TRIES} frames: ${frames.moving.join(", ")}` : `${shots} screenshots, every one settled`) + checked;
  } finally {
    frames?.close();
    spawnSync("xcrun", ["simctl", "status_bar", udid, "clear"]);
    spawnSync("xcrun", ["simctl", "terminate", udid, BUNDLE_ID]);
    await stopRecorded("metro");
  }
};

const branchSlug = () => git("rev-parse", "--abbrev-ref", "HEAD").replace(/[^a-z0-9._-]+/gi, "-");

const publish = (artifacts, slug) => {
  const branch = "verification-artifacts";
  const index = join(STATE, "publish.index");
  rmSync(index, { force: true });
  const env = { ...ENV, GIT_INDEX_FILE: index };
  spawnSync("git", ["fetch", "origin", branch], { cwd: ROOT, encoding: "utf8" });
  const parent = spawnSync("git", ["rev-parse", "--verify", `origin/${branch}`], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  if (parent) sh("git", ["read-tree", parent], { env });
  const pngs = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".png")) pngs.push(path);
    }
  };
  walk(artifacts);
  for (const png of pngs) {
    const blob = sh("git", ["hash-object", "-w", png]);
    sh("git", ["update-index", "--add", "--cacheinfo", `100644,${blob},${slug}/${relative(artifacts, png)}`], { env });
  }
  const table = (url) => {
    const rows = [];
    for (const platform of ["web", "ios"]) {
      const afterDir = join(artifacts, "after", platform);
      if (!existsSync(afterDir)) continue;
      for (const file of readdirSync(afterDir).filter((f) => f.endsWith(".png")).sort()) {
        const before = existsSync(join(artifacts, "before", platform, file)) ? `<img src="${url(`before/${platform}/${file}`)}" width="260">` : "(none)";
        rows.push(`| ${platform} \`${file.replace(/\.png$/, "")}\` | ${before} | <img src="${url(`after/${platform}/${file}`)}" width="260"> |`);
      }
    }
    return ["| Screen | Before | After |", "| --- | --- | --- |", ...rows].join("\n");
  };
  // The branch keeps the whole table with relative links, since a PR body
  // can't hold every screen.
  const readme = `${readFileSync(join(artifacts, "summary.md"), "utf8")}\n## Screenshots\n\n${table((path) => path)}\n`;
  const readmeBlob = sh("git", ["hash-object", "-w", "--stdin"], { input: readme });
  sh("git", ["update-index", "--add", "--cacheinfo", `100644,${readmeBlob},${slug}/README.md`], { env });
  const tree = sh("git", ["write-tree"], { env });
  const commit = sh("git", ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", `screenshots for ${slug}`], { env });
  sh("git", ["push", "origin", `${commit}:refs/heads/${branch}`]);
  const repo = sh("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  writeFileSync(join(artifacts, "screenshots.md"), `${table((path) => `https://raw.githubusercontent.com/${repo}/${commit}/${slug}/${path}`)}\n`);
  writeFileSync(join(artifacts, "screenshots-url.txt"), `https://github.com/${repo}/blob/${commit}/${slug}/README.md\n`);
  return `${pngs.length} images at ${commit.slice(0, 7)}; table in ${relative(ROOT, join(artifacts, "screenshots.md"))}, all of them at https://github.com/${repo}/blob/${commit}/${slug}/README.md`;
};

let started = false;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  mkdirSync(STATE, { recursive: true });
  writeFileSync(join(STATE, ".gitignore"), "*\n");
  if (args.clean) {
    await stopAll();
    rmSync(BASE_TREE, { recursive: true, force: true });
    log("stopped anything left from an earlier run");
    return 0;
  }

  if (args.publishOnly) {
    const artifacts = join(STATE, "artifacts", branchSlug());
    if (!existsSync(join(artifacts, "summary.md"))) throw new Error(`no finished run in ${relative(ROOT, artifacts)}`);
    log(publish(artifacts, branchSlug()));
    return 0;
  }
  const { mergeBase, files, bumped, deleted } = changedFiles(args.base);
  if (bumped.length > 0) log(`version bump only, not counted: ${bumped.join(", ")}`);
  if (deleted.length > 0) log(`deleted with no map rule left, not counted (their importers are): ${deleted.join(", ")}`);
  const plan = planVerification({ changed: files, map: MAP, full: args.full, only: args.only, unattended: args.unattended });
  printPlan(plan, mergeBase, args);
  const holder = currentHolder(LOCK_FILE);
  if (plan.routes.length > 0) log(holder ? `verify lock: held by ${holderText(holder)}; this run will wait for it` : "verify lock: free");
  if (plan.tier === "blocked") {
    log("Classify each file above in scripts/verify/feature-map.json (an area, a new area with its routes, core, or static), then rerun.");
    return 3;
  }
  if (args.dryRun) return 0;

  started = true;
  await stopAll();
  rmSync(BASE_TREE, { recursive: true, force: true });
  const slug = branchSlug();
  const artifacts = join(STATE, "artifacts", slug);
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(join(artifacts, "logs"), { recursive: true });
  writeFileSync(join(artifacts, "plan.json"), JSON.stringify({ base: args.base, mergeBase, changed: files, ...plan }, null, 2));

  const logs = join(artifacts, "logs");
  const baseTree = BASE_TREE;
  let failed = false;
  try {
    await step("base tree", () => extractBase(mergeBase, baseTree));
    await step("native fingerprint", () => {
      const changed = ["ios", "android"].filter((platform) => fingerprint(baseTree, platform) !== fingerprint(ROOT, platform));
      if (changed.length === 0) return "unchanged on iOS and Android: over-the-air updates reach current builds";
      throw new Error(`changed on ${changed.join(" and ")}: phones there need a store build before they get this change`);
    }, { soft: true });
    await step("lint", run("npx", ["eslint", ".", "--max-warnings", "0"], join(logs, "lint.log")));
    await step("unused code (knip)", run("npx", ["knip"], join(logs, "knip.log")));
    await step("typecheck", npm("typecheck", join(logs, "typecheck.log")));
    if (plan.unit.kind === "all") {
      await step(plan.tier === "full" ? "unit tests with coverage" : "unit tests", npm(plan.tier === "full" ? "test:coverage" : "test", join(logs, "unit.log")));
    } else if (plan.unit.kind === "related" && plan.unit.files.length > 0) {
      await step("related unit tests", () => {
        const result = spawnSync("npx", ["vitest", "related", "--run", ...plan.unit.files], { cwd: ROOT, env: ENV, encoding: "utf8" });
        writeFileSync(join(logs, "unit.log"), `${result.stdout}\n${result.stderr}`);
        if (result.status !== 0) throw new Error(result.stdout.slice(-600));
        return result.stdout.match(/Tests\s+(.*)/)?.[1] ?? "";
      });
    }

    if (plan.routes.length > 0 && (args.web || args.ios)) {
      await step("verify lock", takeLock);
      if (args.web) await step("Playwright Chromium", () => void sh("npx", ["playwright", "install", "chromium"]));
      const udid = args.ios ? simulator(args.device) : null;
      const roles = plan.tier === "full" ? ["out", "leader", "staff", "admin"] : ["out", "admin"];
      for (const label of args.before ? ["before", "after"] : ["after"]) {
        const tree = label === "before" ? baseTree : ROOT;
        const work = join(STATE, "run", label);
        rmSync(work, { recursive: true, force: true });
        mkdirSync(join(work, "logs"), { recursive: true });
        const soft = label === "before";
        try {
          await step(`${label}: local backend`, () => startBackend(label, tree, work), { soft });
          if (steps.at(-1).warning) continue;
          const seed = JSON.parse(readFileSync(join(work, "convex/sweep-seed.json"), "utf8"));
          const routes = resolveRoutes(plan.routes, seed);
          if (args.web) await step(`${label}: web`, () => runWeb(label, tree, work, plan.routes, roles, join(artifacts, label, "web"), planChecks(plan.areas, "web.mjs")), { soft });
          if (args.ios) {
            await step(`${label}: iOS reset`, () => resetApp(udid, args.app), { soft });
            await step(`${label}: iOS`, () => runIos(label, tree, work, routes, MAP.smoke, join(artifacts, label, "ios"), udid, planChecks(plan.areas, "ios.yaml")), { soft });
          }
        } finally {
          for (const file of readdirSync(join(work, "logs"))) copyFileSync(join(work, "logs", file), join(logs, `${label}-${file}`));
          await stopRecorded("convex");
        }
      }
    }
  } catch (error) {
    if (!(error instanceof StepFailed)) {
      steps.push({ name: "verify", ok: false, detail: String(error?.stack ?? error).slice(0, 400) });
      log(`✘ ${error?.message ?? error}`);
    }
    failed = true;
  } finally {
    await stopAll();
    releaseLock();
    rmSync(baseTree, { recursive: true, force: true });
  }

  const summary = [
    `# verify: ${plan.tier}`,
    "",
    ...plan.reasons.map((reason) => `- because ${reason}`),
    ...(plan.unmapped.length ? ["", "Unmapped files (add them to scripts/verify/feature-map.json):", ...plan.unmapped.map((f) => `- \`${f}\``)] : []),
    "",
    "| Step | Result | Time | Detail |",
    "| --- | --- | --- | --- |",
    ...steps.map((s) => `| ${s.name} | ${s.warning ? "⚠ warning" : s.ok ? "✔ pass" : "✘ fail"} | ${s.seconds ?? "-"}s | ${String(s.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
    "",
  ].join("\n");
  writeFileSync(join(artifacts, "summary.md"), summary);
  console.log(`\n${summary}`);
  log(`artifacts: ${artifacts}`);
  const passed = !failed && steps.every((s) => s.ok);
  if (args.publish && passed) {
    try {
      log(`published ${publish(artifacts, slug)}`);
    } catch (error) {
      log(`✘ publish: ${error?.message ?? error}`);
      return 1;
    }
  } else if (args.publish) {
    log("not publishing: the run failed");
  }
  return passed ? 0 : 1;
};

const stopAndExit = (code) => (started ? stopAll() : Promise.resolve()).finally(() => process.exit(code));
process.on("SIGINT", () => stopAndExit(130));
process.on("SIGTERM", () => stopAndExit(143));
process.on("SIGHUP", () => stopAndExit(129));
main().then((code) => process.exit(code), (error) => {
  console.error(`[verify] ${error?.message ?? error}`);
  return stopAndExit(1);
});

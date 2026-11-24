#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { frameJudge } from "./lib/stableFrames.mjs";
import { allRoutes, resolveRoutes, routeSlug } from "./lib/verifyPlan.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const BASE = arg("base", "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out", "sweep");
const SECRET = process.env.SWEEP_E2E_SECRET || "sweep-only-secret";
const SEED = arg("seed", "sweep-seed.json");
const seed = existsSync(SEED) ? JSON.parse(readFileSync(SEED, "utf8")) : null;

const roleArg = arg("roles", null)?.split(",");
const roles = [
  ["out", null],
  ["leader", process.env.SWEEP_LEADER ?? seed?.people.leader ?? null],
  ["staff", process.env.SWEEP_STAFF ?? seed?.people.staff ?? null],
  ["admin", process.env.SWEEP_ADMIN ?? seed?.people.admin ?? null],
].filter(([role]) => !roleArg || roleArg.includes(role));
const missingRoles = roles.filter(([role, email]) => role !== "out" && !email).map(([role]) => role);
if (missingRoles.length > 0) {
  console.error(
    `No identity for ${missingRoles.join(", ")}. Run scripts/sweep-seed.mjs first or set SWEEP_LEADER, SWEEP_STAFF and SWEEP_ADMIN.`
  );
  process.exit(2);
}

const map = JSON.parse(readFileSync(new URL("./verify/feature-map.json", import.meta.url), "utf8"));
const routeArg = arg("routes", null);
const routes = resolveRoutes(routeArg ? routeArg.split(",") : allRoutes(map), seed);

const BROKEN = /something went wrong|unmatched route|this screen doesn't exist|configuration error/i;
const SIGNED_OUT = /sign in with your sow account/i;
const EXPECTED_MISSING = new Set(["/no-such-page", "/checkin/not-a-real-link"]);
const HARMLESS_CONSOLE = [/expo-notifications/i, /useNativeDriver/i, /Failed to load resource.*favicon/i];
const READY_TIMEOUT_MS = 15_000;
const STABLE_FOR_MS = 1_000;

const hasSession = () =>
  page.evaluate(() =>
    Object.keys(window.localStorage).some(
      (key) => key.startsWith("__convexAuthJWT_") && (window.localStorage.getItem(key) ?? "").length > 20
    )
  );

const bundling = new Map();
const BUNDLE_WAIT_MS = 60_000;
let bundleBudgetMs = 120_000;
const isBundle = (request) => new URL(request.url()).pathname.endsWith(".bundle");
const watchBundles = (page) => {
  page.on("request", (request) => isBundle(request) && bundling.set(request, Date.now()));
  page.on("requestfinished", (request) => bundling.delete(request));
  page.on("requestfailed", (request) => bundling.delete(request));
};

const waitUntilSettled = async () => {
  let started = Date.now();
  let last = "";
  let stableSince = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    for (const [request, since] of bundling) if (Date.now() - since > BUNDLE_WAIT_MS) bundling.delete(request);
    if (bundling.size > 0 && bundleBudgetMs > 0) {
      await page.waitForTimeout(200);
      bundleBudgetMs -= 200;
      started = Date.now();
      stableSince = Date.now();
      continue;
    }
    const text = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " "))
      .catch(() => "");
    const loading = await page
      .evaluate(() => Boolean(document.querySelector('[aria-busy="true"], [role="progressbar"]')))
      .catch(() => false);
    if (text !== last || loading || text.trim().length === 0) {
      last = text;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= STABLE_FOR_MS) {
      return true;
    }
    await page.waitForTimeout(200);
  }
  return false;
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await context.newPage();
watchBundles(page);
const results = [];

const settle = (ms) => page.waitForTimeout(ms);

// The text can be still while something still moves (a spinner, a sliding
// tab), so the screenshot waits for two identical frames as well.
const FRAME_GAP_MS = 150;
const frames = frameJudge();
const screenshot = async (name) => {
  for (;;) {
    const frame = await page.screenshot();
    if (frames.judge(name, frame).settled) return writeFileSync(`${OUT}/${name}.png`, frame);
    await page.waitForTimeout(FRAME_GAP_MS);
  }
};

const WARM_UP_TIMEOUT_MS = 180_000;
await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded", timeout: WARM_UP_TIMEOUT_MS }).catch(() => {});
await page
  .waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: WARM_UP_TIMEOUT_MS })
  .catch(() => {});
await waitUntilSettled();

for (const [role, email] of roles) {
  await page.goto(`${BASE}/e2e-auth?signout=1`, { waitUntil: "domcontentloaded" });
  await settle(2500);
  if (email) {
    await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(email)}&secret=${encodeURIComponent(SECRET)}`, {
      waitUntil: "domcontentloaded",
    });
    await waitUntilSettled();
    if (!(await hasSession())) {
      results.push({ role, route: "(sign-in)", bad: true, errors: ["e2e sign-in did not take"], consoleErrors: [], text: "" });
      continue;
    }
  }
  for (const { template, route } of routes) {
    const errors = [];
    const consoleErrors = [];
    const onError = (error) => errors.push(String(error).slice(0, 300));
    const onConsole = (message) => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
    };
    page.on("pageerror", onError);
    page.on("console", onConsole);
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
      if (!(await waitUntilSettled())) errors.push(`still changing after ${READY_TIMEOUT_MS / 1000}s`);
    } catch (error) {
      errors.push(`navigation: ${String(error).slice(0, 200)}`);
    }
    const text = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300))
      .catch(() => "");
    const expectedMissing = EXPECTED_MISSING.has(route);
    const lostSession = email !== null && (SIGNED_OUT.test(text) || !(await hasSession()));
    if (lostSession) errors.push("landed signed out");
    await screenshot(`${role}-${routeSlug(template)}`).catch(() => {});
    // After the screenshot, so an error during the frame wait still counts.
    const unexpectedConsole = expectedMissing
      ? []
      : consoleErrors.filter((message) => !HARMLESS_CONSOLE.some((pattern) => pattern.test(message)));
    const bad =
      (BROKEN.test(text) && !expectedMissing) || errors.length > 0 || unexpectedConsole.length > 0;
    page.off("pageerror", onError);
    page.off("console", onConsole);
    results.push({ role, route, landed: page.url().replace(BASE, ""), bad, errors, consoleErrors, text });
  }
}

await browser.close();

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const broken = results.filter((r) => r.bad);
for (const r of results) {
  const flags = [r.bad ? "BROKEN" : "ok", r.consoleErrors.length ? `${r.consoleErrors.length} console error(s)` : ""]
    .filter(Boolean)
    .join(", ");
  console.log(`${r.role.padEnd(7)} ${r.route.padEnd(52)} ${flags}`);
  for (const e of r.errors) console.log(`        page error: ${e}`);
  for (const e of r.consoleErrors.slice(0, 2)) console.log(`        console: ${e}`);
}
const moving = frames.moving.length > 0 ? `, still moving: ${frames.moving.join(", ")}` : "";
console.log(`\n${results.length} screens, ${broken.length} broken${moving}.`);
if (broken.length > 0) process.exit(1);

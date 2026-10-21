#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const BASE = arg("base", "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out", "sweep");
const SECRET = process.env.SWEEP_E2E_SECRET || "sweep-only-secret";
const seed = existsSync("sweep-seed.json") ? JSON.parse(readFileSync("sweep-seed.json", "utf8")) : null;

const roles = [
  ["out", null],
  ["leader", process.env.SWEEP_LEADER ?? seed?.people.leader ?? null],
  ["staff", process.env.SWEEP_STAFF ?? seed?.people.staff ?? null],
  ["admin", process.env.SWEEP_ADMIN ?? seed?.people.admin ?? null],
];
const missingRoles = roles.filter(([role, email]) => role !== "out" && !email).map(([role]) => role);
if (missingRoles.length > 0) {
  console.error(
    `No identity for ${missingRoles.join(", ")}. Run scripts/sweep-seed.mjs first or set SWEEP_LEADER, SWEEP_STAFF and SWEEP_ADMIN.`
  );
  process.exit(2);
}

const routes = [
  "/",
  "/home",
  "/notifications",
  "/announcements",
  "/profile",
  "/org",
  "/churches",
  "/review",
  "/all",
  "/design-requests",
  "/design-requests/new",
  "/event-requests",
  "/event-requests/new",
  "/edit-home",
  "/attendance",
  ...(seed ? [`/attendance/event/${seed.eventId}`, `/attendance/member/member%3A${seed.memberId}`] : []),
  ...(seed?.checkInToken ? [`/checkin/${seed.checkInToken}`] : []),
  "/checkin/not-a-real-link",
  "/insights?tab=general",
  "/insights?tab=attendance",
  "/admin",
  "/no-such-page",
];

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

const waitUntilSettled = async () => {
  const started = Date.now();
  let last = "";
  let stableSince = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
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
const results = [];

const settle = (ms) => page.waitForTimeout(ms);

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
  for (const route of routes) {
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
    const unexpectedConsole = expectedMissing
      ? []
      : consoleErrors.filter((message) => !HARMLESS_CONSOLE.some((pattern) => pattern.test(message)));
    const lostSession = email !== null && (SIGNED_OUT.test(text) || !(await hasSession()));
    if (lostSession) errors.push("landed signed out");
    const bad =
      (BROKEN.test(text) && !expectedMissing) || errors.length > 0 || unexpectedConsole.length > 0;
    const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "root";
    await page.screenshot({ path: `${OUT}/${role}-${slug}.png` }).catch(() => {});
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
console.log(`\n${results.length} screens, ${broken.length} broken.`);
if (broken.length > 0) process.exit(1);

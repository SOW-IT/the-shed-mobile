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
const SETTLE_MS = Number(arg("settle", "3000"));
const seed = existsSync("sweep-seed.json") ? JSON.parse(readFileSync("sweep-seed.json", "utf8")) : null;

const roles = [
  ["out", null],
  ["leader", process.env.SWEEP_LEADER ?? seed?.people.leader ?? null],
  ["staff", process.env.SWEEP_STAFF ?? seed?.people.staff ?? null],
  ["admin", process.env.SWEEP_ADMIN ?? seed?.people.admin ?? null],
].filter(([, email], i) => i === 0 || email);

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
  "/insights?tab=general",
  "/insights?tab=attendance",
  "/admin",
  "/no-such-page",
];

const BROKEN = /something went wrong|unmatched route|this screen doesn't exist|configuration error/i;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await context.newPage();
const results = [];

const settle = (ms) => page.waitForTimeout(ms);

for (const [role, email] of roles) {
  await page.goto(`${BASE}/e2e-auth?signout=1`, { waitUntil: "domcontentloaded" });
  await settle(2500);
  if (email) {
    await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(email)}&secret=${encodeURIComponent(SECRET)}`, {
      waitUntil: "domcontentloaded",
    });
    await settle(3500);
    const signedIn = !/sign in with your sow account/i.test(await page.evaluate(() => document.body.innerText));
    if (!signedIn) {
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
      await settle(SETTLE_MS);
    } catch (error) {
      errors.push(`navigation: ${String(error).slice(0, 200)}`);
    }
    const text = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300))
      .catch(() => "");
    const expectedMissing = route === "/no-such-page";
    const bad = (BROKEN.test(text) && !expectedMissing) || errors.length > 0;
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

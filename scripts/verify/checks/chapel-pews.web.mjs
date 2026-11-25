#!/usr/bin/env node
// In the Chapel: a pew sits you without asking about Devotionals, the
// lectern stands you behind it facing the room, and a second tap there asks.
// The World's accessible targets don't take clicks themselves (the stage
// above them does), so a click lands at a target's middle, as a finger
// would. The pew has no target: it's the front left pew's middle seat, at
// 25% across and 61% down the stage (Garden.tsx's camera, any phone shape).
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-chapel-pews";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
const WALK_MS = 20_000;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const shot = (name) => page.screenshot({ path: `${OUT}/chapel-${name}.png` });
const dialog = () => page.getByTestId("world-devotional-dialog");
const me = () => page.getByTestId("world-me");
const clickMiddle = async (locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const tapPew = async () => {
  const stage = await page.getByTestId("world-stage").boundingBox();
  await page.mouse.click(stage.x + stage.width * 0.25, stage.y + stage.height * 0.61);
};
const waitForMe = (label) =>
  page.waitForFunction((want) => document.querySelector('[data-testid="world-me"]')?.getAttribute("aria-label") === want, label, { timeout: WALK_MS }).then(
    () => true,
    () => false
  );

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world`);
  await page.getByTestId("world-title").waitFor();
  await me().waitFor({ state: "attached" });
  await clickMiddle(page.getByLabel("Go to The Chapel"));
  await page.getByLabel(/^Lectern/).waitFor({ state: "attached" });
  await page.waitForTimeout(1500);
  await shot("arrived");

  // A pew: seated, and nothing asks about Devotionals.
  await tapPew();
  if (!(await waitForMe("You, sitting"))) failures.push(`pew: not seated (${await me().getAttribute("aria-label")})`);
  await page.waitForTimeout(1500);
  await shot("pew-seated");
  if (await dialog().isVisible()) {
    failures.push("pew: Devotionals asked");
    await page.getByTestId("world-devotional-cancel").click();
  }

  // The lectern: behind it, facing the room, and nothing asks yet.
  await clickMiddle(page.getByLabel(/^Lectern/));
  if (!(await waitForMe("You, behind the lectern, facing the room"))) failures.push(`lectern: not behind it facing the room (${await me().getAttribute("aria-label")})`);
  await page.waitForTimeout(800);
  await shot("lectern");
  if (await dialog().isVisible()) {
    failures.push("lectern: Devotionals asked on the first tap");
    await page.getByTestId("world-devotional-cancel").click();
  }

  // Again, standing there: Devotionals asks.
  await clickMiddle(page.getByLabel(/^Lectern/));
  const asked = await dialog().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  await shot("lectern-again");
  if (!asked) failures.push("lectern again: Devotionals didn't ask");
  else await page.getByTestId("world-devotional-cancel").click();
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await shot("failed").catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? "Chapel: a pew seats you without asking, the lectern stands you facing the room, and a second tap opens Devotionals." : `${failures.length} step(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);

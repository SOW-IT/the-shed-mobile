#!/usr/bin/env node
// The World on web fills the browser window, the way it fills the phone: no
// sidebar beside it and no band around it, in the Garden and in a backyard,
// at a desktop, a tall and an ultrawide window. One page is resized between
// them, so this also shows the scene following the window. The HUD (title,
// chat log and chat box) stays inside the window at every size.
// The World's accessible targets don't take clicks themselves (the stage
// above them does), so a pad is clicked at its middle, as a finger would.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-world-fullscreen";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;

const WINDOWS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tall", width: 800, height: 1200 },
  { name: "ultrawide", width: 1920, height: 900 },
];
const HUD = ["world-title", "world-log-row", "world-chat-input"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];
const page = await browser.newPage({ viewport: { width: WINDOWS[0].width, height: WINDOWS[0].height } });
page.setDefaultTimeout(TIMEOUT_MS);

const titled = (pattern) =>
  page.waitForFunction((source) => new RegExp(source).test(document.querySelector('[data-testid="world-title"]')?.textContent ?? ""), pattern.source, { timeout: 30_000 }).then(
    () => true,
    () => false
  );
const menu = async (entry) => {
  await page.getByTestId("world-title").click();
  await page.getByTestId("world-menu").waitFor();
  const item = page.getByTestId(`world-menu-${entry}`);
  if ((await item.count()) > 0) {
    await item.click();
    return true;
  }
  await page.getByTestId("world-menu-close").click();
  return false;
};
const clickMiddle = async (locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const toGarden = async () => {
  if (/Garden/.test((await page.getByTestId("world-title").textContent()) ?? "")) return true;
  await menu("garden");
  return titled(/Garden/);
};
const intoBackyard = async () => {
  if (/backyard/i.test((await page.getByTestId("world-title").textContent()) ?? "")) return true;
  await menu("home");
  await titled(/home/i);
  const pad = page.getByLabel("Go to Backyard");
  await pad.waitFor({ state: "attached" });
  await page.waitForTimeout(800);
  await clickMiddle(pad);
  return titled(/backyard/i);
};

/** The stage fills the window, and the HUD is on screen inside it. */
const fills = async (scene, { name, width, height }) => {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${OUT}/world-${scene}-${name}-${width}x${height}.png` });
  const stage = await page.getByTestId("world-stage").first().boundingBox();
  if (!stage) {
    failures.push(`${scene} ${name}: no stage`);
    return;
  }
  const off = [stage.x, stage.y, width - (stage.x + stage.width), height - (stage.y + stage.height)].map((n) => Math.round(n));
  if (off.some((n) => Math.abs(n) > 1)) {
    failures.push(`${scene} ${name}: the scene is ${Math.round(stage.width)}x${Math.round(stage.height)} at (${Math.round(stage.x)}, ${Math.round(stage.y)}), not the whole ${width}x${height} window`);
  }
  for (const id of HUD) {
    const box = await page.getByTestId(id).first().boundingBox();
    if (!box) failures.push(`${scene} ${name}: ${id} isn't showing`);
    else if (box.x < 0 || box.y < 0 || box.x + box.width > width + 1 || box.y + box.height > height + 1) {
      failures.push(`${scene} ${name}: ${id} runs off the window (${Math.round(box.x)}, ${Math.round(box.y)}, ${Math.round(box.width)}x${Math.round(box.height)})`);
    }
  }
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world`);
  await page.getByTestId("world-title").waitFor();
  await page.getByTestId("world-me").waitFor({ state: "attached" });
  await page.waitForTimeout(1_500);

  if (!(await toGarden())) failures.push("didn't get to the Garden");
  for (const window of WINDOWS) await fills("garden", window);

  await page.setViewportSize({ width: WINDOWS[0].width, height: WINDOWS[0].height });
  if (!(await intoBackyard())) failures.push("didn't get into the backyard");
  else for (const window of WINDOWS) await fills("backyard", window);
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await page.screenshot({ path: `${OUT}/failed.png` }).catch(() => {});
} finally {
  // Back to the Garden: the checks after this one (and the iOS ones, on the
  // same account) start from wherever you were left.
  await page.setViewportSize({ width: WINDOWS[0].width, height: WINDOWS[0].height }).catch(() => {});
  await toGarden().catch(() => {});
  await page.waitForTimeout(1_500);
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "World full screen: the Garden and a backyard fill a 1280x800, an 800x1200 and a 1920x900 window edge to edge, following the window as it resizes, with the title, chat log and chat box inside it."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

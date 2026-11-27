#!/usr/bin/env node
// Three things in the World, as the admin on a phone-sized window:
// - The notice board: a new notice's editor doesn't say who sees it, and a
//   notice being edited shows only as the editor, not again below it, until
//   Cancel brings it back.
// - Josh's shop: the chicken, the cow, their feed and name tags are on one
//   tab, and the Seeds tab is seeds only.
// - The backyard: the (i) at the bottom right opens How to farm just above
//   it, the menu and chat stay clear of it, and its ×, the button and a tap
//   on the backyard each close it. Then the coop still opens.
// The World's accessible targets don't take clicks themselves (the stage
// above them does), so a target is clicked at its middle, as a finger would.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-farm-help-notices";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
// A rerun on the same backend pins a new notice, so an old one can't pass it.
const STAMP = String(Date.now()).slice(-5);
const NOTICE = `Working bee Saturday ${STAMP}`;
const VISIBILITY = "Everyone in the World sees it.";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];
const expect = (what, ok) => {
  if (!ok) failures.push(what);
};
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(TIMEOUT_MS);
const id = (testId) => page.getByTestId(testId);
const shot = (what) => page.screenshot({ path: `${OUT}/farm-help-notices-${what}.png` });
const shown = (locator, ms = 10_000) => locator.waitFor({ timeout: ms }).then(() => true, () => false);
const gone = (locator, ms = 10_000) => locator.waitFor({ state: "detached", timeout: ms }).then(() => true, () => false);
const clickMiddle = async (locator) => {
  await locator.waitFor({ state: "attached" });
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const titled = (pattern) =>
  page.waitForFunction((source) => new RegExp(source, "i").test(document.querySelector('[data-testid="world-title"]')?.textContent ?? ""), pattern.source, { timeout: 30_000 }).then(
    () => true,
    () => false
  );
const menu = async (entry) => {
  await id("world-title").click();
  await id("world-menu").waitFor();
  const item = id(`world-menu-${entry}`);
  if ((await item.count()) > 0) {
    await item.click();
    return true;
  }
  await id("world-menu-close").click();
  return false;
};
const toGarden = async () => {
  if (await titled(/Garden/)) return true;
  await menu("garden");
  return titled(/Garden/);
};
const apart = (a, b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world`);
  await id("world-title").waitFor();
  await id("world-me").waitFor({ state: "attached" });
  await page.waitForTimeout(1500);
  expect("didn't get to the Garden", await toGarden());
  await page.waitForTimeout(800);

  // The notice board: the admin walks there and pins a notice.
  await clickMiddle(page.getByLabel("Notice board", { exact: true }).first());
  expect("tapping the notice board didn't open it", await shown(id("world-board-panel"), 30_000));
  await id("world-board-pin").click();
  await id("field-notice").fill(NOTICE);
  await page.waitForTimeout(500);
  await shot("new-draft");
  expect(`a new notice's editor still says "${VISIBILITY}"`, (await id("world-board-draft").getByText(VISIBILITY).count()) === 0);
  await id("world-board-save").click();
  const card = page.locator('[data-testid^="world-board-notice-"]').filter({ hasText: NOTICE });
  expect("the new notice didn't go up", await shown(card));
  await id("world-board-pin").waitFor();
  await page.waitForTimeout(600);
  await shot("pinned");

  // Editing it: the editor at the top, and the notice not again below it.
  await card.getByTestId("world-board-edit").click();
  await id("world-board-draft").waitFor();
  await page.waitForTimeout(600);
  await shot("editing");
  expect("the notice being edited still shows below the editor", await gone(card, 5_000));
  expect(`the edit's editor still says "${VISIBILITY}"`, (await id("world-board-draft").getByText(VISIBILITY).count()) === 0);
  expect("the editor didn't start with the notice's text", (await id("field-notice").inputValue()) === NOTICE);
  await id("world-board-cancel").click();
  expect("Cancel didn't bring the notice back", await shown(card));
  await page.waitForTimeout(400);
  await shot("edit-cancelled");
  // Take it down again, so the next run's board looks the same.
  await card.getByTestId("world-board-remove").click();
  await id("world-board-remove-yes").click();
  expect("the notice didn't come down", await gone(card));
  await id("world-board-close").click();
  await gone(id("world-board-panel"));

  // Josh's shop: animals and their feed on one tab.
  await clickMiddle(page.getByLabel("Josh Kim, farm shop", { exact: true }).first());
  expect("tapping Josh didn't open his shop", await shown(id("world-shop"), 20_000));
  await id("world-shop-tab-animals").click();
  await page.waitForTimeout(600);
  expect("the Animals and feed tab has no chicken", await shown(id("world-shop-animal-chicken")));
  expect("the Animals and feed tab has no grain", await shown(id("world-shop-feed-grain")));
  expect("the Animals and feed tab has no hay", await shown(id("world-shop-feed-hay")));
  expect("the Animals and feed tab has no name tag", await shown(id("world-shop-nametag")));
  expect('the tab isn\'t called "Animals and feed"', (await id("world-shop-tab-animals").textContent())?.includes("Animals and feed") === true);
  await shot("shop-animals-and-feed");
  await id("world-shop-feed-grain").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot("shop-animals-and-feed-scrolled");
  await id("world-shop-tab-seeds").click();
  await page.waitForTimeout(500);
  expect("the Seeds tab still sells feed", (await id("world-shop-feed-grain").count()) === 0);
  await shot("shop-seeds");
  await id("world-shop-close").click({ position: { x: 8, y: 8 } });
  await gone(id("world-shop"));

  // The backyard: How to farm, from the (i) at the bottom right.
  await menu("backyard");
  expect("didn't get into the backyard", await titled(/backyard/));
  await page.waitForTimeout(2000);
  await shot("backyard");
  const open = id("world-backyard-guide-open");
  expect("no (i) in the backyard", await shown(open));
  const stage = await page.viewportSize();
  const button = await open.boundingBox();
  expect("the (i) isn't at the bottom right", button !== null && button.x + button.width > stage.width - 40 && button.y > stage.height / 2);
  await open.click();
  const guide = id("world-backyard-guide");
  expect("the (i) didn't open How to farm", await shown(guide));
  await page.waitForTimeout(900);
  await shot("guide");
  for (const part of ["plant", "water", "grow", "harvest", "animals"]) expect(`How to farm has no ${part} tip`, (await id(`world-backyard-guide-${part}`).count()) === 1);
  expect("How to farm doesn't say to water every day", await shown(guide.getByText("Water every day so plants don't wilt!")));
  const guideBox = await guide.boundingBox();
  for (const control of ["world-title", "world-chat-input", "world-backyard-guide-open"]) {
    const box = await id(control).boundingBox();
    expect(`How to farm covers ${control}`, box !== null && guideBox !== null && apart(box, guideBox));
  }
  await id("world-backyard-guide-animals").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot("guide-animals");
  await id("world-backyard-guide-close").click();
  expect("the × didn't close How to farm", await gone(guide));
  await open.click();
  await shown(guide);
  await page.waitForTimeout(500);
  await open.click();
  expect("the button didn't close How to farm again", await gone(guide));
  await open.click();
  await shown(guide);
  await page.waitForTimeout(500);
  const ground = await id("world-stage").boundingBox();
  await page.mouse.click(ground.x + ground.width * 0.25, ground.y + ground.height * 0.72);
  expect("tapping the backyard didn't close How to farm", await gone(guide));

  // The coop still opens (built, its sheet; not yet, its offer).
  const coop = page.getByLabel(/^Coop, /).first();
  if ((await coop.count()) > 0) {
    await clickMiddle(coop);
    expect("tapping the coop opened nothing", await shown(page.locator('[data-testid="world-pen-sheet"], [data-testid="world-building-offer"]').first(), 20_000));
    await page.waitForTimeout(800);
    await shot("coop");
  } else failures.push("no coop in the backyard");

  // Wider, as on a laptop.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press("Escape");
  await page.mouse.click(8, 400);
  await page.waitForTimeout(800);
  await open.click();
  await shown(guide);
  await page.waitForTimeout(900);
  await shot("guide-wide");
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await shot("failed").catch(() => {});
} finally {
  // Back to the Garden: the checks after this one start from wherever you were left.
  await toGarden().catch(() => {});
  await page.waitForTimeout(1500);
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Notice board, Josh's shop and How to farm: the editor says nothing about who sees a notice and an edited notice shows once; animals, feed and name tags share a tab; the backyard's (i) opens How to farm clear of the menu and chat, and closes three ways."
    : `${failures.length} step(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

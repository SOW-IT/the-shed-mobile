#!/usr/bin/env node
// The World's chat in the backyard: two people, one in their backyard and one
// in the Garden. In the backyard you read the Garden's lines and what you say
// there reaches the Garden, tagged [Backyard]. Then out to the Garden and back
// in, and the chat is still there both ways.
// The World's accessible targets don't take clicks themselves (the stage
// above them does), so a pad is clicked at its middle, as a finger would.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-backyard-chat";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
const HEAR_MS = 15_000;
// A rerun on the same backend says new lines, so an old one can't pass it.
const STAMP = String(Date.now()).slice(-5);
const FROM_GARDEN = `Anyone out back? ${STAMP}`;
const FROM_YARD = `In my backyard ${STAMP}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];

const person = async (email, name) => {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(email)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world`);
  await page.getByTestId("world-title").waitFor();
  await page.getByTestId("world-me").waitFor({ state: "attached" });
  await page.waitForTimeout(1500);
  return { page, name };
};

const shot = ({ page, name }, what) => page.screenshot({ path: `${OUT}/backyard-chat-${name}-${what}.png` });
const titled = ({ page }, pattern) =>
  page.waitForFunction((source) => new RegExp(source).test(document.querySelector('[data-testid="world-title"]')?.textContent ?? ""), pattern.source, { timeout: 30_000 }).then(
    () => true,
    () => false
  );
const menu = async ({ page }, entry) => {
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
const clickMiddle = async (page, locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const intoBackyard = async (who) => {
  if (await titled(who, /backyard/i)) return true;
  await menu(who, "home");
  await titled(who, /home/i);
  const pad = who.page.getByLabel("Go to Backyard");
  await pad.waitFor({ state: "attached" });
  await who.page.waitForTimeout(800);
  await clickMiddle(who.page, pad);
  return titled(who, /backyard/i);
};
const toGarden = async (who) => {
  await menu(who, "garden");
  return titled(who, /Garden/);
};
const say = async ({ page }, text) => {
  await page.getByTestId("world-chat-input").fill(text);
  await page.getByTestId("world-send").click();
};
// A line by what it says, and where it was said ("in Backyard"), from its label.
const hears = ({ page }, text, where) =>
  page
    .waitForFunction(
      ({ text, where }) =>
        [...document.querySelectorAll('[data-testid="world-chat-line"]')].some((line) => {
          const label = line.getAttribute("aria-label") ?? "";
          return label.includes(text) && (where === null ? !/, in /.test(label) : label.endsWith(`, in ${where}`));
        }),
      { text, where },
      { timeout: HEAR_MS }
    )
    .then(
      () => true,
      () => false
    );
const expect = (what, ok) => {
  if (!ok) failures.push(what);
};

let owner;
let neighbour;
try {
  owner = await person(seed.people.admin, "owner");
  neighbour = await person(seed.people.staff, "garden");
  if (!(await titled(neighbour, /Garden/))) await toGarden(neighbour);

  expect("owner: didn't get into the backyard", await intoBackyard(owner));
  await owner.page.waitForTimeout(1500);
  expect("owner: no chat box in the backyard", await owner.page.getByTestId("world-chat-input").isVisible());
  await shot(owner, "arrived");

  // Reading: the Garden's line shows in the backyard, tagged.
  await say(neighbour, FROM_GARDEN);
  expect("backyard: didn't show the Garden's line, tagged [Garden]", await hears(owner, FROM_GARDEN, "The Garden"));
  await shot(owner, "reads-garden");

  // Talking: the backyard's line shows in the backyard and in the Garden, tagged.
  await say(owner, FROM_YARD);
  expect("backyard: didn't show your own line", await hears(owner, FROM_YARD, null));
  await owner.page.waitForTimeout(600);
  await shot(owner, "said");
  expect("garden: didn't hear the backyard's line, tagged [Backyard]", await hears(neighbour, FROM_YARD, "Backyard"));
  await neighbour.page.waitForTimeout(600);
  await shot(neighbour, "hears-backyard");

  // Out to the Garden and back in: the chat is there all along.
  expect("owner: didn't get to the Garden", await toGarden(owner));
  expect("garden: the owner's backyard line went missing", await hears(owner, FROM_YARD, "Backyard"));
  await owner.page.waitForTimeout(600);
  await shot(owner, "left-to-garden");
  expect("owner: didn't get back into the backyard", await intoBackyard(owner));
  await owner.page.waitForTimeout(1200);
  expect("back in the backyard: the chat box is gone", await owner.page.getByTestId("world-chat-input").isVisible());
  expect("back in the backyard: the Garden's line went missing", await hears(owner, FROM_GARDEN, "The Garden"));
  expect("back in the backyard: your earlier line went missing", await hears(owner, FROM_YARD, "Backyard"));
  await shot(owner, "back-in-backyard");
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  if (owner) await shot(owner, "failed").catch(() => {});
  if (neighbour) await shot(neighbour, "failed").catch(() => {});
} finally {
  // Back to the Garden: the checks after this one (and the iOS ones, on the
  // same account) start from wherever you were left.
  const where = owner ? await owner.page.getByTestId("world-title").textContent({ timeout: 5_000 }).catch(() => null) : null;
  if (owner && !/Garden/.test(where ?? "")) {
    await toGarden(owner).catch(() => {});
    await owner.page.waitForTimeout(1500);
  }
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Backyard: the World's chat shows there, what you say there reaches the Garden tagged [Backyard], and it's all still there after leaving and coming back."
    : `${failures.length} step(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

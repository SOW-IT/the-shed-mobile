#!/usr/bin/env node
// Every arcade game's game-over card, driven: open the game from the Games
// list, start a run and don't touch it until it's over, then the card's
// Go back button comes back to the Games list. A practice start (?start=)
// makes Sky Shooter and Swoop end sooner; Hop plays itself (?autoplay=).
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-game-over-back";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
// How long a run left alone may take to end.
const RUN_MS = 120_000;

const GAMES = [
  { game: "flappy", start: "" },
  { game: "runner", start: "" },
  { game: "shooter", start: "?start=20000" },
  { game: "glider", start: "?start=200" },
  // Left alone, Hop bounces on its first platform for ever: this run plays
  // itself to 300 and falls off.
  { game: "hop", start: "?autoplay=300" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const id = (testId) => page.getByTestId(testId).first();
const expect = async (what, ok) => {
  if (!(await ok)) {
    failures.push(what);
    await page.screenshot({ path: `${OUT}/failed-${failures.length}.png` });
  }
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));

  for (const { game, start } of GAMES) {
    try {
      if (start) {
        // A practice start is a route parameter: open the game straight on
        // it. With nothing behind it, Go back still lands on the Games list.
        await page.goto(`${BASE}/games/${game}${start}`);
      } else {
        await page.goto(`${BASE}/games`);
        await id(`games-open-${game}`).click();
        await page.waitForURL(new RegExp(`/games/${game}`));
      }
      const area = id("game-play-area");
      await area.waitFor();
      await page.waitForTimeout(1_000);
      const box = await area.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await id("game-over").waitFor({ timeout: RUN_MS });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${game}-game-over.png` });
      const back = id("game-over-back");
      const hasBack = await back.isVisible();
      await expect(`${game}: the game-over card has a Go back button`, hasBack);
      if (!hasBack) continue;
      await back.getByRole("button", { name: "Go back" }).click();
      await page.waitForURL(/\/games\/?(\?.*)?$/);
      await expect(
        `${game}: Go back comes back to the Games list`,
        id(`games-open-${game}`).waitFor({ timeout: 20_000 }).then(() => true, () => false)
      );
    } catch (error) {
      failures.push(`${game}: ${String(error).split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/failed-${game}.png` }).catch(() => {});
    }
  }
  await page.screenshot({ path: `${OUT}/games-list-after.png` });
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Game over, Go back: Flap, Mystic Man, Sky Shooter, Swoop and Hop each end, show a Go back button on the card, and come back to the Games list."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

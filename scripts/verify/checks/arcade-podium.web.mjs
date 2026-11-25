#!/usr/bin/env node
// The arcade over the World and the leaderboard's podium, driven: the panel
// opens over the live World and stays while you walk, a game goes full screen
// and leaving it comes back to the World, and the leaderboard from the panel
// shows the podium and returns to the panel. Also the Games list's coins and
// who's playing.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-arcade-podium";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const id = (testId) => page.getByTestId(testId).first();
const shown = (testId) => id(testId).isVisible();
const expect = async (what, ok) => {
  if (!(await ok)) {
    failures.push(what);
    await page.screenshot({ path: `${OUT}/failed-${failures.length}.png` });
  }
};
const openArcade = async () => {
  await page.goto(`${BASE}/world?sheet=arcade`);
  await id("world-arcade").waitFor();
  await id("world-stage").waitFor();
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));

  // The Games list: coins next to the Leaderboard, and who's playing.
  await page.goto(`${BASE}/games`);
  await id("games-open-runner").waitFor();
  await id("games-coins").waitFor({ timeout: 20_000 }).catch(() => {});
  await expect("the Games list shows your coins", shown("games-coins"));
  await id("games-playing-runner").waitFor({ timeout: 20_000 }).catch(() => {});
  await expect("the Games list shows who's playing Mystic Man", shown("games-playing-runner"));
  await page.screenshot({ path: `${OUT}/games-list.png` });

  // The arcade over the World, which keeps going: a tap on the ground below
  // the panel walks, and the panel stays.
  await openArcade();
  await expect("the arcade shows who's playing", id("games-playing-runner").waitFor({ timeout: 20_000 }).then(() => true, () => false));
  const stage = await id("world-stage").boundingBox();
  const panel = await id("world-arcade").boundingBox();
  await page.mouse.click(stage.x + stage.width * 0.6, panel.y + panel.height + 60);
  await page.waitForTimeout(1_000);
  await expect("the arcade stays open while you walk", shown("world-arcade"));
  await page.screenshot({ path: `${OUT}/arcade-panel.png` });

  // A game goes full screen; leaving it comes back to the World.
  await id("games-open-runner").click();
  await page.waitForURL(/\/games\/runner/);
  const back = page.getByLabel("Back to the games").first();
  await back.waitFor({ timeout: 120_000 });
  await page.screenshot({ path: `${OUT}/game.png` });
  await back.click();
  await page.waitForURL(/\/world/);
  await id("world-stage").waitFor();
  await page.waitForTimeout(1_000);
  await expect("leaving the game comes back to the World with the arcade closed", (async () => !(await shown("world-arcade")))());
  await page.screenshot({ path: `${OUT}/back-in-world.png` });

  // The leaderboard from the arcade shows the podium; back, the arcade's still open.
  await openArcade();
  await id("games-open-leaderboard").click();
  await page.waitForURL(/\/games\/leaderboard/);
  await id("leaderboard-podium").waitFor({ timeout: 30_000 }).catch(() => {});
  for (const step of [1, 2, 3]) await expect(`the podium has its step ${step}`, shown(`podium-step-${step}`));
  await page.screenshot({ path: `${OUT}/podium.png` });
  await page.goBack();
  await id("world-stage").waitFor();
  await expect("back from the leaderboard, the arcade is still open", id("world-arcade").waitFor({ timeout: 10_000 }).then(() => true, () => false));
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Arcade and podium: coins and who's playing on the Games list; the arcade over the World stays while you walk; a game and back to the World; the leaderboard's podium and back to the arcade."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

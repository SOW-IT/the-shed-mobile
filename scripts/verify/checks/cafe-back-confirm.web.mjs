#!/usr/bin/env node
// Café Games (two players on one phone) asks before every way back: the
// screen's back button, Escape and the browser's back, in the picker,
// mid-game and after a game. Stay keeps you where you were; Leave goes back
// one step: out of a game to the picker, out of the picker to the Games list.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-cafe-back-confirm";
const seedFile = arg("seed");
const seed = seedFile ? JSON.parse(readFileSync(seedFile, "utf8")) : null;
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
const QUESTION = "Are you sure you want to leave?";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const id = (testId) => page.getByTestId(testId).first();
const question = () => page.getByText(QUESTION).first();
const shows = (locator, timeout = 10_000) => locator.waitFor({ timeout }).then(() => true, () => false);
const gone = (locator, timeout = 10_000) => locator.waitFor({ state: "hidden", timeout }).then(() => true, () => false);
const expect = async (what, ok) => {
  if (!(await ok)) {
    failures.push(what);
    await page.screenshot({ path: `${OUT}/failed-${failures.length}.png` });
  }
};
const button = (name) => page.getByRole("button", { name, exact: true }).last();
const headerBack = () => page.getByRole("button", { name: "Go back", exact: true }).first();
// The board's own touch handling sits over its cells, so tap where they are.
const tap = async (testId) => {
  const box = await id(testId).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
};
const onCafe = () => /\/games\/cafe\/?$/.test(new URL(page.url()).pathname);

// Asks with each way back in turn, answers Stay, and checks nothing moved.
const staysThrough = async (where, still, shot) => {
  const ways = [
    ["the back button", () => headerBack().click()],
    ["Escape", () => page.keyboard.press("Escape")],
    ["the browser's back", () => page.goBack({ waitUntil: "commit" }).catch(() => {})],
  ];
  for (const [way, press] of ways) {
    await press();
    await expect(`${where}: ${way} asks "${QUESTION}"`, shows(question()));
    if (shot && way === "the back button") {
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${shot}.png` });
    }
    // Escape answers Stay too; the others tap it.
    if (way === "Escape") await page.keyboard.press("Escape");
    else await button("Stay").click();
    await expect(`${where}: Stay after ${way} closes the question`, gone(question()));
    await expect(`${where}: Stay after ${way} keeps the screen`, shows(id(still)));
    await expect(`${where}: Stay after ${way} keeps the address`, Promise.resolve(onCafe()));
  }
};

try {
  if (seed) {
    await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
    await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  }
  await page.goto(`${BASE}/games`);
  await id("games-open-cafe").click();
  await page.waitForURL(/\/games\/cafe/);
  await id("cafe-local-picker-card").waitFor();

  await staysThrough("picker", "cafe-local-picker-card", "picker-question");

  // Mid-game: one move in, so there's a game to lose.
  await id("cafe-local-fourInARow").click();
  await id("cafe-local-game").waitFor();
  await page.screenshot({ path: `${OUT}/mid-game.png` });
  await tap("cafe-col-3");
  await staysThrough("mid-game", "cafe-local-game", "mid-game-question");

  // Leave from the browser's back, mid-game: out to the picker, still on Café Games.
  await page.goBack({ waitUntil: "commit" }).catch(() => {});
  await expect("mid-game: the browser's back asks", shows(question()));
  await expect("mid-game: the question says the game ends", shows(page.getByText("This game ends if you leave.").first()));
  await button("Leave").click();
  await expect("mid-game: Leave goes to the picker", shows(id("cafe-local-picker-card")));
  await expect("mid-game: Leave stays on Café Games", Promise.resolve(onCafe()));

  // After a game: Tic-tac-toe, the first player takes the top row.
  await id("cafe-local-ticTacToe").click();
  for (const cell of [0, 3, 1, 4, 2]) await tap(`cafe-cell-${cell}`);
  await id("cafe-local-result").waitFor();
  await staysThrough("game over", "cafe-local-result", "game-over-question");
  await headerBack().click();
  await expect("game over: the back button asks", shows(question()));
  await expect("game over: the question doesn't say a game ends", gone(page.getByText("This game ends if you leave."), 2_000));
  await button("Leave").click();
  await expect("game over: Leave goes to the picker", shows(id("cafe-local-picker-card")));

  // Leave from the picker's back button: out to the Games list.
  await headerBack().click();
  await expect("picker: the back button asks again", shows(question()));
  await button("Leave").click();
  await expect("picker: Leave comes back to the Games list", shows(id("games-open-cafe"), 20_000));
  await page.screenshot({ path: `${OUT}/games-list-after.png` });

  // Offline, the games open in a modal over the app, and Escape used to
  // close that modal without asking. Now it asks, and Leave from the picker
  // goes back to the offline games list, still in the modal.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2_000);
  await page.context().setOffline(true);
  await id("offline-pill").click();
  await id("games-open-cafe").click();
  await id("cafe-local-picker-card").waitFor();
  await page.keyboard.press("Escape");
  await expect("offline: Escape asks", shows(question()));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/offline-question.png` });
  await page.keyboard.press("Escape");
  await expect("offline: Escape again stays", gone(question()));
  await expect("offline: Café Games is still open", shows(id("cafe-local-picker-card")));
  await headerBack().click();
  await expect("offline: the back button asks", shows(question()));
  await button("Leave").click();
  await expect("offline: Leave comes back to the offline games list", shows(id("games-open-cafe")));
  await expect("offline: the games list is still the offline one", shows(id("offline-notice")));
  await page.context().setOffline(false);
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await page.screenshot({ path: `${OUT}/failed-error.png` }).catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Café Games back: the back button, Escape and the browser's back each ask in the picker, mid-game and after a game, and offline; Stay keeps the screen, Leave goes back one step."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

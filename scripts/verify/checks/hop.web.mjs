#!/usr/bin/env node
// Hop, driven on the web: the character picker's own arrow keys, steering
// with held keys (left, right, both at once, and a lost window focus letting
// go), steering by holding either half of the board and sliding across the
// middle, the leave dialog pausing the run, the BEST line crossed once, the
// fall-off ending, Space not restarting while you're still mashing, the
// leaderboard and back, and a tall phone and a wide desktop window. The
// run that ends plays itself (?autoplay=, test builds only), a practice run
// that isn't saved.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-hop";
const TIMEOUT_MS = 60_000;
const BEST = 160;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];

const run = async (label, viewport, steps) => {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(TIMEOUT_MS);
  try {
    await steps(page);
  } catch (error) {
    failures.push(`${label}: ${String(error).split("\n")[0]}`);
    await page.screenshot({ path: `${OUT}/failed-${label}.png` }).catch(() => {});
  } finally {
    await page.close();
  }
};

const expect = async (page, what, ok) => {
  if (!(await ok)) {
    failures.push(what);
    await page.screenshot({ path: `${OUT}/failed-${failures.length}.png` });
  }
};

const id = (page, testId) => page.getByTestId(testId).first();
/** Where the character's middle is on screen (the copy on the board, when it's drawn twice at the seam). */
const playerX = async (page) => {
  const boxes = await Promise.all((await page.getByTestId("hop-player").all()).map((el) => el.boundingBox()));
  const board = await id(page, "hop-scene").boundingBox();
  const inside = boxes.filter(Boolean).find((box) => box.x + box.width / 2 >= board.x && box.x + box.width / 2 <= board.x + board.width);
  return inside ? inside.x + inside.width / 2 - board.x : NaN;
};
const startCard = (page) => page.getByText(/Hold a side/).first();
const scoreText = (page) => id(page, "game-score").textContent();

/** A new run's start card, whatever the last run was doing. */
const freshRun = async (page) => {
  if (!(await startCard(page).isVisible().catch(() => false))) {
    await page.goto(`${BASE}/games/hop`);
    await id(page, "hop-scene").waitFor();
  }
  await startCard(page).waitFor();
  await page.waitForTimeout(600);
  await page.evaluate(() => document.activeElement?.blur());
};

/**
 * A steering check on a new run. Steering off the first platform can miss
 * every other one and fall off, so a run that ends partway is tried again.
 */
const steering = async (page, label, steps) => {
  let notes = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await freshRun(page);
    notes = [];
    await steps((what, ok) => notes.push([what, ok]));
    if (!(await id(page, "game-over").isVisible().catch(() => false))) break;
  }
  for (const [what, ok] of notes) await expect(page, `phone ${label}: ${what}`, ok);
};

// Signed out, so the best saved on this device is the one the run starts with.
const withBest = async (page) => {
  await page.goto(`${BASE}/games`);
  await page.evaluate((best) => {
    localStorage.setItem("games.bests.v2", JSON.stringify({ shooter: 0, runner: 0, flappy: 0, glider: 0, hop: best, resets: { runner: 1_795_429_500_000 } }));
    localStorage.removeItem("games.characters");
  }, BEST);
  await page.reload();
};

await run("phone", { width: 390, height: 844 }, async (page) => {
  await withBest(page);
  await id(page, "games-open-hop").click();
  await page.waitForURL(/\/games\/hop/);
  await id(page, "hop-scene").waitFor();
  await startCard(page).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/hop-start.png` });

  // The picker keeps its arrow keys: choosing doesn't start the run.
  await id(page, "character-mine").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page, "phone: → in the picker picks Sij", id(page, "character-sij").getAttribute("aria-checked").then((v) => v === "true"));
  await page.keyboard.press("ArrowRight");
  await expect(page, "phone: → again picks Original", id(page, "character-original").getAttribute("aria-checked").then((v) => v === "true"));
  await expect(page, "phone: the picker's arrow keys don't start a run", startCard(page).isVisible());
  await page.evaluate(() => document.activeElement?.blur());

  // Held keys steer; both at once steer neither way; letting go of one leaves the other.
  await steering(page, "keys", async (note) => {
    const start = await playerX(page);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(350);
    note("← starts the run", await startCard(page).isHidden());
    const left = await playerX(page);
    note(`holding ← moves you left (${start.toFixed(0)} → ${left.toFixed(0)})`, left < start - 40);
    await page.screenshot({ path: `${OUT}/hop-steer-left.png` });
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(450);
    const both = await playerX(page);
    await page.waitForTimeout(300);
    const stillBoth = await playerX(page);
    note(`← and → together hold still (${both.toFixed(0)} → ${stillBoth.toFixed(0)})`, Math.abs(stillBoth - both) < 6);
    await page.keyboard.up("ArrowLeft");
    await page.waitForTimeout(500);
    const right = await playerX(page);
    note(`letting go of ← leaves → steering right (${stillBoth.toFixed(0)} → ${right.toFixed(0)})`, right > stillBoth + 20 || right < stillBoth - 200);
    // The window losing focus lets go of a held key whose release it won't see.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(450);
    const blurred = await playerX(page);
    await page.waitForTimeout(350);
    const afterBlur = await playerX(page);
    note(`a lost focus stops the steering (${blurred.toFixed(0)} → ${afterBlur.toFixed(0)})`, Math.abs(afterBlur - blurred) < 6);
    await page.keyboard.up("ArrowRight");
  });

  // Holding a half of the board steers that way; sliding across the middle turns round.
  await steering(page, "touch", async (note) => {
    const board = await id(page, "hop-scene").boundingBox();
    const y = board.y + board.height * 0.7;
    const before = await playerX(page);
    await page.mouse.move(board.x + board.width * 0.2, y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    note("holding a half starts the run", await startCard(page).isHidden());
    const heldLeft = await playerX(page);
    note(`holding the left half steers left (${before.toFixed(0)} → ${heldLeft.toFixed(0)})`, heldLeft < before - 30);
    await page.mouse.move(board.x + board.width * 0.8, y, { steps: 4 });
    await page.waitForTimeout(400);
    const slid = await playerX(page);
    note(`sliding to the right half steers right (${heldLeft.toFixed(0)} → ${slid.toFixed(0)})`, slid > heldLeft + 30 || slid < heldLeft - 200);
    await page.mouse.up();
    await page.screenshot({ path: `${OUT}/hop-touch.png` });
  });

  await freshRun(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(100);
  await page.keyboard.up("ArrowRight");
  // The back button asks first, and the run waits meanwhile.
  await page.getByRole("button", { name: "Back to the games" }).click();
  await page.getByText("Leave this game?").first().waitFor();
  const paused = await scoreText(page);
  const pausedX = await playerX(page);
  await page.waitForTimeout(800);
  await expect(page, "phone: the leave dialog pauses the run", (async () => (await playerX(page)) === pausedX && (await scoreText(page)) === paused)());
  await page.screenshot({ path: `${OUT}/hop-leave-dialog.png` });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page,
    "phone: Continue goes back to the run",
    page.getByText("Leave this game?").first().waitFor({ state: "hidden", timeout: 5_000 }).then(() => true, () => false)
  );
});

await run("phone-run", { width: 390, height: 844 }, async (page) => {
  await withBest(page);
  await page.goto(`${BASE}/games/hop?autoplay=500`);
  await id(page, "hop-scene").waitFor();
  await startCard(page).waitFor();
  await page.keyboard.press(" ");
  await id(page, "hop-best-line").waitFor();
  await page.screenshot({ path: `${OUT}/hop-best-line.png` });
  await id(page, "hop-best-badge").waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/hop-best-crossed.png` });
  await expect(page, "phone: passing your best is noted once", (async () => {
    await page.waitForTimeout(2_500);
    return (await page.getByTestId("hop-best-badge").count()) === 0;
  })());
  await id(page, "game-over").waitFor({ timeout: 90_000 });
  // Still mashing: Space this soon after the end doesn't start again.
  await page.keyboard.press(" ");
  await page.waitForTimeout(200);
  await expect(page, "phone: Space right after the end doesn't restart", id(page, "game-over").isVisible());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/hop-game-over.png` });
  await expect(page, "phone: a run that played itself isn't saved", id(page, "game-saved-note").textContent().then((t) => /Practice run/.test(t ?? "")));
  const final = Number((await id(page, "game-final-score").textContent())?.replace(/,/g, ""));
  await expect(page, `phone: the run climbed past its target before falling off (${final})`, final >= 500);

  await page.getByRole("button", { name: "Leaderboard" }).click();
  await page.waitForURL(/\/games\/leaderboard/);
  await id(page, "leaderboard-page-hop").waitFor();
  await page.screenshot({ path: `${OUT}/hop-leaderboard.png` });
  await page.goBack();
  await id(page, "game-over").waitFor();
  await page.keyboard.press(" ");
  await expect(page, "phone: Space starts again after the leaderboard", startCard(page).waitFor({ timeout: 10_000 }).then(() => true, () => false));
});

await run("wide", { width: 1280, height: 720 }, async (page) => {
  await page.goto(`${BASE}/games/hop`);
  await id(page, "hop-scene").waitFor();
  await startCard(page).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/hop-wide-start.png` });
  await page.keyboard.down("d");
  await page.waitForTimeout(400);
  await page.keyboard.up("d");
  await expect(page, "wide: D starts and steers", startCard(page).isHidden());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/hop-wide-playing.png` });
  const board = await id(page, "hop-scene").boundingBox();
  await expect(page, `wide: the board stays a portrait page (${board.width}×${board.height})`, board.height > board.width * 1.4);
});

await browser.close();

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Hop: the picker keeps its arrow keys; ←/→/A/D and either half of the board steer, both at once hold still, a lost focus lets go; the leave dialog pauses; a run climbs past the BEST line (noted once), falls off and ends; Space waits out the mash; the leaderboard comes back to the card; tall phone and wide desktop."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

#!/usr/bin/env node
// A link to the Leaderboard while it's open opens the linked game's tab. The
// Leaderboard opens on Sky Shooter, then the URL changes to ?game=runner and
// ?game=glider in place (history.pushState and a popstate event, which is
// how the app's linking hears a link), as a "just beat you" push does on a
// phone. Each time the tab and its Play button follow.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-leaderboard-link-tab";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;

const LINKS = [
  { game: "runner", play: "Play Mystic Man" },
  { game: "glider", play: "Play Swoop" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);
const failures = [];
// Every game's page is drawn side by side; the one in view is the open tab.
const onScreen = (text, timeout) =>
  page
    .waitForFunction(
      (wanted) =>
        [...document.querySelectorAll("div, span")].some((el) => {
          if (el.childElementCount > 0 || el.textContent?.trim() !== wanted) return false;
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.left >= 0 && box.right <= window.innerWidth + 1;
        }),
      text,
      { timeout }
    )
    .then(() => true, () => false);

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/games/leaderboard`);
  if (!(await onScreen("Play Sky Shooter", 30_000))) throw new Error("the Leaderboard didn't open on Sky Shooter");
  await page.screenshot({ path: `${OUT}/leaderboard-open.png` });
  for (const { game, play } of LINKS) {
    await page.evaluate((url) => {
      window.history.pushState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }, `/games/leaderboard?game=${game}`);
    const followed = await onScreen(play, 10_000);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/leaderboard-linked-${game}.png` });
    if (!followed) failures.push(`?game=${game} while the Leaderboard is open: "${play}" never showed, the tab stayed where it was`);
  }
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await page.screenshot({ path: `${OUT}/failed.png` }).catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Leaderboard links: with the Leaderboard open, ?game=runner opens Mystic Man and ?game=glider opens Swoop."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

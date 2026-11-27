#!/usr/bin/env node
// Hong Kong mahjong in the Café, driven with three people: the admin sits
// at Table 1 and hosts its lobby (the arcade list's panel, shot beside the
// arcade itself), the staff member sits too, the host adds two bots and
// starts, and the hand plays to its breakdown: dice and deal, the
// full-screen table with each seat's character, a claim prompt when one
// comes, and the faan and coins after. The leader watches from the Café
// (no concealed tiles) and then sits in a bot's seat, which asks to take it
// over. Each person plays their own turns by discarding the tile they drew.
//
// The World's accessible targets don't take clicks themselves (the stage
// above them does), so a click lands at a target's middle, as a finger would.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-mahjong";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
// Verify stops a check at 5 minutes; the hand gets what the setup leaves.
const HAND_MS = 150_000;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];
const notes = [];

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

const shot = ({ page, name }, what) => page.screenshot({ path: `${OUT}/mahjong-${what}-${name}.png` });
const id = ({ page }, testId) => page.getByTestId(testId).first();
const shown = (who, testId) => id(who, testId).isVisible().catch(() => false);
const appears = (who, testId, timeout = 30_000) => id(who, testId).waitFor({ timeout }).then(() => true, () => false);
const expect = async (who, what, ok) => {
  if (!(await ok)) {
    failures.push(`${who.name}: ${what}`);
    await who.page.screenshot({ path: `${OUT}/mahjong-failed-${failures.length}.png` }).catch(() => {});
  }
};
const clickMiddle = async ({ page }, locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const title = ({ page }) => page.getByTestId("world-title").textContent();
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

/** To the Café: back to the Garden by the menu if need be, then through the Café's pad. */
const toCafe = async (who) => {
  if (/Café/.test((await title(who)) ?? "")) return;
  if (!/Garden/.test((await title(who)) ?? "")) {
    await menu(who, "garden");
    await titled(who, /Garden/);
  }
  const pad = who.page.getByRole("button", { name: "Go to The Café", exact: true });
  await pad.first().waitFor({ state: "attached" });
  await clickMiddle(who, pad.first());
  if (!(await titled(who, /Café/))) throw new Error(`${who.name} didn't reach the Café`);
  await who.page.waitForTimeout(1500);
};

const seat = (who, place) => who.page.getByRole("button", { name: `Mahjong Table 1, ${place} seat`, exact: true }).first();
const sitAt = async (who, place) => {
  const target = seat(who, place);
  await target.waitFor({ state: "attached" });
  await clickMiddle(who, target);
};

/** Plays this person's turn if it's theirs: tap the drawn tile (the last), then tap it again. Passes claims after a shot. */
const playTurn = async (who, seen) => {
  if (await shown(who, "mahjong-claim")) {
    if (!seen.claim) {
      seen.claim = true;
      await who.page.waitForTimeout(300);
      await shot(who, "claim");
    }
    await id(who, "mahjong-claim-pass").click().catch(() => {});
    return;
  }
  if (!(await shown(who, "mahjong-turn"))) return;
  const tiles = who.page.locator('[data-testid="mahjong-hand"] [data-testid^="mahjong-tile-"]');
  const count = await tiles.count();
  if (count === 0) return;
  const last = tiles.nth(count - 1);
  await last.click().catch(() => {});
  if (!seen.picked) {
    seen.picked = true;
    await who.page.waitForTimeout(200);
    await shot(who, "turn");
  }
  await last.click().catch(() => {});
};

try {
  const host = await person(seed.people.admin, "host");
  const guest = await person(seed.people.staff, "guest");
  const watcher = await person(seed.people.leader, "watcher");
  for (const who of [host, guest, watcher]) await toCafe(who);
  await host.page.waitForTimeout(1000);
  await shot(host, "cafe");

  // The host sits: the lobby, built like the arcade's list.
  await sitAt(host, "East");
  await expect(host, "sitting at an empty table opens its lobby", appears(host, "mahjong-lobby"));
  await host.page.waitForTimeout(800);
  await shot(host, "lobby");
  await id(host, "mahjong-lobby").screenshot({ path: `${OUT}/mahjong-lobby-panel.png` });

  // The arcade, for the side-by-side.
  await host.page.goto(`${BASE}/world?sheet=arcade`);
  await id(host, "world-arcade").waitFor();
  await host.page.waitForTimeout(1200);
  await id(host, "world-arcade").screenshot({ path: `${OUT}/mahjong-arcade-panel.png` });
  await id(host, "world-arcade-close").click();
  await host.page.waitForTimeout(800);
  if (!(await shown(host, "mahjong-lobby"))) {
    await sitAt(host, "East");
    await appears(host, "mahjong-lobby");
  }

  // The guest sits in the South seat; the host sees them, adds two bots and opens the rules.
  await sitAt(guest, "South");
  await expect(guest, "the guest's lobby opens", appears(guest, "mahjong-lobby"));
  await expect(guest, "the guest waits for the host", appears(guest, "mahjong-waiting"));
  await id(host, "mahjong-add-bot-2").click();
  await id(host, "mahjong-add-bot-3").click();
  await id(host, "mahjong-rules").click();
  await host.page.waitForTimeout(800);
  await shot(host, "lobby-full");
  await shot(guest, "lobby-full");

  // Start: the dice and the deal, then the table full screen.
  await id(host, "mahjong-start").click();
  await expect(host, "the table opens full screen", appears(host, "mahjong-table"));
  await expect(guest, "the table opens for the guest", appears(guest, "mahjong-table"));
  await host.page.waitForTimeout(700);
  await shot(host, "dice");
  await host.page.waitForTimeout(2600);
  await shot(host, "deal");

  // A chat line and an emote at the table show by the seat.
  await guest.page.getByTestId("world-chat-input").fill("Good luck everyone!").catch(() => notes.push("no chat input to type in"));
  await guest.page.getByTestId("world-send").click().catch(() => notes.push("couldn't send a line"));
  await host.page.getByTestId("world-emotes").click().catch(() => notes.push("no emote button"));
  await host.page.getByTestId("world-emote-wave").click().catch(() => notes.push("no wave emote"));
  await host.page.waitForTimeout(900);
  await shot(host, "chat");

  // The watcher taps the guest's stool: the game opens read-only.
  await sitAt(watcher, "South");
  await expect(watcher, "tapping a player's seat opens the game to watch", appears(watcher, "mahjong-watching"));
  await watcher.page.waitForTimeout(800);
  await shot(watcher, "watching");
  await expect(watcher, "a watcher sees no concealed tiles", (async () => (await watcher.page.locator('[data-testid="mahjong-hand"] [data-testid^="mahjong-tile-"]').count()) === 0)());
  await id(watcher, "mahjong-leave").click();

  // Play the hand out: each person plays their own turns.
  const seen = { host: {}, guest: {} };
  const until = Date.now() + HAND_MS;
  let tookTable = false;
  while (Date.now() < until && !(await shown(host, "mahjong-result"))) {
    await playTurn(host, seen.host);
    await playTurn(guest, seen.guest);
    if (!tookTable && !seen.tableShot && (await shown(host, "mahjong-last-discard"))) {
      seen.tableShot = true;
      await shot(host, "table");
      await shot(guest, "table");
    }
    // Midway, the watcher sits in a bot's stool (bots aren't drawn, so it looks free) and is asked to take over.
    if (!tookTable && seen.tableShot && (await host.page.locator('[data-testid^="mahjong-river-"] [aria-label]').count()) > 10) {
      tookTable = true;
      await sitAt(watcher, "West");
      if (await appears(watcher, "mahjong-replace", 15_000)) {
        await watcher.page.waitForTimeout(500);
        await shot(watcher, "replace");
        await id(watcher, "mahjong-replace-take").click();
        await expect(watcher, "taking over a bot opens its hand", appears(watcher, "mahjong-table"));
        await watcher.page.waitForTimeout(600);
        await shot(watcher, "took-over");
        seen.watcher = {};
      } else failures.push("watcher: sitting in a bot's seat didn't ask to take it over");
    }
    if (seen.watcher) await playTurn(watcher, seen.watcher);
    await host.page.waitForTimeout(250);
  }
  await expect(host, "the hand reaches its breakdown", appears(host, "mahjong-result", 5_000));
  await host.page.waitForTimeout(800);
  await shot(host, "result");
  await shot(guest, "result");
  if (!seen.host.claim && !seen.guest.claim) notes.push("no claim prompt came up for either person this hand");
  if (!tookTable) notes.push("the hand ended before the watcher could take over a bot, so taking over wasn't checked");

  // Play another round: the host asks, then the guest.
  await id(host, "mahjong-again").click();
  await host.page.waitForTimeout(600);
  await shot(host, "again-waiting");
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  for (const [i, context] of browser.contexts().entries())
    for (const page of context.pages()) await page.screenshot({ path: `${OUT}/mahjong-failed-player-${i + 1}.png` }).catch(() => {});
} finally {
  await browser.close();
}

for (const note of notes) console.log(`· ${note}`);
for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Mahjong: a table's lobby (the arcade's panel), two people and two bots, the full-screen hand played to its faan and coins, watching without concealed tiles, and taking over a bot."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);

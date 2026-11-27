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
// Around that: the host takes the leader off a seat in the lobby (✕, then
// a confirmation), the guest says they're ready, and the start counts
// down. At the table, the timer runs under ✕, a picked tile slid down stays
// in the hand, a claim lights the tiles it would take, the table's options
// open as a settings card, and when the leader gives back the bot they took
// over, the seat shows the bot's name again.
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

/**
 * Sits in a bot's stool mid-hand, and says which. Someone seated beside a
 * stool can cover it on screen, and a tap on a person playing opens their
 * game to watch, so this tries each bot's stool, its middle and then its
 * corners.
 */
const BOT_PLACES = { West: 2, North: 3 };
const sitInBotSeat = async (who) => {
  for (const [place, index] of Object.entries(BOT_PLACES)) if (await sitInStool(who, place)) return index;
  return null;
};
const sitInStool = async (who, place) => {
  const target = seat(who, place);
  await target.waitFor({ state: "attached" });
  const box = await target.boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
    await who.page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    // Walking to the stool takes a while; either the take-over card comes up, or the game opens to watch.
    const outcome = await who.page
      .waitForFunction(() => ["mahjong-replace", "mahjong-watching"].find((t) => document.querySelector(`[data-testid="${t}"]`)), null, { timeout: 15_000 })
      .then((handle) => handle.jsonValue(), () => null);
    if (outcome === "mahjong-replace") return true;
    if (outcome === "mahjong-watching") {
      await id(who, "mahjong-leave").click();
      await who.page.waitForTimeout(800);
    }
  }
  return false;
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
  // The lobby opens under the chat log, so the log stays readable, and its Start button is on screen.
  await host.page.waitForTimeout(800);
  await expect(
    host,
    "the lobby opens below the chat log, with its start button on screen",
    host.page.evaluate(() => {
      const log = document.querySelector('[data-testid="world-chat-log"]')?.getBoundingClientRect();
      const lobby = document.querySelector('[data-testid="mahjong-lobby"]')?.getBoundingClientRect();
      const start = document.querySelector('[data-testid="mahjong-start"]')?.getBoundingClientRect();
      return Boolean(lobby && start && (!log || log.bottom <= lobby.top + 1) && start.bottom <= window.innerHeight);
    })
  );
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

  // The guest sits in the North seat first, and the host takes them off it: ✕, then a confirmation.
  await sitAt(guest, "North");
  await expect(guest, "the guest's lobby opens", appears(guest, "mahjong-lobby"));
  await expect(host, "the host can take a seated person off", appears(host, "mahjong-remove-player-3"));
  await id(host, "mahjong-remove-player-3").click();
  await expect(host, "taking someone off asks first", appears(host, "mahjong-remove-confirm"));
  await host.page.waitForTimeout(400);
  await shot(host, "remove-confirm");
  await id(host, "mahjong-remove-go").click();
  await expect(guest, "the guest's lobby closes once they're taken off", id(guest, "mahjong-lobby").waitFor({ state: "hidden", timeout: 15_000 }).then(() => true, () => false));
  await expect(host, "the North seat is free again", appears(host, "mahjong-add-bot-3"));
  await guest.page.waitForTimeout(1200);
  await shot(guest, "removed");

  // The guest sits down again, in the South seat; the host sees them, adds two bots and opens the rules.
  await sitAt(guest, "South");
  await expect(guest, "the guest's lobby opens", appears(guest, "mahjong-lobby"));
  await expect(guest, "the guest waits for the host", appears(guest, "mahjong-waiting"));
  await id(host, "mahjong-add-bot-2").click();
  await id(host, "mahjong-add-bot-3").click();
  await expect(host, "the host is told who isn't ready", appears(host, "mahjong-not-ready"));
  await host.page.waitForTimeout(600);
  await shot(host, "lobby-not-ready");
  await id(guest, "mahjong-ready").click();
  await expect(host, "the host's button says Start game once everyone's ready", host.page.waitForFunction(() => !document.querySelector('[data-testid="mahjong-not-ready"]'), null, { timeout: 15_000 }).then(() => true, () => false));
  await id(host, "mahjong-rules").click();
  await host.page.waitForTimeout(800);
  await shot(host, "lobby-full");
  await shot(guest, "lobby-full");

  // Start: a countdown for everyone seated, then the dice and the deal, and the table full screen.
  await id(host, "mahjong-start").click();
  await expect(guest, "the guest sees the countdown", appears(guest, "mahjong-countdown", 5_000));
  await shot(guest, "countdown");
  await shot(host, "countdown");
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
  // Every seat's bubble stays on screen: the guest sits on the host's right, so theirs grows leftward.
  await expect(host, "the chat bubbles stay on screen", host.page.evaluate(() => [...document.querySelectorAll('[data-testid="mahjong-bubble"]')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0; })));

  // The watcher taps the guest's stool: the game opens read-only.
  await sitAt(watcher, "South");
  await expect(watcher, "tapping a player's seat opens the game to watch", appears(watcher, "mahjong-watching"));
  await watcher.page.waitForTimeout(800);
  await shot(watcher, "watching");
  await expect(watcher, "a watcher sees no concealed tiles", (async () => (await watcher.page.locator('[data-testid="mahjong-hand"] [data-testid^="mahjong-tile-"]').count()) === 0)());
  await id(watcher, "mahjong-leave").click();

  // The table's options, a settings card.
  await id(host, "mahjong-options").click();
  await expect(host, "the table's options open", appears(host, "mahjong-options-panel"));
  await host.page.waitForTimeout(600);
  await shot(host, "options");
  await id(host, "mahjong-options-close").click({ position: { x: 20, y: 300 } }).catch(() => notes.push("couldn't close the options"));
  await host.page.waitForTimeout(500);

  // Play the hand out: each person plays their own turns.
  const seen = { host: {}, guest: {} };
  let slid = false;
  let tookSeat = null;
  let gaveBack = false;
  const until = Date.now() + HAND_MS;
  let tookTable = false;
  while (Date.now() < until && !(await shown(host, "mahjong-result"))) {
    // Once: on the host's turn, pick a tile and slide it down. It stays in the hand, and the turn stays the host's.
    if (!slid && (await shown(host, "mahjong-turn"))) {
      slid = true;
      const tiles = host.page.locator('[data-testid="mahjong-hand"] [data-testid^="mahjong-tile-"]');
      const before = await tiles.count();
      const first = tiles.first();
      await first.click();
      await host.page.waitForTimeout(250);
      await shot(host, "picked");
      await expect(host, "the timer runs under ✕ on your turn", shown(host, "mahjong-timer"));
      await expect(host, "your turn is called out over your hand", shown(host, "mahjong-your-turn"));
      const box = await first.boundingBox();
      await host.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await host.page.mouse.down();
      for (let step = 1; step <= 8; step++) await host.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + step * 10);
      await host.page.mouse.up();
      await host.page.waitForTimeout(700);
      await expect(host, "sliding a picked tile down doesn't discard it", (async () => (await tiles.count()) === before && (await shown(host, "mahjong-turn")))());
      // Scrub along the top row: the tile under the pointer is picked as it goes, and lifting keeps it picked (no discard).
      const row = [];
      for (let i = 0; i < Math.min(4, before); i++) row.push(await tiles.nth(i).boundingBox());
      const y = row[0].y + row[0].height / 2;
      await host.page.mouse.move(row[0].x + row[0].width / 2, y);
      await host.page.mouse.down();
      for (const box of row) for (let step = 1; step <= 4; step++) await host.page.mouse.move(box.x + (step * box.width) / 4, y);
      await host.page.waitForTimeout(200);
      await shot(host, "scrub");
      await host.page.mouse.up();
      await host.page.waitForTimeout(500);
      await expect(host, "scrubbing along the hand picks a tile and never discards", (async () => (await tiles.count()) === before && (await shown(host, "mahjong-turn")))());
    }
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
      tookSeat = await sitInBotSeat(watcher);
      if (tookSeat !== null) {
        await watcher.page.waitForTimeout(500);
        await shot(watcher, "replace");
        await id(watcher, "mahjong-replace-take").click();
        await expect(watcher, "taking over a bot opens its hand", appears(watcher, "mahjong-table"));
        await watcher.page.waitForTimeout(600);
        await shot(watcher, "took-over");
        await host.page.waitForTimeout(800);
        await shot(host, "sees-takeover");
        seen.watcher = {};
      } else {
        failures.push("watcher: sitting in a bot's seat didn't ask to take it over");
        await shot(watcher, "replace-missing");
      }
    }
    if (seen.watcher) await playTurn(watcher, seen.watcher);
    // A few turns later the leader gets up: the bot plays the seat again, under the bot's own name.
    if (seen.watcher && !gaveBack && (await host.page.locator('[data-testid^="mahjong-river-"] [aria-label]').count()) > 20) {
      gaveBack = true;
      await id(watcher, "mahjong-leave").click();
      if (await appears(watcher, "mahjong-give-up", 3_000)) await id(watcher, "mahjong-give-up-confirm").click();
      delete seen.watcher;
      await host.page.waitForTimeout(1500);
      await expect(host, "the seat shows the bot's name while it plays for the leader", host.page.getByTestId(`mahjong-player-${tookSeat}`).getByText(tookSeat === 2 ? /^Dragon B/ : /^Lotus B/).first().isVisible().catch(() => false));
      await shot(host, "stand-in");
    }
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

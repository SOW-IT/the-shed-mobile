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

/** The World's chat box is drawn over the table: visible, inside the window, and not covered at its middle. */
const chatBoxOnScreen = ({ page }) =>
  page.evaluate(() => {
    const input = document.querySelector('[data-testid="world-chat-input"]');
    if (!input) return false;
    const r = input.getBoundingClientRect();
    const inside = r.width > 40 && r.height > 10 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return inside && Boolean(top && (top === input || input.contains(top) || top.contains(input)));
  });
/** Whether a chat line saying `text` shows in this person's log within a few seconds. */
const hears = ({ page }, text) =>
  page
    .waitForFunction((text) => [...document.querySelectorAll('[data-testid="world-chat-line"]')].some((line) => (line.getAttribute("aria-label") ?? line.textContent ?? "").includes(text)), text, { timeout: 10_000 })
    .then(() => true, () => false);

/** Plays this person's turn if it's theirs: tap the drawn tile (the last), then tap it again. Passes claims after a shot. */
const playTurn = async (who, seen) => {
  if (await shown(who, "mahjong-claim")) {
    if (!seen.claim) {
      seen.claim = true;
      await who.page.waitForTimeout(300);
      await shot(who, "claim");
      // The chips float over a discard pile (yours) instead of taking a row above the hand.
      const chips = await id(who, "mahjong-claim").boundingBox();
      const hand = await id(who, "mahjong-hand").boundingBox();
      // Your own pile is the river nearest your hand (the lowest on screen).
      const rivers = (await Promise.all((await who.page.locator('[data-testid^="mahjong-river-"]').all()).map((r) => r.boundingBox()))).filter(Boolean);
      const own = rivers.reduce((low, r) => (!low || r.y + r.height > low.y + low.height ? r : low), null);
      const middle = chips && { x: chips.x + chips.width / 2, y: chips.y + chips.height / 2 };
      await expect(who, "the claim chips lie over your own discards, not in a row of their own", Promise.resolve(Boolean(chips && hand && own && chips.y + chips.height <= hand.y && middle.x >= own.x && middle.x <= own.x + own.width && middle.y >= own.y && middle.y <= own.y + own.height)));
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

  // The arcade, for the side-by-side, before anyone sits (seated in a lobby, the arcade stays shut).
  await host.page.goto(`${BASE}/world?sheet=arcade`);
  await id(host, "world-arcade").waitFor();
  await host.page.waitForTimeout(1200);
  await id(host, "world-arcade").screenshot({ path: `${OUT}/mahjong-arcade-panel.png` });
  await id(host, "world-arcade-close").click();
  await host.page.waitForTimeout(800);

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

  // The arcade can't cover the lobby (Table 2 is beside its cabinet): opening it while seated in the lobby closes it again.
  await host.page.goto(`${BASE}/world?sheet=arcade`);
  await appears(host, "mahjong-lobby");
  await host.page.waitForTimeout(1500);
  await expect(host, "the arcade's panel never covers the lobby", (async () => !(await shown(host, "world-arcade")) && (await shown(host, "mahjong-add-bot-1")))());
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
  // The lobby sits just above the chat box and grows upward, below the chat log, which stays in view.
  const lobby = await id(host, "mahjong-lobby").boundingBox();
  const chatBox = await id(host, "world-chat-input").boundingBox();
  const log = await id(host, "world-log-row").boundingBox();
  await expect(host, "the lobby sits just above the chat box, below the chat log", Promise.resolve(Boolean(lobby && chatBox && log && lobby.y + lobby.height <= chatBox.y && chatBox.y - (lobby.y + lobby.height) < 40 && lobby.y >= log.y + log.height - 1)));
  await shot(host, "lobby-full");
  await shot(guest, "lobby-full");
  // The rules open in a dialog of their own; ✕, a tap outside it and Escape each close it.
  await id(host, "mahjong-rules-change").click();
  await expect(host, "the rules open in a dialog", appears(host, "mahjong-settings", 5_000));
  await host.page.waitForTimeout(400);
  await shot(host, "rules-dialog");
  await id(host, "mahjong-rules-close").click();
  await expect(host, "✕ closes the rules", (async () => (await host.page.getByTestId("mahjong-settings").count()) === 0)());
  await id(host, "mahjong-rules-change").click();
  await id(host, "mahjong-settings").waitFor({ timeout: 5_000 }).catch(() => {});
  await host.page.mouse.click(8, 8);
  await expect(host, "a tap outside closes the rules", (async () => (await host.page.getByTestId("mahjong-settings").count()) === 0)());
  await id(host, "mahjong-rules-change").click();
  await id(host, "mahjong-settings").waitFor({ timeout: 5_000 }).catch(() => {});
  await host.page.keyboard.press("Escape");
  await host.page.waitForTimeout(300);
  await expect(host, "Escape closes the rules", (async () => (await host.page.getByTestId("mahjong-settings").count()) === 0)());

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

  // A chat line and an emote at the table show by the seat. The chat box is there at the table, on screen, and sends.
  await expect(guest, "the chat box is on screen at the table", chatBoxOnScreen(guest));
  await guest.page.getByTestId("world-chat-input").fill("Good luck everyone!").catch(() => {});
  await guest.page.getByTestId("world-send").click().catch(() => {});
  await expect(host, "a line typed at the table reaches the others", hears(host, "Good luck everyone!"));
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
  await expect(watcher, "the chat box is on screen while watching", chatBoxOnScreen(watcher));
  await watcher.page.getByTestId("world-chat-input").fill("Nice hand!").catch(() => {});
  await watcher.page.getByTestId("world-send").click().catch(() => {});
  await expect(host, "a watcher's line reaches the table", hears(host, "Nice hand!"));
  await id(watcher, "mahjong-leave").click();

  // The table's options, a settings card.
  await id(host, "mahjong-options").click();
  await expect(host, "the table's options open", appears(host, "mahjong-options-panel"));
  await host.page.waitForTimeout(600);
  await shot(host, "options");
  // Keyboard focus is in the options, and the table behind can't be tabbed to (it's inert) until they close; then focus is back on the Options button.
  const focusInPanel = () => host.page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="mahjong-options-panel"]')));
  await expect(host, "opening the options moves focus into them", focusInPanel());
  for (let i = 0; i < 4; i++) await host.page.keyboard.press("Tab");
  await expect(host, "Tab can't reach the table behind the options", host.page.evaluate(() => !document.activeElement?.closest('[data-testid="mahjong-hand"]') && Boolean(document.querySelector('[data-testid="mahjong-hand"]')?.closest("[inert]"))));
  await id(host, "mahjong-options-close").click({ position: { x: 20, y: 300 } }).catch(() => notes.push("couldn't close the options"));
  await host.page.waitForTimeout(500);
  await expect(host, "closing the options puts focus back on their button", host.page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "mahjong-options"));

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
      await expect(host, "the timer runs over the chat log on your turn", shown(host, "mahjong-timer"));
      const glows = host.page.locator('[data-testid="mahjong-hand"] [data-testid="mahjong-turn-glow"]');
      // Every tile but the picked one (which has its own glow) is lit for your turn, and there's no "Your turn" row any more.
      await expect(host, "your turn lights the tiles in your hand", (async () => (await glows.count()) === before - 1)());
      await expect(host, "there's no \"Your turn\" row above the hand", (async () => !(await shown(host, "mahjong-your-turn")))());
      const picked = host.page.locator('[data-testid="mahjong-hand"] [data-testid^="mahjong-tile-"][aria-selected="true"]');
      await expect(host, "a tap picks the tile", (async () => (await picked.count()) === 1)());
      const box = await first.boundingBox();
      await host.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await host.page.mouse.down();
      for (let step = 1; step <= 8; step++) await host.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + step * 10);
      await host.page.mouse.up();
      await host.page.waitForTimeout(700);
      await expect(host, "sliding a picked tile down doesn't discard it", (async () => (await tiles.count()) === before && (await shown(host, "mahjong-turn")))());
      await expect(host, "sliding a picked tile down puts it back (nothing picked)", (async () => (await picked.count()) === 0)());
      // Scrub along the top row: the tile under the pointer is picked as it goes, and lifting keeps it picked (no discard).
      const row = [];
      for (let i = 0; i < Math.min(4, before); i++) row.push(await tiles.nth(i).boundingBox());
      const lastId = await tiles.nth(row.length - 1).getAttribute("data-testid");
      const y = row[0].y + row[0].height / 2;
      await host.page.mouse.move(row[0].x + row[0].width / 2, y);
      await host.page.mouse.down();
      // Along the row, ending on the middle of the last tile.
      for (const box of row) for (let step = 1; step <= 4; step++) await host.page.mouse.move(box.x + (step * box.width) / 4 - (box === row.at(-1) && step === 4 ? box.width / 2 : 0), y);
      await host.page.waitForTimeout(200);
      await shot(host, "scrub");
      await host.page.mouse.up();
      await host.page.waitForTimeout(500);
      await expect(host, "scrubbing along the hand picks a tile and never discards", (async () => (await tiles.count()) === before && (await shown(host, "mahjong-turn")))());
      await expect(host, "lifting off after a scrub keeps the last tile under the pointer picked", (async () => (await picked.count()) === 1 && (await picked.first().getAttribute("data-testid")) === lastId)());
    }
    await playTurn(host, seen.host);
    await playTurn(guest, seen.guest);
    if (!tookTable && !seen.tableShot && (await shown(host, "mahjong-last-discard"))) {
      seen.tableShot = true;
      await shot(host, "table");
      await shot(guest, "table");
      // The table is full screen: at a desktop window and an iPhone SE's it covers the whole window (no app sidebar beside it), with ✕ on screen to leave.
      // From a tablet up the whole hand fits in one row at the bigger size, so it's one row, and the tiles grow with the window.
      let lastTile = 0;
      for (const [width, height] of [[375, 667], [820, 1180], [1280, 800], [1920, 1080]]) {
        await host.page.setViewportSize({ width, height });
        await host.page.waitForTimeout(700);
        await shot(host, `table-${width}x${height}`);
        const table = await id(host, "mahjong-table").boundingBox();
        const leave = await id(host, "mahjong-leave").boundingBox();
        const whole = table && Math.round(table.x) <= 0 && Math.round(table.y) <= 0 && Math.round(table.x + table.width) >= width && Math.round(table.y + table.height) >= height;
        await expect(host, `the table fills the ${width}x${height} window, with ✕ to leave on screen`, Promise.resolve(Boolean(whole && leave && leave.x >= 0 && leave.y >= 0 && leave.x + leave.width <= width && leave.y + leave.height <= height)));
        await expect(host, `the chat box is on screen at ${width}x${height}`, chatBoxOnScreen(host));
        const rows = await host.page.locator('[data-testid="mahjong-hand"] > div').count();
        const tile = (await host.page.locator('[data-testid="mahjong-hand"] [data-testid^="mahjong-tile-"]').first().boundingBox())?.width ?? 0;
        await expect(host, `the hand is one row at ${width}x${height}`, Promise.resolve(rows === 1));
        if (width > 375) await expect(host, `the hand's tiles grow with the window (${Math.round(tile)} at ${width}x${height})`, Promise.resolve(tile > lastTile));
        lastTile = tile;
      }
      await host.page.setViewportSize({ width: 430, height: 900 });
      await host.page.waitForTimeout(500);
      // Tapping an opponent's plate opens their tiles (shown and let go), above your own pile so it never covers your claim chips or hand; ✕ or Escape closes it.
      const opponent = host.page.locator('[data-testid^="mahjong-plate-"]').first();
      await opponent.click();
      await expect(host, "tapping an opponent opens their tiles", appears(host, "mahjong-zoom", 5_000));
      await expect(host, "the popup shows what they've let go", shown(host, "mahjong-zoom-discards"));
      await shot(host, "opponent-popup");
      const popup = await host.page.getByTestId("mahjong-zoom-discards").boundingBox();
      const hand = await id(host, "mahjong-hand").boundingBox();
      await expect(host, "the popup stays clear of your hand", Promise.resolve(Boolean(popup && hand && popup.y + popup.height <= hand.y)));
      await id(host, "mahjong-zoom-close").click();
      await expect(host, "✕ closes the popup", (async () => (await host.page.getByTestId("mahjong-zoom").count()) === 0)());
      await opponent.click();
      await id(host, "mahjong-zoom").waitFor({ timeout: 5_000 }).catch(() => {});
      await host.page.keyboard.press("Escape");
      await host.page.waitForTimeout(300);
      await expect(host, "Escape closes the popup", (async () => (await host.page.getByTestId("mahjong-zoom").count()) === 0)());
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
  // Each claimed meld lays the claimed tile sideways (toward whoever let it go); a concealed kong has none.
  const claimedMelds = await host.page.locator('[data-testid^="mahjong-melds-"][aria-label*=" from "]').count();
  const sideways = await host.page.locator('[data-testid^="mahjong-melds-"][data-testid$="-sideways"]').count();
  if (claimedMelds === 0) notes.push("nobody claimed a meld this hand, so the sideways tile wasn't checked");
  else await expect(host, `each claimed meld lays one tile sideways (${sideways} of ${claimedMelds})`, Promise.resolve(sideways === claimedMelds));
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

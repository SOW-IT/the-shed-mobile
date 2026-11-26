import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { coinDay } from "../shared/coins";
import { MAHJONG_BANK_DAILY_CAP } from "../shared/mahjong/coins";
import { actors, TURN_MS } from "../shared/mahjong/game";
import { botControlled, DEFAULT_SETTINGS } from "../shared/mahjong/table";
import { tilesOf } from "../shared/mahjong/testTiles";
import { ABANDON_MS, BOT_MS } from "./mahjong";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const DAN = "dan@sow.org.au";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
const REFILL = 13_000;

const inCafe = async (t: T, email: string) => {
  const who = asUser(t, email);
  await who.mutation(api.world.join, {});
  const moved = await who.mutation(api.world.travel, { to: "cafe" });
  if (!moved.ok) throw new Error("travel refused");
  const member = (await t.run((ctx) => ctx.db.query("worldMembers").withIndex("by_email", (q) => q.eq("email", email)).unique()))!;
  return { who, memberId: member._id, roomId: moved.roomId };
};

const cafe = async () => {
  const t = newConvex();
  const anna = await inCafe(t, ANNA);
  const ben = await inCafe(t, BEN);
  const cara = await inCafe(t, CARA);
  later(REFILL);
  return { t, anna, ben, cara };
};

const tableRows = (t: T) => t.run((ctx) => ctx.db.query("mahjongTables").collect());
const playerRows = (t: T) => t.run((ctx) => ctx.db.query("mahjongPlayers").collect());

describe("sitting at a mahjong table", () => {
  test("the first to sit makes the table and hosts it", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-2" });
    const [table] = await tableRows(t);
    expect(table).toMatchObject({ table: "mahjong-a", phase: "lobby", host: ANNA, settings: DEFAULT_SETTINGS, handNo: 0 });
    expect(table.seats.map((s) => s.kind)).toEqual(["empty", "empty", "human", "empty"]);
    const mine = await anna.who.query(api.mahjong.mine, {});
    expect(mine).toMatchObject({ table: "mahjong-a", mySeat: 2, isHost: true, hostSeat: 2, full: false });
    expect(mine?.seats[2]).toMatchObject({ kind: "human", isMe: true, member: anna.memberId, net: 0 });
    expect(await ben.who.query(api.mahjong.mine, {})).toBeNull();
    expect(await ben.who.query(api.mahjong.tables, { roomId: ben.roomId })).toEqual([
      { id: table._id, table: "mahjong-a", phase: "lobby", seats: [
          { kind: "empty", name: "", away: false, member: null },
          { kind: "empty", name: "", away: false, member: null },
          { kind: "human", name: expect.any(String), away: false, member: anna.memberId },
          { kind: "empty", name: "", away: false, member: null },
        ],
      },
    ]);
  });

  test("others take empty seats, never someone's", async () => {
    const { t, anna, ben, cara } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    await expect(cara.who.mutation(api.world.sit, { seat: "mahjong-a-0" })).rejects.toThrow("is sitting there");
    const [table] = await tableRows(t);
    expect(table.host).toBe(ANNA);
    expect(table.seats.map((s) => (s.kind === "human" ? s.email : s.kind))).toEqual([ANNA, BEN, "empty", "empty"]);
    expect((await ben.who.query(api.mahjong.mine, {}))?.isHost).toBe(false);
    expect(await playerRows(t)).toHaveLength(2);
  });

  test("two tables are kept apart, and other Café seats aren't mahjong", async () => {
    const { t, anna, ben, cara } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-b-0" });
    await cara.who.mutation(api.world.sit, { seat: "couch-0" });
    expect((await tableRows(t)).map((r) => [r.table, r.host])).toEqual([
      ["mahjong-a", ANNA],
      ["mahjong-b", BEN],
    ]);
    expect(await cara.who.query(api.mahjong.mine, {})).toBeNull();
  });

  test("moving to another seat gives up the first", async () => {
    const { t, anna } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    later(REFILL);
    await anna.who.mutation(api.world.sit, { seat: "mahjong-b-3" });
    expect((await tableRows(t)).map((r) => r.table)).toEqual(["mahjong-b"]);
    expect((await anna.who.query(api.mahjong.mine, {}))?.mySeat).toBe(3);
    later(REFILL);
    await anna.who.mutation(api.world.sit, { seat: "mahjong-b-3" });
    expect((await anna.who.query(api.mahjong.mine, {}))?.mySeat).toBe(3);
  });

  test("the host leaving before the start hands it to the next person seated", async () => {
    const { t, anna, ben, cara } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    await cara.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-3" });
    later(REFILL);
    await anna.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    const [table] = await tableRows(t);
    expect(table.host).toBe(BEN);
    expect(table.seats[1]).toEqual({ kind: "empty" });
    expect(await anna.who.query(api.mahjong.mine, {})).toBeNull();
    expect((await ben.who.query(api.mahjong.mine, {}))?.isHost).toBe(true);
  });

  test("the table goes when the last person leaves, bots and all", async () => {
    const { t, anna } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    await anna.who.mutation(api.mahjong.addBot, { seat: 0 });
    await anna.who.mutation(api.mahjong.leave, {});
    expect(await tableRows(t)).toEqual([]);
    expect(await playerRows(t)).toEqual([]);
    const state = await t.run((ctx) => ctx.db.query("worldState").collect());
    expect(state.find((s) => s.seat !== undefined)).toBeUndefined();
  });

  test("leaving the Café or the World leaves the table", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-2" });
    later(REFILL);
    await anna.who.mutation(api.world.travel, { to: "garden" });
    expect((await tableRows(t))[0].seats[1]).toEqual({ kind: "empty" });
    await ben.who.mutation(api.world.leave, {});
    expect(await tableRows(t)).toEqual([]);
  });

  test("standing up without a mahjong seat changes nothing", async () => {
    const { t, anna } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "couch-0" });
    later(REFILL);
    await anna.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    await anna.who.mutation(api.mahjong.leave, {});
    expect(await tableRows(t)).toEqual([]);
  });
});

describe("the host's lobby", () => {
  test("adds and removes bots in empty seats", async () => {
    const { t, anna, ben, cara } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    expect(await anna.who.mutation(api.mahjong.addBot, { seat: 2 })).toEqual({ ok: true });
    expect(await anna.who.mutation(api.mahjong.addBot, { seat: 0 })).toEqual({ ok: false, reason: "That seat's taken." });
    expect(await anna.who.mutation(api.mahjong.removeBot, { seat: 1 })).toEqual({ ok: false, reason: "There's no bot there." });
    await expect(ben.who.mutation(api.world.sit, { seat: "mahjong-a-2" })).rejects.toThrow("A bot has that seat");
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    expect(await ben.who.mutation(api.mahjong.addBot, { seat: 3 })).toEqual({ ok: false, reason: "Only the host can do that." });
    expect(await cara.who.mutation(api.mahjong.addBot, { seat: 3 })).toEqual({ ok: false, reason: "Sit at a table first." });
    expect(await anna.who.mutation(api.mahjong.removeBot, { seat: 2 })).toEqual({ ok: true });
    await cara.who.mutation(api.world.sit, { seat: "mahjong-a-2" });
    await anna.who.mutation(api.mahjong.addBot, { seat: 3 });
    const [table] = await tableRows(t);
    expect(table.seats).toEqual([
      { kind: "human", email: ANNA, name: expect.any(String) },
      { kind: "human", email: BEN, name: expect.any(String) },
      { kind: "human", email: CARA, name: expect.any(String) },
      { kind: "bot", name: "Lotus Bot" },
    ]);
    expect((await anna.who.query(api.mahjong.mine, {}))?.full).toBe(true);
    await expect(anna.who.mutation(api.mahjong.addBot, { seat: 4 })).rejects.toThrow("That isn't a seat.");
    await expect(anna.who.mutation(api.mahjong.removeBot, { seat: -1 })).rejects.toThrow("That isn't a seat.");
  });

  test("changes the settings, within the limits", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    const settings = { minFaan: 1, maxFaan: 13, flowers: false, stake: 2 };
    expect(await anna.who.mutation(api.mahjong.setSettings, { settings })).toEqual({ ok: true });
    expect((await tableRows(t))[0].settings).toEqual(settings);
    expect(await ben.who.mutation(api.mahjong.setSettings, { settings })).toEqual({ ok: false, reason: "Only the host can do that." });
    await expect(anna.who.mutation(api.mahjong.setSettings, { settings: { ...settings, minFaan: 14 } })).rejects.toThrow("Those settings don't work.");
  });
});

test("nobody outside the room sees its tables", async () => {
  const { anna } = await cafe();
  const t2 = newConvex();
  const dan = await inCafe(t2, DAN);
  expect(await anna.who.query(api.mahjong.tables, { roomId: anna.roomId })).toEqual([]);
  expect(await asUser(t2, ANNA).query(api.mahjong.tables, { roomId: dan.roomId })).toBeNull();
  expect(await asUser(t2, ANNA).query(api.mahjong.mine, {})).toBeNull();
});

// ── Hands ────────────────────────────────────────────────────────────────

const handRow = async (t: T) => (await t.run((ctx) => ctx.db.query("mahjongHands").first()))!;
const wallet = (t: T, email: string) => t.run((ctx) => ctx.db.query("worldWallets").withIndex("by_email", (q) => q.eq("email", email)).unique());
const ledger = (t: T, email: string) =>
  t.run(async (ctx) => (await ctx.db.query("coinLedger").withIndex("by_email_and_at", (q) => q.eq("email", email)).collect()).filter((r) => r.kind === "mahjong"));

const setWallet = (t: T, email: string, fields: { balance?: number; mahjongBankDay?: string; mahjongBankToday?: number }) =>
  t.run(async (ctx) => {
    const row = await ctx.db.query("worldWallets").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (row) await ctx.db.patch("worldWallets", row._id, fields);
    else await ctx.db.insert("worldWallets", { email, balance: 100, earnedDay: coinDay(Date.now()), earnedToday: 0, items: {}, wallpapers: [], ...fields });
  });

/** Runs the table's scheduled tick for the hand as it is now, once its time has come. */
const tickNow = async (t: T) => {
  const row = await handRow(t);
  const table = (await tableRows(t))[0];
  const stage = row.state.stage;
  const due = stage.kind === "intro" ? stage.until : stage.kind === "over" ? Date.now() : stage.deadline;
  const bots = botControlled(table.seats);
  const botActs = actors(row.state).some((s) => bots[s]);
  vi.setSystemTime(Math.max(Date.now(), botActs ? Date.now() + BOT_MS : due));
  await t.mutation(internal.mahjong.tick, { tableId: table._id, beat: row.beat });
};

/** Anna and Ben at table A (seats 0 and 1), bots in 2 and 3, a hand started. */
const twoAndTwoBots = async () => {
  const set = await cafe();
  const { anna, ben } = set;
  await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
  await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
  await anna.who.mutation(api.mahjong.addBot, { seat: 2 });
  await anna.who.mutation(api.mahjong.addBot, { seat: 3 });
  expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: true });
  return set;
};

/** Puts the hand into a turn of the given seat, with set tiles: the rest of the deal stays. */
const rigTurn = async (t: T, seat: number, hand: string, opts: { dealer?: number; drawn?: boolean } = {}) => {
  const row = await handRow(t);
  const state = structuredClone(row.state);
  const tiles = tilesOf(hand);
  // Take those tiles out of wherever they were, and give the seat's old tiles back to the wall.
  for (const s of state.seats) s.hand = s.hand.filter((x) => !tiles.includes(x));
  state.wall = [...state.wall.filter((x) => !tiles.includes(x)), ...state.seats[seat].hand];
  state.seats[seat].hand = tiles;
  for (const [i, s] of state.seats.entries()) {
    if (i === seat) continue;
    while (s.hand.length < 13) s.hand.push(state.wall.shift()!);
    s.hand = s.hand.slice(0, 13);
  }
  // No flowers, so the faan don't depend on the deal.
  for (const s of state.seats) s.flowers = [];
  state.dealer = opts.dealer ?? 0;
  state.calls = 1;
  for (const s of state.seats) s.turns = 1;
  state.stage = { kind: "turn", seat, drawn: opts.drawn === false ? null : tiles[tiles.length - 1], deadline: Date.now() + TURN_MS, replacement: false, claimed: false };
  await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state, beat: row.beat + 1 }));
};

describe("a hand", () => {
  test("starting deals, rolls the dice and shows each player only their own tiles", async () => {
    const { t, anna, ben, cara } = await twoAndTwoBots();
    const [table] = await tableRows(t);
    expect(table).toMatchObject({ phase: "playing", handNo: 1 });
    expect(table.firstDealer).toBe(table.dealer);
    const mine = (await anna.who.query(api.mahjong.mine, {}))!;
    expect(mine.hand?.stage.kind).toBe("intro");
    expect(mine.hand?.seats[0].hand).toHaveLength(table.dealer === 0 ? 14 : 13);
    expect(mine.hand?.seats.slice(1).every((s) => s.hand === null)).toBe(true);
    expect(mine.hand?.dice).toHaveLength(3);
    expect((await ben.who.query(api.mahjong.mine, {}))?.hand?.seats[1].hand).not.toBeNull();
    expect(await cara.who.query(api.mahjong.mine, {})).toBeNull();
    expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: false, reason: "The game's started." });
  });

  test("the host can't start until every seat is filled", async () => {
    const { anna } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: false, reason: "Fill every seat first." });
  });

  test("bots play their turns, a player's clock runs out, and the hand reaches its end", async () => {
    const { t, anna } = await twoAndTwoBots();
    let ticks = 0;
    while ((await tableRows(t))[0].phase === "playing") {
      await tickNow(t);
      expect(++ticks).toBeLessThan(800);
    }
    const [table] = await tableRows(t);
    expect(table.phase).toBe("ended");
    const row = await handRow(t);
    expect(row.state.stage.kind).toBe("over");
    expect(row.settled?.deltas).toHaveLength(4);
    const mine = (await anna.who.query(api.mahjong.mine, {}))!;
    expect(mine.hand?.stage.kind).toBe("over");
    expect(mine.settled).toEqual(row.settled);
    // What each person was paid or paid is in their ledger and their score.
    const annaCoins = (await ledger(t, ANNA)).reduce((sum, r) => sum + r.delta, 0);
    expect(annaCoins).toBe(table.net[0]);
    expect((await wallet(t, ANNA))!.balance).toBe(100 + annaCoins);
  });

  test("a player moves only on their turn, and only with their tiles", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    expect(await ben.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: tilesOf("R")[0] } })).toEqual({ ok: false, reason: "It's not your turn." });
    expect(await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: 999 } })).toEqual({ ok: false, reason: "That tile isn't in your hand." });
    expect(await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: tilesOf("R")[0] } })).toEqual({ ok: true });
    const row = await handRow(t);
    expect(row.state.seats[0].discards.map((d) => d.tile)).toEqual(tilesOf("R"));
    expect(await asUser(t, CARA).mutation(api.mahjong.play, { move: { kind: "win" } })).toEqual({ ok: false, reason: "There's no hand being played." });
  });

  test("a stale tick does nothing", async () => {
    const { t } = await twoAndTwoBots();
    const before = await handRow(t);
    await t.mutation(internal.mahjong.tick, { tableId: before.tableId, beat: before.beat + 5 });
    expect((await handRow(t)).beat).toBe(before.beat);
  });
});

describe("coins", () => {
  // 123p 456p 789p RRR 55p, self-drawn: mixed one suit 3, dragon 1, self-drawn 1, concealed 1, no flowers 1 = 7 faan = 48 points.
  const WIN = "123p 456p 789p RRR 55p";

  test("a self-drawn win: Ben pays half from his coins, and the bank pays the bots' halves", async () => {
    const { t, anna } = await twoAndTwoBots();
    await rigTurn(t, 0, WIN);
    expect(await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } })).toEqual({ ok: true });
    const row = await handRow(t);
    const result = row.state.stage.kind === "over" ? row.state.stage.result : null;
    expect(result).toMatchObject({ kind: "win", winner: 0, from: null, faan: 7, points: 48 });
    expect(row.settled).toEqual({ deltas: [72, -24, -24, -24], fromBank: [48, 0, 0, 0] });
    expect((await wallet(t, ANNA))!.balance).toBe(172);
    expect((await wallet(t, BEN))!.balance).toBe(76);
    expect((await wallet(t, ANNA))).toMatchObject({ mahjongBankToday: 48 });
    expect((await ledger(t, BEN)).map((r) => [r.delta, r.runId])).toEqual([[-24, `mahjong:${row._id}`]]);
    const [table] = await tableRows(t);
    expect(table).toMatchObject({ phase: "ended", net: [72, -24, -24, -24] });
    // Anna cheers in the World.
    const state = await t.run((ctx) => ctx.db.query("worldState").collect());
    expect(state.some((s) => s.act?.emote === "cheer")).toBe(true);
  });

  test("nobody pays more than they have", async () => {
    const { t, anna } = await twoAndTwoBots();
    await setWallet(t, BEN, { balance: 10 });
    await rigTurn(t, 0, WIN);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    expect((await handRow(t)).settled?.deltas).toEqual([58, -10, -24, -24]);
    expect((await wallet(t, BEN))!.balance).toBe(0);
  });

  test("the bank pays at most its daily cap", async () => {
    const { t, anna } = await twoAndTwoBots();
    await setWallet(t, ANNA, { mahjongBankDay: coinDay(Date.now()), mahjongBankToday: MAHJONG_BANK_DAILY_CAP - 30 });
    await rigTurn(t, 0, WIN);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    expect((await handRow(t)).settled).toEqual({ deltas: [54, -24, -24, -6], fromBank: [30, 0, 0, 0] });
    expect(await wallet(t, ANNA)).toMatchObject({ mahjongBankToday: MAHJONG_BANK_DAILY_CAP });
  });

  test("a human who feeds a bot pays the bank, and a stake of 0 moves nothing", async () => {
    const { t, anna } = await twoAndTwoBots();
    await rigTurn(t, 2, WIN, { drawn: false });
    // Anna discards into the bot's win.
    const row = await handRow(t);
    const state = structuredClone(row.state);
    const winTile = state.seats[2].hand.pop()!;
    state.seats[0].hand = [...state.seats[0].hand.slice(0, 13), winTile];
    state.stage = { kind: "turn", seat: 0, drawn: winTile, deadline: Date.now() + TURN_MS, replacement: false, claimed: false };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state }));
    await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: winTile } });
    // The bot answers its claim window.
    await tickNow(t);
    const after = await handRow(t);
    expect(after.state.stage.kind === "over" && after.state.stage.result).toMatchObject({ kind: "win", winner: 2, from: 0 });
    const result = after.state.stage.kind === "over" && after.state.stage.result.kind === "win" ? after.state.stage.result : null;
    expect(after.settled?.deltas[0]).toBe(-result!.points);
    expect((await wallet(t, ANNA))!.balance).toBe(100 - result!.points);
    expect(await ledger(t, BEN)).toEqual([]);
  });

  test("a stake of 0 moves no coins", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    await anna.who.mutation(api.mahjong.setSettings, { settings: { ...DEFAULT_SETTINGS, stake: 0 } });
    await anna.who.mutation(api.mahjong.addBot, { seat: 2 });
    await anna.who.mutation(api.mahjong.addBot, { seat: 3 });
    await anna.who.mutation(api.mahjong.start, {});
    await rigTurn(t, 0, WIN);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    expect((await handRow(t)).settled?.deltas).toEqual([0, 0, 0, 0]);
    expect(await ledger(t, ANNA)).toEqual([]);
  });
});

describe("taking over a bot mid-hand", () => {
  test("hands over the bot's tiles, melds and score, and keeps the host and turn order", async () => {
    const { t, anna, ben, cara } = await twoAndTwoBots();
    await rigTurn(t, 2, "123p 456p 789p 23s 45s RG");
    const before = await handRow(t);
    await t.run(async (ctx) => {
      const table = (await ctx.db.query("mahjongTables").first())!;
      await ctx.db.patch("mahjongTables", table._id, { net: [5, -5, 12, -12] });
    });
    // Cara sits in the bot's seat (bots aren't drawn in the World, so it looks free) and takes over.
    await cara.who.mutation(api.world.sit, { seat: "mahjong-a-2" });
    expect(await cara.who.query(api.mahjong.mine, {})).toBeNull();
    const [table] = await tableRows(t);
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 3 })).toEqual({ ok: false, reason: "Sit in that seat first." });
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 2 })).toEqual({ ok: true });
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 2 })).toEqual({ ok: false, reason: "A bot isn't playing that seat." });
    const after = await handRow(t);
    expect(after.state.seats).toEqual(before.state.seats);
    expect(after.state.stage).toEqual(before.state.stage);
    const [taken] = await tableRows(t);
    expect(taken.host).toBe(ANNA);
    expect(taken.seats.map((s) => s.kind)).toEqual(["human", "human", "human", "bot"]);
    expect(botControlled(taken.seats)).toEqual([false, false, false, true]);
    const mine = (await cara.who.query(api.mahjong.mine, {}))!;
    expect(mine).toMatchObject({ mySeat: 2, isHost: false });
    expect(mine.seats[2]).toMatchObject({ isMe: true, net: 12 });
    expect(mine.hand?.seats[2].hand).toEqual(before.state.seats[2].hand);
    expect(mine.hand?.stage).toMatchObject({ kind: "turn", seat: 2 });
    // It's her turn now, not the bot's: a tick before her clock runs out leaves it to her.
    const row = await handRow(t);
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat });
    expect((await handRow(t)).state.seats[2].discards).toHaveLength(before.state.seats[2].discards.length);
    expect(await cara.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: tilesOf("R")[0] } })).toEqual({ ok: true });
    // Play passes on in the same order: the bot in seat 3 is next.
    expect((await handRow(t)).state.stage).toMatchObject({ kind: "turn", seat: 3 });
    void anna;
    void ben;
  });

  test("a seat kept for someone who walked away can't be taken, and they can sit back in it", async () => {
    const { t, anna, ben, cara } = await twoAndTwoBots();
    later(REFILL);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    const [table] = await tableRows(t);
    expect(table.seats[1]).toMatchObject({ kind: "human", email: BEN, away: Date.now() });
    expect(botControlled(table.seats)).toEqual([false, true, true, true]);
    await expect(cara.who.mutation(api.world.sit, { seat: "mahjong-a-1" })).rejects.toThrow("That seat's kept for");
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 1 })).toEqual({ ok: false, reason: "Sit in that seat first." });
    expect(await ben.who.mutation(api.mahjong.play, { move: { kind: "win" } })).toEqual({ ok: false, reason: "Sit back down to play." });
    later(REFILL);
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    expect((await tableRows(t))[0].seats[1]).toEqual({ kind: "human", email: BEN, name: expect.any(String) });
    void anna;
  });

  test("lobby bots can't be sat over, and nobody can take over before the start", async () => {
    const { t, anna, cara } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await anna.who.mutation(api.mahjong.addBot, { seat: 1 });
    const [table] = await tableRows(t);
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 1 })).toEqual({ ok: false, reason: "Sit in that seat first." });
    await expect(cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 9 })).rejects.toThrow("That isn't a seat.");
  });
});

describe("watching", () => {
  test("shows everyone in the Café the table without any concealed tiles, and lets them do nothing", async () => {
    const { t, anna, cara } = await twoAndTwoBots();
    await rigTurn(t, 0, "1111p 456p 789p 23s RG", { drawn: false });
    await anna.who.mutation(api.mahjong.play, { move: { kind: "kong", tileKind: 0 } });
    const [table] = await tableRows(t);
    const view = (await cara.who.query(api.mahjong.watching, { tableId: table._id }))!;
    expect(view.seats.map((s) => s.kind)).toEqual(["human", "human", "bot", "bot"]);
    expect(view.hand?.seats.every((s) => s.hand === null)).toBe(true);
    expect(view.hand?.seats.map((s) => s.concealed)).toEqual((await handRow(t)).state.seats.map((s) => s.hand.length));
    expect(view.hand?.seats[0].melds[0].tiles).toEqual([-1, -1, -1, -1]);
    expect(view.hand?.mine).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/"wall"/);
    expect(await cara.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: 0 } })).toEqual({ ok: false, reason: "There's no hand being played." });
    // Not from another place.
    later(REFILL);
    await cara.who.mutation(api.world.travel, { to: "garden" });
    expect(await cara.who.query(api.mahjong.watching, { tableId: table._id })).toBeNull();
  });

  test("there's nothing to watch in the lobby", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    const [table] = await tableRows(t);
    expect(await ben.who.query(api.mahjong.watching, { tableId: table._id })).toBeNull();
  });
});

describe("walking away and coming back", () => {
  test("a bot plays for someone who left, and their seat is freed once the hand ends", async () => {
    const { t, ben } = await twoAndTwoBots();
    later(REFILL);
    await ben.who.mutation(api.world.travel, { to: "garden" });
    while ((await tableRows(t))[0].phase === "playing") await tickNow(t);
    const [table] = await tableRows(t);
    expect(table.seats[1]).toEqual({ kind: "empty" });
    expect(await ben.who.query(api.mahjong.mine, {})).toBeNull();
  });

  test("coming back to the Café mid-hand goes to the table's room", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    later(REFILL);
    await ben.who.mutation(api.world.travel, { to: "garden" });
    later(REFILL);
    const back = await ben.who.mutation(api.world.travel, { to: "cafe" });
    expect(back.ok && back.roomId).toBe(anna.roomId);
    expect((await ben.who.query(api.mahjong.tables, { roomId: anna.roomId }))?.[0].seats[1]).toMatchObject({ kind: "human", away: true });
    void t;
  });

  test("the hand waits when everyone has gone, and is given up if nobody comes back", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    later(REFILL);
    await anna.who.mutation(api.world.travel, { to: "garden" });
    await ben.who.mutation(api.world.travel, { to: "garden" });
    const [table] = await tableRows(t);
    expect(table.allAwayAt).toBe(Date.now());
    const row = await handRow(t);
    await t.mutation(internal.mahjong.tick, { tableId: table._id, beat: row.beat });
    expect((await handRow(t)).beat).toBe(row.beat);
    vi.setSystemTime(Date.now() + ABANDON_MS);
    await t.mutation(internal.mahjong.tick, { tableId: table._id, beat: row.beat });
    expect(await tableRows(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("mahjongHands").collect())).toEqual([]);
    expect(await ledger(t, ANNA)).toEqual([]);
  });

  test("someone coming back stops the wait", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    later(REFILL);
    await anna.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 3 });
    expect((await tableRows(t))[0].allAwayAt).toBeDefined();
    later(REFILL);
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    expect((await tableRows(t))[0].allAwayAt).toBeUndefined();
  });
});

describe("another round", () => {
  const playOut = async (t: T) => {
    while ((await tableRows(t))[0].phase === "playing") await tickNow(t);
  };

  test("starts once everyone has asked, with the dealer moving on or staying", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await playOut(t);
    const ended = (await tableRows(t))[0];
    expect(await anna.who.mutation(api.mahjong.again, {})).toEqual({ ok: true });
    expect((await tableRows(t))[0]).toMatchObject({ phase: "ended", seats: expect.arrayContaining([expect.objectContaining({ email: ANNA, ready: true })]) });
    expect((await anna.who.query(api.mahjong.mine, {}))?.seats[0].ready).toBe(true);
    expect(await ben.who.mutation(api.mahjong.again, {})).toEqual({ ok: true });
    const next = (await tableRows(t))[0];
    expect(next).toMatchObject({ phase: "playing", handNo: 2, dealer: ended.dealer, roundWind: ended.roundWind, net: ended.net });
    expect((await handRow(t)).state.dealer).toBe(ended.dealer);
    expect(await anna.who.mutation(api.mahjong.again, {})).toEqual({ ok: false, reason: "That round's gone." });
  });

  test("goes back to the lobby when a seat has emptied", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await playOut(t);
    later(REFILL);
    await ben.who.mutation(api.mahjong.leave, {});
    expect((await tableRows(t))[0]).toMatchObject({ phase: "ended" });
    await anna.who.mutation(api.mahjong.again, {});
    expect((await tableRows(t))[0]).toMatchObject({ phase: "lobby" });
  });
});

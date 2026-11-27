import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { coinDay } from "../shared/coins";
import { actors, TURN_MS } from "../shared/mahjong/game";
import { botControlled, DEFAULT_SETTINGS } from "../shared/mahjong/table";
import { tilesOf } from "../shared/mahjong/testTiles";
import { ABANDON_MS, BOT_MS } from "./mahjong";
import { coinsFor } from "../shared/mahjong/coins";

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
    const settings = { minFaan: 1, maxFaan: 13, stake: 1, turnSeconds: 15, claimSeconds: 8 };
    expect(await anna.who.mutation(api.mahjong.setSettings, { settings })).toEqual({ ok: true });
    expect((await tableRows(t))[0].settings).toEqual(settings);
    expect(await ben.who.mutation(api.mahjong.setSettings, { settings })).toEqual({ ok: false, reason: "Only the host can do that." });
    await expect(anna.who.mutation(api.mahjong.setSettings, { settings: { ...settings, minFaan: 14 } })).rejects.toThrow("Those settings don't work.");
    await expect(anna.who.mutation(api.mahjong.setSettings, { settings: { ...settings, stake: 2 } })).rejects.toThrow("Those settings don't work.");
  });

  test("switching coins on or off clears the table's scores, so points and coins never mix; other changes keep them", async () => {
    const { t, anna } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await t.run(async (ctx) => {
      const table = (await ctx.db.query("mahjongTables").first())!;
      await ctx.db.patch("mahjongTables", table._id, { net: [48, -16, -16, -16] });
    });
    await anna.who.mutation(api.mahjong.setSettings, { settings: { ...DEFAULT_SETTINGS, turnSeconds: 45 } });
    expect((await tableRows(t))[0].net).toEqual([48, -16, -16, -16]);
    await anna.who.mutation(api.mahjong.setSettings, { settings: { ...DEFAULT_SETTINGS, coins: true } });
    expect((await tableRows(t))[0].net).toEqual([0, 0, 0, 0]);
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

const FOR_COINS = { ...DEFAULT_SETTINGS, coins: true, minFaan: 3, maxFaan: 8 };

/** Anna and Ben at table A (seats 0 and 1), bots in 2 and 3, a hand started. */
const twoAndTwoBots = async (settings?: typeof DEFAULT_SETTINGS) => {
  const set = await cafe();
  const { anna, ben } = set;
  await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
  await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
  if (settings) await anna.who.mutation(api.mahjong.setSettings, { settings });
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
    state.wall.push(...s.hand.slice(13));
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
    const { t, anna } = await twoAndTwoBots(FOR_COINS);
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

  test("a move after the clock has run out is refused", async () => {
    const { t, anna } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    vi.setSystemTime(Date.now() + TURN_MS + 1);
    expect(await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: tilesOf("R")[0] } })).toEqual({ ok: false, reason: "Time's up." });
  });

  test("an early tick during the deal waits for it, and a tick from another hand does nothing", async () => {
    const { t } = await twoAndTwoBots();
    const row = await handRow(t);
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat, handNo: row.handNo });
    expect((await handRow(t)).state.stage.kind).toBe("intro");
    const until = row.state.stage.kind === "intro" ? row.state.stage.until : 0;
    vi.setSystemTime(until);
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat, handNo: row.handNo + 1 });
    expect((await handRow(t)).state.stage.kind).toBe("intro");
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat, handNo: row.handNo });
    expect((await handRow(t)).state.stage.kind).toBe("turn");
  });

  test("a claim isn't settled before its deadline, even by an early tick", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    const row = await handRow(t);
    const state = structuredClone(row.state);
    state.stage = { kind: "claim", from: 0, tile: tilesOf("R")[0], deadline: Date.now() + 5000, rob: false, offers: [null, { hu: false, pong: true, kong: false, chows: [] }, null, null], answers: [null, null, null, null] };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state, beat: row.beat + 1 }));
    vi.setSystemTime(Date.now() + 4850);
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat + 1, handNo: row.handNo });
    expect((await handRow(t)).state.stage.kind).toBe("claim");
    void anna;
    void ben;
  });

  test("a bot can't answer a claim once its window has closed", async () => {
    const { t, anna } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    const row = await handRow(t);
    const state = structuredClone(row.state);
    state.stage = { kind: "claim", from: 0, tile: tilesOf("R")[0], deadline: Date.now() + 5000, rob: false, offers: [null, null, { hu: true, pong: false, kong: false, chows: [] }, null], answers: [null, null, null, null] };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state, beat: row.beat + 1 }));
    vi.setSystemTime(Date.now() + 6000);
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat + 1, handNo: row.handNo });
    expect((await handRow(t)).state.stage.kind).toBe("turn");
    void anna;
  });

  test("nobody can take over a bot's seat while its discard is being claimed", async () => {
    const { t, cara } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    const row = await handRow(t);
    const state = structuredClone(row.state);
    state.stage = { kind: "claim", from: 2, tile: tilesOf("R")[0], deadline: Date.now() + 5000, rob: false, offers: [{ hu: false, pong: true, kong: false, chows: [] }, null, null, null], answers: [null, null, null, null] };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state, beat: row.beat + 1 }));
    await cara.who.mutation(api.world.sit, { seat: "mahjong-a-2" });
    const [table] = await tableRows(t);
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 2 })).toEqual({ ok: false, reason: "Wait for the claim on the bot's discard to settle." });
  });

  test("someone walking away doesn't give the player whose turn it is more time", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    const deadline = (await handRow(t)).state.stage;
    vi.setSystemTime(Date.now() + TURN_MS - 2000);
    later(0);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    expect((await handRow(t)).state.stage).toMatchObject({ kind: "turn", seat: 0, deadline: deadline.kind === "turn" ? deadline.deadline : 0 });
    void anna;
  });

  test("a table's own turn and claim times set the clocks, and bots answer inside a 3 second claim", async () => {
    const { t, anna } = await twoAndTwoBots({ ...DEFAULT_SETTINGS, turnSeconds: 10, claimSeconds: 3 });
    const row = await handRow(t);
    const until = row.state.stage.kind === "intro" ? row.state.stage.until : 0;
    vi.setSystemTime(until);
    await t.mutation(internal.mahjong.tick, { tableId: row.tableId, beat: row.beat, handNo: row.handNo });
    const turn = (await handRow(t)).state.stage;
    expect(turn).toMatchObject({ kind: "turn", deadline: until + 10_000 });
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    const rigged = await handRow(t);
    const state = structuredClone(rigged.state);
    const [red, red2, red3] = [124, 125, 126];
    for (const s of state.seats) s.hand = s.hand.filter((x) => x !== red2 && x !== red3);
    state.seats[0].hand = state.seats[0].hand.filter((x) => x !== red);
    state.seats[2].hand = [...state.seats[2].hand.slice(0, 11), red2, red3];
    state.stage = { kind: "claim", from: 0, tile: red, deadline: Date.now() + 3000, rob: false, offers: [null, null, { hu: false, pong: true, kong: false, chows: [] }, null], answers: [null, null, null, null] };
    await t.run((ctx) => ctx.db.patch("mahjongHands", rigged._id, { state, beat: rigged.beat + 1 }));
    vi.setSystemTime(Date.now() + BOT_MS);
    await t.mutation(internal.mahjong.tick, { tableId: rigged.tableId, beat: rigged.beat + 1, handNo: rigged.handNo });
    const after = (await handRow(t)).state;
    const answeredAt = Date.now();
    if (after.stage.kind === "turn" && after.stage.seat === 2) expect(after.seats[2].melds.at(-1)).toMatchObject({ type: "pong", claimed: red });
    else expect(after.stage).toMatchObject({ kind: "turn", seat: 1, deadline: answeredAt + 10_000 });
    expect(answeredAt).toBeLessThan(state.stage.kind === "claim" ? state.stage.deadline : 0);
    expect(await t.mutation(api.mahjong.setSettings, { settings: { ...DEFAULT_SETTINGS, turnSeconds: 61 } }).catch((e: Error) => e.message)).toContain("Those settings don't work");
    void anna;
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

  const allCoins = (t: T) => t.run(async (ctx) => (await ctx.db.query("worldWallets").collect()).reduce((sum, w) => sum + w.balance, 0));

  test("a self-drawn win collects only from the people at the table, never from the bots", async () => {
    const { t, anna } = await twoAndTwoBots(FOR_COINS);
    await rigTurn(t, 0, WIN);
    const before = await allCoins(t);
    expect(await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } })).toEqual({ ok: true });
    const row = await handRow(t);
    const result = row.state.stage.kind === "over" ? row.state.stage.result : null;
    expect(result).toMatchObject({ kind: "win", winner: 0, from: null, faan: 6, points: 32 });
    expect(row.settled).toEqual({ deltas: [2, -2, 0, 0], fromBank: [0, 0, 0, 0] });
    expect((await wallet(t, ANNA))!.balance).toBe(102);
    expect((await wallet(t, BEN))!.balance).toBe(98);
    expect((await ledger(t, BEN)).map((r) => [r.delta, r.runId])).toEqual([[-2, `mahjong:${row._id}`]]);
    expect(await allCoins(t)).toBe(before);
    const [table] = await tableRows(t);
    expect(table).toMatchObject({ phase: "ended", net: [2, -2, 0, 0] });
    const state = await t.run((ctx) => ctx.db.query("worldState").collect());
    expect(state.some((s) => s.act?.emote === "cheer")).toBe(true);
  });

  test("nobody pays more than they have", async () => {
    const { t, anna } = await twoAndTwoBots(FOR_COINS);
    await setWallet(t, BEN, { balance: 1 });
    await rigTurn(t, 0, WIN);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    expect((await handRow(t)).settled?.deltas).toEqual([1, -1, 0, 0]);
    expect((await wallet(t, BEN))!.balance).toBe(0);
  });

  test("feeding a bot's win costs a person nothing, and a bot's win moves no coins", async () => {
    const { t, anna } = await twoAndTwoBots(FOR_COINS);
    await rigTurn(t, 2, WIN, { drawn: false });
    const row = await handRow(t);
    const state = structuredClone(row.state);
    const winTile = state.seats[2].hand.pop()!;
    state.seats[0].hand = [...state.seats[0].hand.slice(0, 13), winTile];
    state.stage = { kind: "turn", seat: 0, drawn: winTile, deadline: Date.now() + TURN_MS, replacement: false, claimed: false };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state }));
    await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: winTile } });
    await asUser(t, BEN).mutation(api.mahjong.play, { move: { kind: "answer", answer: { kind: "pass" } } });
    await tickNow(t);
    const after = await handRow(t);
    expect(after.state.stage.kind === "over" && after.state.stage.result).toMatchObject({ kind: "win", winner: 2, from: 0 });
    expect(after.settled?.deltas).toEqual([0, 0, 0, 0]);
    expect((await wallet(t, ANNA))!.balance).toBe(100);
    expect(await ledger(t, ANNA)).toEqual([]);
  });

  test("giving up mid-hand pays the others what a minimum win off your discard costs, and a bot takes the seat", async () => {
    const { t, anna, ben } = await twoAndTwoBots(FOR_COINS);
    const before = await allCoins(t);
    expect((await anna.who.query(api.mahjong.mine, {}))?.giveUpCost).toBe(1);
    later(REFILL);
    await anna.who.mutation(api.mahjong.leave, {});
    const [table] = await tableRows(t);
    expect(table.seats[0]).toMatchObject({ kind: "bot" });
    expect(table.net[1]).toBe(1);
    expect((await wallet(t, ANNA))!.balance).toBe(99);
    expect((await wallet(t, BEN))!.balance).toBe(101);
    expect(await anna.who.query(api.mahjong.mine, {})).toBeNull();
    expect(await allCoins(t)).toBe(before);
    expect((await ben.who.query(api.mahjong.mine, {}))?.giveUpCost).toBe(0);
  });

  test("walking off and not coming back before the end costs the same as giving up", async () => {
    const { t, ben } = await twoAndTwoBots(FOR_COINS);
    later(REFILL);
    await ben.who.mutation(api.world.travel, { to: "garden" });
    const before = await allCoins(t);
    while ((await tableRows(t))[0].phase === "playing") await tickNow(t);
    const row = await handRow(t);
    const settled = row.settled!;
    const result = row.state.stage.kind === "over" ? row.state.stage.result : null;
    const benDiscardedTheWin = result?.kind === "win" && result.from === 1;
    if (!benDiscardedTheWin) {
      expect(settled.deltas[1]).toBe(-1);
      expect((await wallet(t, BEN))!.balance).toBe(99);
    } else expect(settled.deltas[1]).toBeLessThanOrEqual(0);
    expect(settled.deltas[2] + settled.deltas[3]).toBe(0);
    expect(await allCoins(t)).toBe(before);
  });

  const claimOnAnnasDiscard = async (t: T) => {
    await rigTurn(t, 1, WIN, { drawn: false });
    const row = await handRow(t);
    const state = structuredClone(row.state);
    const winTile = state.seats[1].hand.pop()!;
    state.seats[0].hand = [...state.seats[0].hand.slice(0, 13), winTile];
    state.stage = { kind: "turn", seat: 0, drawn: winTile, deadline: Date.now() + TURN_MS, replacement: false, claimed: false };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state }));
    return winTile;
  };

  test("the discarder can't give up while the others answer their discard", async () => {
    const { t, anna } = await twoAndTwoBots(FOR_COINS);
    const winTile = await claimOnAnnasDiscard(t);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: winTile } });
    expect((await handRow(t)).state.stage).toMatchObject({ kind: "claim", from: 0 });
    later(REFILL);
    expect(await anna.who.mutation(api.mahjong.leave, {})).toEqual({ ok: false, reason: "Wait for the others to answer your discard first." });
    expect((await tableRows(t))[0].seats[0]).toMatchObject({ kind: "human", email: ANNA });
  });

  test("walking off while your discard is claimed still pays the win", async () => {
    const { t, anna, ben } = await twoAndTwoBots(FOR_COINS);
    const winTile = await claimOnAnnasDiscard(t);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "discard", tile: winTile } });
    later(1000);
    await anna.who.mutation(api.world.travel, { to: "garden" });
    expect(await ben.who.mutation(api.mahjong.play, { move: { kind: "answer", answer: { kind: "hu" } } })).toEqual({ ok: true });
    if ((await handRow(t)).state.stage.kind === "claim") await tickNow(t);
    const result = (await handRow(t)).state.stage;
    const points = result.kind === "over" && result.result.kind === "win" ? result.result.points : 0;
    expect((await handRow(t)).settled?.deltas.slice(0, 2)).toEqual([-coinsFor(points), coinsFor(points)]);
    expect((await wallet(t, ANNA))!.balance).toBe(100 - coinsFor(points));
  });

  test("giving up is refused, not overcharged, when it now costs more than the question said", async () => {
    const { t, anna } = await twoAndTwoBots(FOR_COINS);
    later(REFILL);
    expect(await anna.who.mutation(api.mahjong.leave, { cost: 0 })).toEqual({ ok: false, reason: "Giving up now costs 1 SOW coin. Try again if you still want to." });
    expect((await tableRows(t))[0].seats[0]).toMatchObject({ kind: "human", email: ANNA });
    expect((await wallet(t, ANNA))?.balance ?? 100).toBe(100);
    expect(await anna.who.mutation(api.mahjong.leave, { cost: 1 })).toBeNull();
    expect((await wallet(t, ANNA))!.balance).toBe(99);
  });

  test("giving up when it plays for points moves no coins", async () => {
    const { t, anna } = await twoAndTwoBots();
    expect((await anna.who.query(api.mahjong.mine, {}))?.giveUpCost).toBe(0);
    later(REFILL);
    await anna.who.mutation(api.mahjong.leave, {});
    expect((await tableRows(t))[0].seats[0]).toMatchObject({ kind: "human", away: Date.now() });
    expect(await ledger(t, ANNA)).toEqual([]);
  });

  test("a seat's score goes with the person who leaves it", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await rigTurn(t, 0, WIN);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    later(REFILL);
    await ben.who.mutation(api.mahjong.leave, {});
    expect((await tableRows(t))[0].net).toEqual([48, 0, -16, -16]);
    await anna.who.mutation(api.mahjong.again, {});
    await anna.who.mutation(api.mahjong.removeBot, { seat: 2 });
    expect((await tableRows(t))[0].net).toEqual([48, 0, 0, -16]);
  });

  test("by default a hand is for points: the scores move and no coins do", async () => {
    const { t, anna } = await twoAndTwoBots();
    expect((await tableRows(t))[0].settings.coins).toBe(false);
    await rigTurn(t, 0, WIN);
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    expect((await handRow(t)).settled).toEqual({ deltas: [48, -16, -16, -16], fromBank: [0, 0, 0, 0] });
    expect((await tableRows(t))[0].net).toEqual([48, -16, -16, -16]);
    expect(await ledger(t, ANNA)).toEqual([]);
    expect(await ledger(t, BEN)).toEqual([]);
    expect((await wallet(t, BEN))?.balance ?? 100).toBe(100);
  });
});

describe("playing for coins", () => {
  test("someone without the most one hand can cost can't sit, and is told why", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await anna.who.mutation(api.mahjong.setSettings, { settings: { ...DEFAULT_SETTINGS, coins: true, maxFaan: 9, stake: 1 } });
    expect((await anna.who.query(api.mahjong.mine, {}))?.coinsToSit).toBe(12);
    await setWallet(t, BEN, { balance: 11 });
    await expect(ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" })).rejects.toThrow("you need 12 coins to sit (the most one hand can cost), and you have 11");
    expect((await tableRows(t))[0].seats[1]).toEqual({ kind: "empty" });
    await setWallet(t, BEN, { balance: 12 });
    later(REFILL);
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    expect((await tableRows(t))[0].seats[1]).toMatchObject({ kind: "human", email: BEN });
  });

  test("the host can't start while someone seated is short, and the lobby shows who", async () => {
    const { t, anna, ben } = await cafe();
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    await anna.who.mutation(api.mahjong.addBot, { seat: 2 });
    await anna.who.mutation(api.mahjong.addBot, { seat: 3 });
    await setWallet(t, BEN, { balance: 5 });
    await anna.who.mutation(api.mahjong.setSettings, { settings: FOR_COINS });
    expect((await anna.who.query(api.mahjong.mine, {}))?.seats.map((s) => s.short)).toEqual([false, true, false, false]);
    expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: false, reason: expect.stringContaining("needs 8 coins to play for coins, and has 5") });
    await anna.who.mutation(api.mahjong.setSettings, { settings: { ...FOR_COINS, coins: false } });
    expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: true });
  });

  test("taking over a bot needs the coins too", async () => {
    const { t, cara } = await twoAndTwoBots(FOR_COINS);
    await setWallet(t, CARA, { balance: 3 });
    await cara.who.mutation(api.world.sit, { seat: "mahjong-a-2" });
    const [table] = await tableRows(t);
    expect(await cara.who.mutation(api.mahjong.replaceBot, { tableId: table._id, seat: 2 })).toEqual({ ok: false, reason: expect.stringContaining("you need 8 coins") });
    expect((await tableRows(t))[0].seats[2].kind).toBe("bot");
  });

  test("the setting stays for the next hand, which goes back to the lobby if someone can no longer cover it", async () => {
    const { t, anna, ben } = await twoAndTwoBots(FOR_COINS);
    await rigTurn(t, 0, "123p 456p 789p RRR 55p");
    await anna.who.mutation(api.mahjong.play, { move: { kind: "win" } });
    expect((await wallet(t, BEN))!.balance).toBe(98);
    await setWallet(t, BEN, { balance: 5 });
    expect(await anna.who.mutation(api.mahjong.again, {})).toEqual({ ok: true });
    expect(await ben.who.mutation(api.mahjong.again, {})).toEqual({ ok: false, reason: expect.stringContaining("hasn't the 8 coins") });
    expect((await tableRows(t))[0]).toMatchObject({ phase: "lobby", settings: FOR_COINS });
    expect(await anna.who.mutation(api.mahjong.setSettings, { settings: { ...FOR_COINS, maxFaan: 6 } })).toEqual({ ok: true });
    expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: true });
  });

  test("the setting can't change once a hand has started", async () => {
    const { anna } = await twoAndTwoBots();
    expect(await anna.who.mutation(api.mahjong.setSettings, { settings: FOR_COINS })).toEqual({ ok: false, reason: "The game's started." });
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
    const next = (await handRow(t)).state.stage;
    expect(next.kind === "claim" ? { kind: "claim", from: next.from } : next).toMatchObject(next.kind === "claim" ? { from: 2 } : { kind: "turn", seat: 3 });
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

  test("coming back to the World mid-hand lands in the table's Café room", async () => {
    const { anna, ben } = await twoAndTwoBots();
    later(REFILL);
    await ben.who.mutation(api.world.leave, {});
    later(REFILL);
    const back = await ben.who.mutation(api.world.join, {});
    expect(back).toMatchObject({ roomId: anna.roomId, place: "cafe" });
    later(REFILL);
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    expect((await ben.who.query(api.mahjong.mine, {}))?.seats[1]).toMatchObject({ isMe: true, away: false });
  });

  const soloWithBots = async () => {
    const t = newConvex();
    const anna = await inCafe(t, ANNA);
    later(REFILL);
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    for (const seat of [1, 2, 3]) await anna.who.mutation(api.mahjong.addBot, { seat });
    expect(await anna.who.mutation(api.mahjong.start, {})).toEqual({ ok: true });
    return { t, anna };
  };
  const roomRow = (t: T, roomId: Id<"worldRooms">) => t.run((ctx) => ctx.db.get("worldRooms", roomId));

  test("the last person out of the Café mid-hand keeps the room, and comes back to their seat", async () => {
    const { t, anna } = await soloWithBots();
    later(REFILL);
    await anna.who.mutation(api.world.leave, {});
    expect(await roomRow(t, anna.roomId)).toMatchObject({ memberCount: 0 });
    later(REFILL);
    expect(await anna.who.mutation(api.world.join, {})).toMatchObject({ roomId: anna.roomId, place: "cafe" });
    later(REFILL);
    await anna.who.mutation(api.world.sit, { seat: "mahjong-a-0" });
    expect((await anna.who.query(api.mahjong.mine, {}))?.seats[0]).toMatchObject({ isMe: true, away: false });
  });

  test("an empty Café room goes with its hand when nobody comes back", async () => {
    const { t, anna } = await soloWithBots();
    later(REFILL);
    await anna.who.mutation(api.world.travel, { to: "garden" });
    expect(await roomRow(t, anna.roomId)).toMatchObject({ memberCount: 0 });
    const [table] = await tableRows(t);
    vi.setSystemTime(Date.now() + ABANDON_MS);
    await t.mutation(internal.mahjong.tick, { tableId: table._id, beat: (await handRow(t)).beat });
    expect(await tableRows(t)).toEqual([]);
    expect(await roomRow(t, anna.roomId)).toBeNull();
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

  test("sitting back down on your own turn gives you a fresh clock", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await rigTurn(t, 1, "123p 456p 789p 23s 45s RG");
    later(REFILL);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 3 });
    vi.setSystemTime(Date.now() + TURN_MS - 1000);
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    const stage = (await handRow(t)).state.stage;
    expect(stage).toMatchObject({ kind: "turn", seat: 1, deadline: Date.now() + TURN_MS });
    void anna;
  });

  test("someone in a hand can't take a seat or a bot at the other table until it's over", async () => {
    const { t, ben, cara } = await twoAndTwoBots();
    later(REFILL);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    later(REFILL);
    await expect(ben.who.mutation(api.world.sit, { seat: "mahjong-b-0" })).rejects.toThrow("Your seat at Table 1 is still in a hand");
    expect((await tableRows(t)).map((r) => r.table)).toEqual(["mahjong-a"]);
    await cara.who.mutation(api.world.sit, { seat: "mahjong-b-0" });
    await cara.who.mutation(api.mahjong.addBot, { seat: 1 });
    await cara.who.mutation(api.mahjong.addBot, { seat: 2 });
    await cara.who.mutation(api.mahjong.addBot, { seat: 3 });
    await cara.who.mutation(api.mahjong.start, {});
    const b = (await tableRows(t)).find((r) => r.table === "mahjong-b")!;
    later(REFILL);
    await t.run(async (ctx) => {
      const member = (await ctx.db.query("worldMembers").withIndex("by_email", (q) => q.eq("email", BEN)).unique())!;
      const state = (await ctx.db.query("worldState").withIndex("by_memberId", (q) => q.eq("memberId", member._id)).unique())!;
      await ctx.db.patch("worldState", state._id, { seat: "mahjong-b-1" });
    });
    expect(await ben.who.mutation(api.mahjong.replaceBot, { tableId: b._id, seat: 1 })).toEqual({ ok: false, reason: expect.stringContaining("still in a hand") });
    expect(await ben.who.query(api.mahjong.mine, {})).toMatchObject({ table: "mahjong-a", mySeat: 1 });
  });

  test("a held seat is walked away from even when the World has already stood you up", async () => {
    const { t, ben } = await twoAndTwoBots();
    await t.run(async (ctx) => {
      const member = (await ctx.db.query("worldMembers").withIndex("by_email", (q) => q.eq("email", BEN)).unique())!;
      const state = (await ctx.db.query("worldState").withIndex("by_memberId", (q) => q.eq("memberId", member._id)).unique())!;
      await ctx.db.patch("worldState", state._id, { seat: undefined });
    });
    later(REFILL);
    await ben.who.mutation(api.world.sit, { seat: "couch-0" });
    expect((await tableRows(t))[0].seats[1]).toMatchObject({ kind: "human", email: BEN, away: Date.now() });
    expect(botControlled((await tableRows(t))[0].seats)).toEqual([false, true, true, true]);
  });

  test("a claim waiting on someone who comes back gets a fresh window", async () => {
    const { t, anna, ben } = await twoAndTwoBots();
    await rigTurn(t, 0, "123p 456p 789p 23s 45s RG");
    const row = await handRow(t);
    const state = structuredClone(row.state);
    state.stage = { kind: "claim", from: 0, tile: tilesOf("R")[0], deadline: Date.now() + 5000, rob: false, offers: [null, { hu: false, pong: true, kong: false, chows: [] }, null, null], answers: [null, null, null, null] };
    await t.run((ctx) => ctx.db.patch("mahjongHands", row._id, { state }));
    later(REFILL);
    await ben.who.mutation(api.world.move, { toX: 0, toZ: 2 });
    later(30_000);
    await ben.who.mutation(api.world.sit, { seat: "mahjong-a-1" });
    expect((await handRow(t)).state.stage).toMatchObject({ kind: "claim", deadline: Date.now() + 5000 });
    void anna;
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

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { DEFAULT_SETTINGS } from "../shared/mahjong/table";

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

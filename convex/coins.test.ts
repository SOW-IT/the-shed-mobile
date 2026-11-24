import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { boardOf, START_COINS } from "../shared/coins";
import type { GameId } from "../shared/games";

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

let n = 0;
const run = (game: GameId, score: number, runId = `run-coin-${n++}`) => ({ runId, game, score, durationMs: 600_000, playedAt: Date.now() - 1000 });

const balanceOf = async (t: T, email = ANNA) => (await asUser(t, email).query(api.coins.mine, {}))?.balance;

const submit = (t: T, scores: ReturnType<typeof run>[], email = ANNA) => asUser(t, email).mutation(api.gameScores.submitScores, { scores });

/** Ben, Cara and Dan on Flap with 900, 800 and 700. */
const podium = async (t: T) => {
  await submit(t, [run("flappy", 900)], BEN);
  await submit(t, [run("flappy", 800)], CARA);
  await submit(t, [run("flappy", 700)], DAN);
};

const ledger = (t: T, email = ANNA) =>
  t.run((ctx) =>
    ctx.db
      .query("coinLedger")
      .withIndex("by_email_and_at", (q) => q.eq("email", email))
      .take(50)
  );

describe("coins", () => {
  test(`everyone starts with ${START_COINS}`, async () => {
    const t = newConvex();
    expect(await balanceOf(t)).toBe(START_COINS);
    expect(await t.query(api.coins.mine, {})).toBeNull();
  });

  test("1st on an empty board pays 50, and the ledger says for which place and board", async () => {
    const t = newConvex();
    expect((await submit(t, [run("flappy", 10, "run-first-1")])).coins).toEqual([{ runId: "run-first-1", coins: 50, place: 1 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
    expect(await ledger(t)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "game", delta: 50, runId: "run-first-1", game: "flappy", place: 1, board: boardOf("flappy") })])
    );
  });

  test.each([
    [950, 1, 50],
    [850, 2, 25],
    [750, 3, 10],
    [650, 4, 0],
  ])("a best of %i comes %i and pays %i", async (score, place, coins) => {
    const t = newConvex();
    await podium(t);
    const result = await submit(t, [run("flappy", score, "run-place-1")]);
    expect(result.coins).toEqual(coins > 0 ? [{ runId: "run-place-1", coins, place }] : []);
    expect(await balanceOf(t)).toBe(START_COINS + coins);
  });

  test("climbing pays the difference: 3rd, then 2nd, then 1st add up to 50", async () => {
    const t = newConvex();
    await podium(t);
    expect((await submit(t, [run("flappy", 750, "run-climb-3")])).coins).toEqual([{ runId: "run-climb-3", coins: 10, place: 3 }]);
    expect((await submit(t, [run("flappy", 850, "run-climb-2")])).coins).toEqual([{ runId: "run-climb-2", coins: 15, place: 2 }]);
    expect((await submit(t, [run("flappy", 950, "run-climb-1")])).coins).toEqual([{ runId: "run-climb-1", coins: 25, place: 1 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
  });

  test("jumping from 3rd straight to 1st pays 40", async () => {
    const t = newConvex();
    await podium(t);
    await submit(t, [run("flappy", 750)]);
    expect((await submit(t, [run("flappy", 950, "run-jump-1")])).coins).toEqual([{ runId: "run-jump-1", coins: 40, place: 1 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
  });

  test("a place pays once: knocked off 1st and back again pays nothing", async () => {
    const t = newConvex();
    await submit(t, [run("flappy", 500)]);
    await submit(t, [run("flappy", 600)], BEN);
    await submit(t, [run("flappy", 700)], CARA);
    await submit(t, [run("flappy", 800)], DAN);
    expect(await asUser(t, ANNA).query(api.gameScores.myLeaderboardPlace, { game: "flappy" })).toEqual({ score: 500, rank: 4 });
    expect((await submit(t, [run("flappy", 750)])).coins).toEqual([]);
    expect((await submit(t, [run("flappy", 900)])).coins).toEqual([]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
  });

  test("a lower place than one already paid pays nothing", async () => {
    const t = newConvex();
    await podium(t);
    await submit(t, [run("flappy", 850)]);
    await submit(t, [run("flappy", 950)], CARA);
    await submit(t, [run("flappy", 960)], DAN);
    expect((await submit(t, [run("flappy", 870)])).coins).toEqual([]);
    expect(await balanceOf(t)).toBe(START_COINS + 25);
  });

  test("a tie shares the place, as the leaderboard shows it", async () => {
    const t = newConvex();
    await podium(t);
    expect((await submit(t, [run("flappy", 900, "run-tie-1")])).coins).toEqual([{ runId: "run-tie-1", coins: 50, place: 1 }]);
    const board = await t.query(api.gameScores.leaderboard, { game: "flappy" });
    expect(board.top.slice(0, 2).map((row) => row.rank)).toEqual([1, 1]);
  });

  test("a run that isn't a new best pays nothing, even in the top 3", async () => {
    const t = newConvex();
    await podium(t);
    await submit(t, [run("flappy", 950)]);
    expect((await submit(t, [run("flappy", 950, "run-same-1")])).coins).toEqual([]);
    expect((await submit(t, [run("flappy", 920, "run-lower-1")])).coins).toEqual([]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
  });

  test("a run pays once, however often it's sent", async () => {
    const t = newConvex();
    const once = run("flappy", 800, "run-once-1");
    await submit(t, [once]);
    expect((await submit(t, [once])).coins).toEqual([{ runId: "run-once-1", coins: 50, place: 1 }]);
    expect((await submit(t, [once, once])).coins).toEqual([{ runId: "run-once-1", coins: 50, place: 1 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
  });

  test("a run sent twice in its first batch pays once", async () => {
    const t = newConvex();
    const twice = run("flappy", 800, "run-twice-1");
    expect((await submit(t, [twice, twice])).coins).toEqual([{ runId: "run-twice-1", coins: 50, place: 1 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 50);
  });

  test("a batch climbing the board pays each step", async () => {
    const t = newConvex();
    await podium(t);
    const result = await submit(t, [run("flappy", 750, "run-batch-3"), run("flappy", 950, "run-batch-1")]);
    expect(result.coins).toEqual([
      { runId: "run-batch-3", coins: 10, place: 3 },
      { runId: "run-batch-1", coins: 40, place: 1 },
    ]);
  });

  test("each game has its own board, Swoop's too", async () => {
    const t = newConvex();
    const result = await submit(t, [run("flappy", 800), run("shooter", 5000), run("runner", 3000), run("glider", 3000, "run-glider-1")]);
    expect(result.coins).toContainEqual({ runId: "run-glider-1", coins: 50, place: 1 });
    expect(await balanceOf(t)).toBe(START_COINS + 200);
    expect(await ledger(t)).toContainEqual(expect.objectContaining({ runId: "run-glider-1", board: boardOf("glider") }));
  });

  test("there's no daily cap: every board can pay its 50 on one day", async () => {
    const t = newConvex();
    await submit(t, [run("flappy", 800), run("shooter", 5000), run("runner", 3000), run("glider", 3000)]);
    expect(await asUser(t, ANNA).query(api.coins.mine, {})).toMatchObject({ balance: START_COINS + 200, earnedToday: 200 });
  });

  test("score-band payouts from before keep their answer and don't count against a board", async () => {
    const t = newConvex();
    const old = run("flappy", 800, "run-old-band");
    await t.run(async (ctx) => {
      await ctx.db.insert("worldWallets", { email: ANNA, balance: START_COINS + 20, earnedDay: "2000-01-01", earnedToday: 0, items: {}, wallpapers: [] });
      await ctx.db.insert("coinLedger", { email: ANNA, delta: 20, kind: "game", runId: old.runId, game: "flappy", at: 0 });
    });
    expect((await submit(t, [old])).coins).toEqual([{ runId: "run-old-band", coins: 20 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 20);
    expect((await submit(t, [run("flappy", 900, "run-new-best")])).coins).toEqual([{ runId: "run-new-best", coins: 50, place: 1 }]);
    expect(await balanceOf(t)).toBe(START_COINS + 70);
  });

  test("a rejected run pays nothing", async () => {
    const t = newConvex();
    const result = await submit(t, [{ ...run("flappy", 800, "run-too-fast"), durationMs: 1000 }]);
    expect(result.coins).toEqual([]);
    expect(await balanceOf(t)).toBe(START_COINS);
  });
});

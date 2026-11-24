import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { DAILY_COIN_CAP, START_COINS } from "../shared/coins";
import type { GameId } from "../shared/games";

const ANNA = "anna@sow.org.au";

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

const submit = (t: T, scores: ReturnType<typeof run>[]) => asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores });

describe("coins", () => {
  test(`everyone starts with ${START_COINS}`, async () => {
    const t = newConvex();
    expect(await balanceOf(t)).toBe(START_COINS);
    expect(await t.query(api.coins.mine, {})).toBeNull();
  });

  test.each([
    ["flappy", 500, 0],
    ["flappy", 501, 10],
    ["flappy", 750, 10],
    ["flappy", 751, 20],
    ["runner", 12_000, 0],
    ["runner", 12_001, 10],
    ["runner", 15_000, 10],
    ["runner", 15_001, 20],
    ["shooter", 10_000, 0],
    ["shooter", 10_001, 10],
    ["shooter", 12_000, 10],
    ["shooter", 12_001, 20],
    ["glider", 8_000, 0],
    ["glider", 8_001, 10],
    ["glider", 12_000, 10],
    ["glider", 12_001, 20],
  ] as const)("%s at %i earns %i", async (game, score, coins) => {
    const t = newConvex();
    const result = await submit(t, [run(game, score, "run-tier-1")]);
    expect(result.coins).toEqual(coins > 0 ? [{ runId: "run-tier-1", coins }] : []);
    expect(await balanceOf(t)).toBe(START_COINS + coins);
  });

  test("a run pays once, however often it's sent", async () => {
    const t = newConvex();
    const once = run("flappy", 800, "run-once-1");
    await submit(t, [once]);
    expect((await submit(t, [once])).coins).toEqual([{ runId: "run-once-1", coins: 20 }]);
    await submit(t, [once, once]);
    expect(await balanceOf(t)).toBe(START_COINS + 20);
  });

  test(`stops at ${DAILY_COIN_CAP} a day, then starts again the next day`, async () => {
    const t = newConvex();
    const runs = Array.from({ length: DAILY_COIN_CAP / 20 }, () => run("flappy", 800));
    await submit(t, runs);
    expect(await balanceOf(t)).toBe(START_COINS + DAILY_COIN_CAP);
    expect((await submit(t, [run("flappy", 800, "run-over-cap")])).coins).toEqual([{ runId: "run-over-cap", coins: 0 }]);
    expect(await balanceOf(t)).toBe(START_COINS + DAILY_COIN_CAP);
    vi.setSystemTime(PINNED_NOW + 24 * 60 * 60 * 1000);
    await submit(t, [run("flappy", 800)]);
    expect(await balanceOf(t)).toBe(START_COINS + DAILY_COIN_CAP + 20);
  });

  test("pays only up to the cap when a run crosses it", async () => {
    const t = newConvex();
    await submit(t, Array.from({ length: DAILY_COIN_CAP / 20 - 1 }, () => run("flappy", 800)));
    await submit(t, [run("flappy", 600)]);
    expect((await submit(t, [run("flappy", 800, "run-partial")])).coins).toEqual([{ runId: "run-partial", coins: 10 }]);
    expect(await balanceOf(t)).toBe(START_COINS + DAILY_COIN_CAP);
  });

  test("a rejected run pays nothing", async () => {
    const t = newConvex();
    const result = await submit(t, [{ ...run("flappy", 800, "run-too-fast"), durationMs: 1000 }]);
    expect(result.coins).toEqual([]);
    expect(await balanceOf(t)).toBe(START_COINS);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { boardOf, START_COINS } from "../shared/coins";
import type { GameId } from "../shared/games";
import { TOP3_BACKFILL } from "./coinsBackfill";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const DAN = "dan@sow.org.au";
const EVE = "eve@sow.org.au";

const PRODUCTION_URL = "https://giant-bloodhound-191.ap-southeast-2.convex.cloud";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  vi.stubEnv("CONVEX_CLOUD_URL", PRODUCTION_URL);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

let n = 0;

/** A best saved before 2.12.49, which paid no place. */
const standing = (t: T, email: string, game: GameId, score: number) =>
  t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("gameScores", { email, game, score, runId: `run-old-${n++}`, durationMs: 600_000, playedAt: now - 1000, updatedAt: now });
  });

const submit = (t: T, email: string, game: GameId, score: number) =>
  asUser(t, email).mutation(api.gameScores.submitScores, {
    scores: [{ runId: `run-new-${n++}`, game, score, durationMs: 600_000, playedAt: Date.now() - 1000 }],
  });

const backfill = (t: T) => t.mutation(internal.coinsBackfill.payStandingTop3, {});

const balanceOf = async (t: T, email: string) => (await asUser(t, email).query(api.coins.mine, {}))?.balance;

const balances = async (t: T, emails: string[]) => Promise.all(emails.map((email) => balanceOf(t, email)));

const gameRows = (t: T) =>
  t.run(async (ctx) => (await ctx.db.query("coinLedger").take(100)).filter((row) => row.kind === "game"));

describe("paying the standing top 3", () => {
  test("1st, 2nd and 3rd are paid 50, 25 and 10, and 4th nothing", async () => {
    const t = newConvex();
    await standing(t, BEN, "flappy", 900);
    await standing(t, CARA, "flappy", 800);
    await standing(t, DAN, "flappy", 700);
    await standing(t, ANNA, "flappy", 600);
    await backfill(t);
    expect(await balances(t, [BEN, CARA, DAN, ANNA])).toEqual([START_COINS + 50, START_COINS + 25, START_COINS + 10, START_COINS]);
    const board = boardOf("flappy");
    expect(await gameRows(t)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: BEN, delta: 50, place: 1, board, game: "flappy", runId: `backfill:${board}:${BEN}` }),
        expect.objectContaining({ email: CARA, delta: 25, place: 2, board, runId: `backfill:${board}:${CARA}` }),
        expect.objectContaining({ email: DAN, delta: 10, place: 3, board, runId: `backfill:${board}:${DAN}` }),
      ])
    );
    expect(await gameRows(t)).toHaveLength(3);
  });

  test("equal scores share a place, as the leaderboard shows it", async () => {
    const t = newConvex();
    // Ben and Cara share 1st, so Dan is 3rd, and Anna and Eve share 4th.
    await standing(t, BEN, "flappy", 900);
    await standing(t, CARA, "flappy", 900);
    await standing(t, DAN, "flappy", 800);
    await standing(t, ANNA, "flappy", 700);
    await standing(t, EVE, "flappy", 700);
    // On Swoop, Dan and Eve share 3rd.
    await standing(t, BEN, "glider", 900);
    await standing(t, CARA, "glider", 800);
    await standing(t, DAN, "glider", 700);
    await standing(t, EVE, "glider", 700);
    await standing(t, ANNA, "glider", 600);
    const board = await t.query(api.gameScores.leaderboard, { game: "flappy" });
    expect(board.top.map((row) => row.rank)).toEqual([1, 1, 3, 4, 4]);
    await backfill(t);
    expect(await balances(t, [BEN, CARA, DAN, ANNA, EVE])).toEqual([
      START_COINS + 50 + 50,
      START_COINS + 50 + 25,
      START_COINS + 10 + 10,
      START_COINS,
      START_COINS + 10,
    ]);
  });

  test("anyone 2.12.49 already paid gets only what the board still owes them", async () => {
    const t = newConvex();
    await standing(t, CARA, "flappy", 800);
    await standing(t, DAN, "flappy", 700);
    await standing(t, EVE, "flappy", 600);
    // Ben's new best pays 1st, and Anna's 3rd (10), the way 2.12.49 pays.
    expect((await submit(t, BEN, "flappy", 900)).coins).toMatchObject([{ coins: 50, place: 1 }]);
    expect((await submit(t, ANNA, "flappy", 750)).coins).toMatchObject([{ coins: 10, place: 3 }]);
    // Then Cara's best goes, as when someone deletes their account: Anna is 2nd.
    await t.run(async (ctx) => {
      const cara = await ctx.db
        .query("gameScores")
        .withIndex("by_email_and_game_and_version", (q) => q.eq("email", CARA).eq("game", "flappy"))
        .unique();
      await ctx.db.delete("gameScores", cara!._id);
    });
    await backfill(t);
    // Ben is still 1st and has had his 50; Anna is owed 15 more for 2nd; Dan, 3rd, 10.
    expect(await balances(t, [BEN, ANNA, DAN, EVE])).toEqual([START_COINS + 50, START_COINS + 25, START_COINS + 10, START_COINS]);
    const rows = await gameRows(t);
    expect(rows.filter((row) => row.email === BEN)).toHaveLength(1);
    expect(rows).toContainEqual(expect.objectContaining({ email: ANNA, delta: 15, place: 2, runId: `backfill:${boardOf("flappy")}:${ANNA}` }));
  });

  test("a second run pays nothing, even if the done mark were lost", async () => {
    const t = newConvex();
    await standing(t, BEN, "shooter", 5000);
    await standing(t, CARA, "shooter", 4000);
    await standing(t, DAN, "runner", 3000);
    await backfill(t);
    const paid = await balances(t, [BEN, CARA, DAN]);
    expect(paid).toEqual([START_COINS + 50, START_COINS + 25, START_COINS + 50]);
    const rows = await gameRows(t);
    expect(await t.run((ctx) => ctx.db.query("oneOffRuns").take(10))).toMatchObject([{ name: TOP3_BACKFILL }]);

    await backfill(t);
    expect(await balances(t, [BEN, CARA, DAN])).toEqual(paid);
    expect(await gameRows(t)).toEqual(rows);

    // Without its row the job runs again, and the ledger still says everyone's paid.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("oneOffRuns").take(10)) await ctx.db.delete("oneOffRuns", row._id);
    });
    await backfill(t);
    expect(await balances(t, [BEN, CARA, DAN])).toEqual(paid);
    expect(await gameRows(t)).toEqual(rows);
  });

  test("a board with fewer than 3 people pays the places it has, and an empty one nothing", async () => {
    const t = newConvex();
    await standing(t, BEN, "flappy", 900);
    await standing(t, CARA, "shooter", 5000);
    await standing(t, DAN, "shooter", 4000);
    await backfill(t);
    expect(await balances(t, [BEN, CARA, DAN, ANNA])).toEqual([START_COINS + 50, START_COINS + 50, START_COINS + 25, START_COINS]);
    expect((await gameRows(t)).map((row) => row.board).sort()).toEqual([boardOf("flappy"), boardOf("shooter"), boardOf("shooter")].sort());
  });

  test("nothing on any board still marks the job done", async () => {
    const t = newConvex();
    await backfill(t);
    expect(await gameRows(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("oneOffRuns").take(10))).toHaveLength(1);
  });

  test.each([
    ["the dev deployment", "https://successful-lynx-56.ap-southeast-2.convex.cloud"],
    ["a preview or local deployment", "http://127.0.0.1:3210"],
    ["a deployment with no URL", ""],
  ])("%s pays nothing and leaves the job for production", async (_where, url) => {
    const t = newConvex();
    await standing(t, BEN, "flappy", 900);
    vi.stubEnv("CONVEX_CLOUD_URL", url);
    await backfill(t);
    expect(await balanceOf(t, BEN)).toBe(START_COINS);
    expect(await gameRows(t)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("oneOffRuns").take(10))).toEqual([]);
  });
});

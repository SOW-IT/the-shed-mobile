import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { LEADERBOARD_SIZE, MAX_PAGE_SIZE, RANK_LIMIT, RESET_BATCH } from "./gameScores";
import { asUser, newConvex, YEAR, type T } from "../test/convexFixture";
import { MAX_RUN_MS, MAX_SCORES_PER_SUBMIT, type GameId } from "../shared/games";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";

const run = (runId: string, score: number, game: GameId = "runner") => ({
  runId,
  game,
  score,
  durationMs: 60_000,
  playedAt: Date.now() - 1000,
});

const bests = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("gameScores").collect()).map((row) => [row.email, row.game, row.score, row.runId])
  );

describe("submitScores", () => {
  test("only a signed-in person can publish scores", async () => {
    const t = newConvex();
    await expect(t.mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 100)] })).rejects.toThrow(
      /signed in/
    );
  });

  test("keeps each person's best per game, and a retried run changes nothing", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    expect(
      await anna.mutation(api.gameScores.submitScores, {
        scores: [run("run-anna-1", 300), run("run-anna-2", 50, "flappy")],
      })
    ).toEqual({
      accepted: ["run-anna-1", "run-anna-2"],
      rejected: [],
      // First on two empty boards.
      coins: [
        { runId: "run-anna-1", coins: 50, place: 1 },
        { runId: "run-anna-2", coins: 50, place: 1 },
      ],
    });
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 300)] });
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-3", 200)] });
    expect(await bests(t)).toEqual([
      [ANNA, "runner", 300, "run-anna-1"],
      [ANNA, "flappy", 50, "run-anna-2"],
    ]);
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-4", 900)] });
    expect(await bests(t)).toEqual([
      [ANNA, "runner", 900, "run-anna-4"],
      [ANNA, "flappy", 50, "run-anna-2"],
    ]);
  });

  test("turns away scores that fail the sanity limits, so the phone can drop them", async () => {
    const t = newConvex();
    const result = await asUser(t, ANNA).mutation(api.gameScores.submitScores, {
      scores: [
        { ...run("run-anna-fast", 1_000_000), durationMs: 1000 },
        { ...run("run-anna-future", 10), playedAt: Date.now() + 60 * 60 * 1000 },
        { ...run("run-anna-swoop-fast", 600_000, "glider"), durationMs: MAX_RUN_MS },
        run("run-anna-ok", 10),
        { ...run("run-anna-swoop", 9_000, "glider"), durationMs: 120_000 },
      ],
    });
    expect(result.accepted).toEqual(["run-anna-ok", "run-anna-swoop"]);
    expect(result.rejected.map((r) => r.runId)).toEqual(["run-anna-fast", "run-anna-future", "run-anna-swoop-fast"]);
    expect(await bests(t)).toEqual([
      [ANNA, "runner", 10, "run-anna-ok"],
      [ANNA, "glider", 9_000, "run-anna-swoop"],
    ]);
    expect((await t.query(api.gameScores.leaderboard, { game: "glider" })).top.map((row) => row.score)).toEqual([9_000]);
  });

  test("refuses an oversized batch", async () => {
    const t = newConvex();
    const scores = Array.from({ length: MAX_SCORES_PER_SUBMIT + 1 }, (_, i) => run(`run-anna-${i + 10}`, 10));
    await expect(asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores })).rejects.toThrow(/at most/);
  });
});

describe("leaderboard", () => {
  test("anyone can read it, signed out too, with no best of their own", async () => {
    const t = newConvex();
    expect(await t.query(api.gameScores.leaderboard, { game: "runner" })).toEqual({ top: [], me: null });
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 300)] });
    expect(await t.query(api.gameScores.leaderboard, { game: "runner" })).toEqual({
      top: [{ id: expect.any(String), rank: 1, name: "anna", score: 300, isMe: false }],
      me: null,
    });
  });

  test("lists one best per person by name, ties sharing a place, with the caller's own", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", { email: ANNA, year: YEAR, name: "Anna Lee" });
      await ctx.db.insert("users", { email: BEN, name: "Ben Ng" });
    });
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 500)] });
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [run("run-ben-01", 700)] });
    await asUser(t, CARA).mutation(api.gameScores.submitScores, {
      scores: [run("run-cara-1", 500), run("run-cara-2", 40, "shooter")],
    });
    const board = await asUser(t, ANNA).query(api.gameScores.leaderboard, { game: "runner" });
    expect(board?.top.map(({ rank, name, score, isMe }) => [rank, name, score, isMe])).toEqual([
      [1, "Ben Ng", 700, false],
      [2, expect.any(String), 500, expect.any(Boolean)],
      [2, expect.any(String), 500, expect.any(Boolean)],
    ]);
    expect(board?.top.map((row) => row.name).sort()).toEqual(["Anna Lee", "Ben Ng", "cara"]);
    expect(board?.me).toEqual({ score: 500, rank: 2 });
    expect(await asUser(t, BEN).query(api.gameScores.leaderboard, { game: "shooter" })).toEqual({
      top: [{ id: expect.any(String), rank: 1, name: "cara", score: 40, isMe: false }],
      me: null,
    });
  });

  test("shows the top few, and no place for someone too far down", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      for (let i = 0; i < RANK_LIMIT; i++) {
        await ctx.db.insert("gameScores", {
          email: `p${i}@sow.org.au`,
          game: "flappy",
          score: 1000 + i,
          runId: `run-p${i}-0000`,
          durationMs: 60_000,
          playedAt: 0,
          updatedAt: 0,
        });
      }
    });
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 5, "flappy")] });
    const board = await asUser(t, ANNA).query(api.gameScores.leaderboard, { game: "flappy" });
    expect(board?.top).toHaveLength(LEADERBOARD_SIZE);
    expect(board?.top[0]).toMatchObject({ rank: 1, score: 1000 + RANK_LIMIT - 1 });
    expect(board?.me).toEqual({ score: 5, rank: null });
  });
});

describe("leaderboard pages", () => {
  /** Puts in `count` people's bests at flappy, scoring 100, 101, … */
  const seed = (t: T, count: number) =>
    t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert("gameScores", {
          email: `p${i}@sow.org.au`,
          game: "flappy",
          score: 100 + i,
          runId: `run-p${i}-0000`,
          durationMs: 60_000,
          playedAt: 0,
          updatedAt: 0,
        });
      }
    });

  test("an empty game has one empty, finished page", async () => {
    const t = newConvex();
    const page = await t.query(api.gameScores.leaderboardPage, {
      game: "runner",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toEqual([]);
    expect(page.isDone).toBe(true);
  });

  test("pages through every score, best first, until the last one", async () => {
    const t = newConvex();
    await seed(t, 23);
    const scores: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const result: { page: { score: number }[]; isDone: boolean; continueCursor: string } = await t.query(
        api.gameScores.leaderboardPage,
        { game: "flappy", paginationOpts: { numItems: 10, cursor } }
      );
      pages++;
      scores.push(...result.page.map((row) => row.score));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(pages).toBe(3);
    expect(scores).toEqual(Array.from({ length: 23 }, (_, i) => 122 - i));
  });

  test("names each person and marks the caller's own row", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", { email: ANNA, year: YEAR, name: "Anna Lee" });
    });
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 500)] });
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [run("run-ben-01", 700)] });
    const args = { game: "runner" as const, paginationOpts: { numItems: 10, cursor: null } };
    const mine = await asUser(t, ANNA).query(api.gameScores.leaderboardPage, args);
    expect(mine.page.map(({ name, score, isMe }) => [name, score, isMe])).toEqual([
      ["ben", 700, false],
      ["Anna Lee", 500, true],
    ]);
    const signedOut = await t.query(api.gameScores.leaderboardPage, args);
    expect(signedOut.page.every((row) => !row.isMe)).toBe(true);
  });

  test("refuses a page bigger than the limit", async () => {
    const t = newConvex();
    await expect(
      t.query(api.gameScores.leaderboardPage, {
        game: "runner",
        paginationOpts: { numItems: MAX_PAGE_SIZE + 1, cursor: null },
      })
    ).rejects.toThrow(/at most/);
  });

  test("the caller's own best and place, ties sharing it; nothing signed out or before a score", async () => {
    const t = newConvex();
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [run("run-ben-01", 700)] });
    await asUser(t, CARA).mutation(api.gameScores.submitScores, { scores: [run("run-cara-1", 500)] });
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 500)] });
    expect(await asUser(t, ANNA).query(api.gameScores.myLeaderboardPlace, { game: "runner" })).toEqual({
      score: 500,
      rank: 2,
    });
    expect(await asUser(t, ANNA).query(api.gameScores.myLeaderboardPlace, { game: "shooter" })).toBeNull();
    expect(await t.query(api.gameScores.myLeaderboardPlace, { game: "runner" })).toBeNull();
  });
});

describe("resetScores", () => {
  const scheduled = (t: T) => t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  const notice = { title: "Scores reset", body: "Play again." };

  test("wipes one game's board, keeps the others, and pushes to everyone who was on it", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 500)] });
    await asUser(t, BEN).mutation(api.gameScores.submitScores, {
      scores: [run("run-ben-01", 700), run("run-ben-02", 9, "flappy")],
    });
    await t.mutation(internal.gameScores.resetScores, { game: "runner", ...notice });
    expect(await bests(t)).toEqual([[BEN, "flappy", 9, "run-ben-02"]]);
    const jobs = await scheduled(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe("push:sendMany");
    expect(jobs[0].args[0]).toEqual({ to: [ANNA, BEN].sort(), ...notice, url: "/games/runner" });
  });

  test("a board already empty pushes to nobody", async () => {
    const t = newConvex();
    await t.mutation(internal.gameScores.resetScores, { game: "runner", ...notice });
    expect(await scheduled(t)).toEqual([]);
  });

  test("a big board is wiped a batch at a time", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      for (let i = 0; i <= RESET_BATCH; i++) {
        await ctx.db.insert("gameScores", {
          email: `p${i}@sow.org.au`,
          game: "runner",
          score: i + 1,
          runId: `run-p${i}-0000`,
          durationMs: 60_000,
          playedAt: 0,
          updatedAt: 0,
        });
      }
    });
    await t.mutation(internal.gameScores.resetScores, { game: "runner", ...notice });
    expect(await bests(t)).toHaveLength(1);
    expect((await scheduled(t)).map((job) => job.name).sort()).toEqual(["gameScores:resetScores", "push:sendMany"]);
  });
});

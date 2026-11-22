import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { LEADERBOARD_SIZE, RANK_LIMIT } from "./gameScores";
import { asUser, newConvex, YEAR, type T } from "../test/convexFixture";
import { MAX_SCORES_PER_SUBMIT, type GameId } from "../shared/games";

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
    ).toEqual({ accepted: ["run-anna-1", "run-anna-2"], rejected: [] });
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
        run("run-anna-ok", 10),
      ],
    });
    expect(result.accepted).toEqual(["run-anna-ok"]);
    expect(result.rejected.map((r) => r.runId)).toEqual(["run-anna-fast", "run-anna-future"]);
    expect(await bests(t)).toEqual([[ANNA, "runner", 10, "run-anna-ok"]]);
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

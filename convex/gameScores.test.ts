import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { LEADERBOARD_SIZE, MAX_PAGE_SIZE, RANK_LIMIT, RESET_BATCH } from "./gameScores";
import { asUser, newConvex, YEAR, type T } from "../test/convexFixture";
import { MAX_RUN_MS, MAX_SCORES_PER_SUBMIT, type GameId } from "../shared/games";
import { boardOf, PAYOUT_MIN_ENTRIES } from "../shared/coins";
import type { Beaten } from "../shared/leaderboard";
import { lookFor, withHeight } from "../shared/world";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const DAN = "dan@sow.org.au";
const EVE = "eve@sow.org.au";

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

const v2 = (runId: string, score: number, game: GameId = "runner") => ({ ...run(runId, score, game), version: 2 });

const player = (i: number) => `player${i}@sow.org.au`;

const paidRows = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("coinLedger").collect())
      .filter((row) => row.kind === "game")
      .map((row) => [row.email, row.delta, row.place, row.board])
  );

describe("versions", () => {
  test("a run with no version lands on the v1 board, as older apps send it, and a v2 run on the v2 board", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const result = await anna.mutation(api.gameScores.submitScores, {
      scores: [run("run-anna-old", 9_000), v2("run-anna-new", 400), { ...run("run-anna-v3", 600), version: 3 }],
    });
    expect(result.accepted).toEqual(["run-anna-old", "run-anna-new"]);
    expect(result.rejected).toEqual([{ runId: "run-anna-v3", reason: "That isn't a version of the game." }]);
    const v1 = await anna.query(api.gameScores.leaderboard, { game: "runner" });
    expect(v1.top.map((row) => row.score)).toEqual([9_000]);
    expect(v1.me).toEqual({ score: 9_000, rank: 1 });
    expect(await anna.query(api.gameScores.leaderboard, { game: "runner", version: 1 })).toEqual(v1);
    const second = await anna.query(api.gameScores.leaderboard, { game: "runner", version: 2 });
    expect(second.top.map((row) => row.score)).toEqual([400]);
    expect(await anna.query(api.gameScores.myLeaderboardPlace, { game: "runner", version: 2 })).toEqual({ score: 400, rank: 1 });
    const page = await t.query(api.gameScores.leaderboardPage, { game: "runner", version: 2, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((row) => row.score)).toEqual([400]);
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-old2", 100), v2("run-anna-new2", 500)] });
    expect(await bests(t)).toEqual([
      [ANNA, "runner", 9_000, "run-anna-old"],
      [ANNA, "runner", 500, "run-anna-new2"],
    ]);
  });

  test("v1 boards still pay their top 3 from the first score, as before", async () => {
    const t = newConvex();
    const result = await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-old", 30, "flappy")] });
    expect(result.coins).toEqual([{ runId: "run-anna-old", coins: 50, place: 1 }]);
    expect(await paidRows(t)).toEqual([[ANNA, 50, 1, boardOf("flappy")]]);
  });

  test(`a v2 board pays nothing until ${PAYOUT_MIN_ENTRIES} people are on it, then pays whoever is top 3 then, and later climbs pay as usual`, async () => {
    const t = newConvex();
    expect(PAYOUT_MIN_ENTRIES).toBe(10);
    for (let i = 1; i < PAYOUT_MIN_ENTRIES; i++) {
      const result = await asUser(t, player(i)).mutation(api.gameScores.submitScores, { scores: [v2(`run-player-${i}`, i * 100)] });
      expect(result.coins).toEqual([]);
    }
    const better = await asUser(t, player(9)).mutation(api.gameScores.submitScores, { scores: [v2("run-player-9b", 2_000)] });
    expect(better.coins).toEqual([]);
    expect(await paidRows(t)).toEqual([]);
    const tenth = await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [v2("run-anna-1", 750)] });
    expect(tenth.coins).toEqual([{ runId: "run-anna-1", coins: 10, place: 3 }]);
    const board = boardOf("runner", 2);
    expect((await paidRows(t)).sort()).toEqual(
      [
        [player(9), 50, 1, board],
        [player(8), 25, 2, board],
        [ANNA, 10, 3, board],
      ].sort()
    );
    const resent = await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [v2("run-anna-1", 750)] });
    expect(resent.coins).toEqual([{ runId: "run-anna-1", coins: 10, place: 3 }]);
    const eleventh = await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [v2("run-ben-1", 5)] });
    expect(eleventh.coins).toEqual([]);
    const climb = await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [v2("run-ben-2", 3_000)] });
    expect(climb.coins).toEqual([{ runId: "run-ben-2", coins: 50, place: 1 }]);
    const anna = await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [v2("run-anna-2", 2_500)] });
    expect(anna.coins).toEqual([{ runId: "run-anna-2", coins: 15, place: 2 }]);
    expect((await paidRows(t)).filter(([, , , paidBoard]) => paidBoard !== board)).toEqual([]);
  });

  test("a v2 board's payouts don't count what a v1 board paid", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-old", 30, "flappy")] });
    for (let i = 1; i < PAYOUT_MIN_ENTRIES; i++) {
      await asUser(t, player(i)).mutation(api.gameScores.submitScores, { scores: [v2(`run-player-${i}`, i, "flappy")] });
    }
    const result = await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [v2("run-anna-new", 50, "flappy")] });
    expect(result.coins).toEqual([{ runId: "run-anna-new", coins: 50, place: 1 }]);
  });
});

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
    const best = run("run-anna-1", 300);
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [best] });
    expect(await t.query(api.gameScores.leaderboard, { game: "runner" })).toEqual({
      top: [{ id: expect.any(String), rank: 1, name: "anna", score: 300, playedAt: best.playedAt, isMe: false }],
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
      top: [{ id: expect.any(String), rank: 1, name: "cara", score: 40, playedAt: expect.any(Number), isMe: false }],
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

  test("each row carries the date of that person's best run, not of a later lower one", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const best = { ...run("run-anna-1", 500), playedAt: Date.now() - 60 * 60 * 1000 };
    await anna.mutation(api.gameScores.submitScores, { scores: [best] });
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-2", 200)] });
    const args = { game: "runner" as const, paginationOpts: { numItems: 10, cursor: null } };
    expect((await t.query(api.gameScores.leaderboardPage, args)).page.map((row) => [row.score, row.playedAt])).toEqual([
      [500, best.playedAt],
    ]);
    const better = run("run-anna-3", 800);
    await anna.mutation(api.gameScores.submitScores, { scores: [better] });
    expect((await t.query(api.gameScores.leaderboardPage, args)).page.map((row) => [row.score, row.playedAt])).toEqual([
      [800, better.playedAt],
    ]);
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

describe("podium", () => {
  test("is empty until someone scores, then the top three, best first, with their World looks", async () => {
    const t = newConvex();
    expect(await t.query(api.gameScores.podium, { game: "runner" })).toEqual([]);
    const look = { skin: 2, hair: 3, hairColour: 1, shirt: 4 };
    await asUser(t, ANNA).mutation(api.world.saveLook, { look });
    const scores: [string, number][] = [[ANNA, 300], [BEN, 900], [CARA, 500], [DAN, 100]];
    await t.run(async (ctx) => {
      for (const [email, score] of [...scores, [EVE, 999] as [string, number]]) {
        const game = email === EVE ? "flappy" : "runner";
        await ctx.db.insert("gameScores", { email, game, score, runId: `run-${email}`, durationMs: 60_000, playedAt: 1, updatedAt: 1 });
      }
    });
    const top = await asUser(t, ANNA).query(api.gameScores.podium, { game: "runner" });
    expect(top.map((row) => [row.score, row.isMe, row.look])).toEqual([
      [900, false, withHeight(lookFor(BEN), BEN)],
      [500, false, withHeight(lookFor(CARA), CARA)],
      [300, true, withHeight(look, ANNA)],
    ]);
    expect((await t.query(api.gameScores.podium, { game: "runner" })).every((row) => !row.isMe)).toBe(true);
  });

  test("shows one version's board, never mixing v1 and v2; no version is v1, as older apps ask", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-old", 9_000), v2("run-anna-new", 40)] });
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [v2("run-ben-new", 70)] });
    const scores = async (version?: number) => (await t.query(api.gameScores.podium, { game: "runner", version })).map((row) => row.score);
    expect(await scores()).toEqual([9_000]);
    expect(await scores(1)).toEqual([9_000]);
    expect(await scores(2)).toEqual([70, 40]);
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
    const jobs = (await scheduled(t)).filter((job) => job.name === "push:sendMany");
    expect(jobs).toHaveLength(1);
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

describe("beaten in the top 3", () => {
  const jobs = (t: T) => t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  const seed = async (t: T) => {
    for (const [email, score] of [[ANNA, 900], [BEN, 700], [CARA, 500], [EVE, 400]] as const) {
      await asUser(t, email).mutation(api.gameScores.submitScores, { scores: [run(`run-seed-${score}`, score)] });
    }
  };
  const clear = (t: T) =>
    t.run(async (ctx) => {
      for (const job of await ctx.db.system.query("_scheduled_functions").collect()) await ctx.scheduler.cancel(job._id);
    });
  const pending = async (t: T) => (await jobs(t)).filter((job) => job.state.kind === "pending");
  const told = async (t: T) =>
    (await pending(t)).filter((job) => job.name === "gameScores:tellBeaten").flatMap((job) => (job.args[0] as { beaten: Beaten[] }).beaten);

  test("someone passed within the top 3 and someone pushed out of it are each told once", async () => {
    const t = newConvex();
    await seed(t);
    await clear(t);
    await asUser(t, DAN).mutation(api.gameScores.submitScores, { scores: [run("run-dan-01", 800)] });
    const scheduled = (await pending(t)).filter((job) => job.name === "gameScores:tellBeaten");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].args[0]).toEqual({
      game: "runner",
      by: DAN,
      beaten: [
        { email: BEN, place: 3 },
        { email: CARA, place: 4 },
      ],
    });
  });

  test("everyone tied in 3rd is told, however many there are", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.gameScores.submitScores, { scores: [run("run-anna-01", 900)] });
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [run("run-ben-01", 700)] });
    const tied = Array.from({ length: 30 }, (_, n) => `tied${n}@sow.org.au`);
    for (const [n, email] of tied.entries()) {
      await asUser(t, email).mutation(api.gameScores.submitScores, { scores: [run(`run-tied-${n}`, 500)] });
    }
    await clear(t);
    await asUser(t, DAN).mutation(api.gameScores.submitScores, { scores: [run("run-dan-01", 800)] });
    const beaten = await told(t);
    expect(beaten.find((row) => row.email === BEN)).toEqual({ email: BEN, place: 3 });
    expect(beaten.filter((row) => row.place === 4).map((row) => row.email).sort()).toEqual([...tied].sort());
    expect(beaten).toHaveLength(31);
  });

  test("a tie, a climb below the top 3, and a first score off the podium tell nobody", async () => {
    const t = newConvex();
    await seed(t);
    await clear(t);
    await asUser(t, DAN).mutation(api.gameScores.submitScores, { scores: [run("run-dan-01", 500)] });
    await asUser(t, EVE).mutation(api.gameScores.submitScores, { scores: [run("run-eve-02", 450)] });
    await asUser(t, DAN).mutation(api.gameScores.submitScores, { scores: [run("run-dan-02", 100)] });
    expect((await pending(t)).filter((job) => job.name === "gameScores:tellBeaten")).toEqual([]);
  });

  test("climbing past one person tells only them, never the player", async () => {
    const t = newConvex();
    await seed(t);
    await clear(t);
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [run("run-ben-02", 950)] });
    const scheduled = (await pending(t)).filter((job) => job.name === "gameScores:tellBeaten");
    expect(scheduled.map((job) => job.args[0])).toEqual([{ game: "runner", by: BEN, beaten: [{ email: ANNA, place: 2 }] }]);
  });

  test("two better runs in one send still tell each person once", async () => {
    const t = newConvex();
    await seed(t);
    await clear(t);
    await asUser(t, DAN).mutation(api.gameScores.submitScores, {
      scores: [run("run-dan-01", 800), run("run-dan-02", 1000)],
    });
    const emails = (await told(t)).map((row) => row.email);
    expect(emails.sort()).toEqual([ANNA, BEN, CARA].sort());
  });

  test("each person gets one push in the player's full name, opening the leaderboard", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", { email: DAN, year: YEAR, name: "  Dan   de Silva " });
    });
    await t.mutation(internal.gameScores.tellBeaten, {
      game: "flappy",
      by: DAN,
      beaten: [
        { email: BEN, place: 3 },
        { email: CARA, place: 4 },
      ],
    });
    const pushes = (await jobs(t)).filter((job) => job.name === "push:send").map((job) => job.args[0]);
    expect(pushes).toEqual([
      { to: BEN, title: "Dan de Silva just beat you in Flap", body: "You're now 3rd", url: "/games/leaderboard?game=flappy" },
      { to: CARA, title: "Dan de Silva just beat you in Flap", body: "You're out of the top 3", url: "/games/leaderboard?game=flappy" },
    ]);
  });
});

describe("myBests", () => {
  test("your own best per game, nobody else's, and nothing signed out", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    expect(await t.query(api.gameScores.myBests, {})).toBeNull();
    expect(await anna.query(api.gameScores.myBests, {})).toEqual({ email: ANNA, bests: [] });
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 300), run("run-anna-2", 40, "flappy")] });
    await asUser(t, BEN).mutation(api.gameScores.submitScores, { scores: [run("run-ben-1", 900)] });
    const mine = await anna.query(api.gameScores.myBests, {});
    expect(mine?.email).toBe(ANNA);
    expect(mine?.bests).toEqual(
      expect.arrayContaining([
        { game: "runner", score: 300 },
        { game: "flappy", score: 40 },
      ])
    );
    expect(mine?.bests).toHaveLength(2);
  });

  test("bests are per version: v2 asks for its own, no version is v1, and current returns each game's active version (v3 for Swoop)", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gameScores.submitScores, {
      scores: [
        run("run-anna-old", 9_000),
        v2("run-anna-new", 400),
        v2("run-anna-flap", 12, "flappy"),
        v2("run-anna-glider-v2", 1_500, "glider"),
        { ...run("run-anna-glider-v3", 2_200, "glider"), version: 3 },
      ],
    });
    expect((await anna.query(api.gameScores.myBests, {}))?.bests).toEqual([{ game: "runner", score: 9_000 }]);
    expect((await anna.query(api.gameScores.myBests, { version: 1 }))?.bests).toEqual([{ game: "runner", score: 9_000 }]);
    expect((await anna.query(api.gameScores.myBests, { version: 2 }))?.bests).toEqual([
      { game: "runner", score: 400 },
      { game: "flappy", score: 12 },
      { game: "glider", score: 1_500 },
    ]);
    expect((await anna.query(api.gameScores.myBests, { current: true }))?.bests).toEqual([
      { game: "runner", score: 400 },
      { game: "flappy", score: 12 },
      { game: "glider", score: 2_200 },
    ]);
    const v3Board = await anna.query(api.gameScores.leaderboard, { game: "glider", version: 3 });
    expect(v3Board.top.map((row) => row.score)).toEqual([2_200]);
    const v2Board = await anna.query(api.gameScores.leaderboard, { game: "glider", version: 2 });
    expect(v2Board.top.map((row) => row.score)).toEqual([1_500]);
  });

  test("a higher best from another device goes up through submitScores and shows everywhere", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-1", 300)] });
    await anna.mutation(api.gameScores.submitScores, { scores: [run("run-anna-phone", 700)] });
    expect((await anna.query(api.gameScores.myBests, {}))?.bests).toEqual([{ game: "runner", score: 700 }]);
    const tooHigh = { ...run("run-anna-fake", 5_000_000), durationMs: 1000 };
    expect((await anna.mutation(api.gameScores.submitScores, { scores: [tooHigh] })).rejected).toHaveLength(1);
    expect((await anna.query(api.gameScores.myBests, {}))?.bests).toEqual([{ game: "runner", score: 700 }]);
  });
});

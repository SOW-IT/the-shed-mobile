import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { LEADERBOARD_SIZE, MAX_PAGE_SIZE, RANK_LIMIT, RESET_BATCH } from "./gameScores";
import { asUser, newConvex, YEAR, type T } from "../test/convexFixture";
import { MAX_RUN_MS, MAX_SCORES_PER_SUBMIT, type GameId } from "../shared/games";
import type { Beaten } from "../shared/leaderboard";
import { withHeight } from "../shared/world";

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
      [900, false, null],
      [500, false, null],
      [300, true, withHeight(look, ANNA)],
    ]);
    expect((await t.query(api.gameScores.podium, { game: "runner" })).every((row) => !row.isMe)).toBe(true);
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

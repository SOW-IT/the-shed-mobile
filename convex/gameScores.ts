import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { MAX_SCORES_PER_SUBMIT, scoreProblem, type GameId } from "../shared/games";
import { awardRun } from "./coins";
import { gameIdValidator } from "./gameScoreData";
import { Ctx, currentStaffYear, optionalEmail, requireEmail, resolveName } from "./model";

export const LEADERBOARD_SIZE = 10;
/** The most rows one page of the full leaderboard may ask for. */
export const MAX_PAGE_SIZE = 50;
/** Past this many people ahead of you, the board says "500+" for your place. */
export const RANK_LIMIT = 500;

const queuedScoreValidator = v.object({
  runId: v.string(),
  game: gameIdValidator,
  score: v.number(),
  durationMs: v.number(),
  playedAt: v.number(),
});

/**
 * Publishes runs a phone saved, keeping each person's best per game. The
 * phone sends the same run id on every retry, and a run that isn't better
 * than the saved best changes nothing, so sending a run twice is harmless.
 * Every run comes back as accepted or rejected, so the phone can stop
 * sending it either way.
 */
export const submitScores = mutation({
  args: { scores: v.array(queuedScoreValidator) },
  returns: v.object({
    accepted: v.array(v.string()),
    rejected: v.array(v.object({ runId: v.string(), reason: v.string() })),
    coins: v.array(v.object({ runId: v.string(), coins: v.number() })),
  }),
  handler: async (ctx, { scores }) => {
    const email = await requireEmail(ctx);
    if (scores.length > MAX_SCORES_PER_SUBMIT) {
      throw new ConvexError(`Send at most ${MAX_SCORES_PER_SUBMIT} scores at a time.`);
    }
    const now = Date.now();
    const accepted: string[] = [];
    const rejected: { runId: string; reason: string }[] = [];
    const coins: { runId: string; coins: number }[] = [];
    for (const entry of scores) {
      const reason = scoreProblem(entry, now);
      if (reason) {
        rejected.push({ runId: entry.runId, reason });
        continue;
      }
      accepted.push(entry.runId);
      const paid = await awardRun(ctx, email, entry, now);
      if (paid !== null && !coins.some((c) => c.runId === entry.runId)) coins.push({ runId: entry.runId, coins: paid });
      const best = await ctx.db
        .query("gameScores")
        .withIndex("by_email_and_game", (q) => q.eq("email", email).eq("game", entry.game))
        .unique();
      const run = { ...entry, updatedAt: now };
      if (!best) await ctx.db.insert("gameScores", { email, ...run });
      else if (best.runId !== entry.runId && entry.score > best.score) {
        await ctx.db.patch("gameScores", best._id, run);
      }
    }
    return { accepted, rejected, coins };
  },
});

const nameFor = async (ctx: Ctx, email: string): Promise<string> => {
  const resolved = await resolveName(ctx, email, currentStaffYear());
  if (resolved) return resolved;
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return user?.name?.trim() || email.split("@")[0];
};

const meValidator = v.union(v.null(), v.object({ score: v.number(), rank: v.union(v.number(), v.null()) }));

const entryValidator = v.object({
  id: v.id("gameScores"),
  rank: v.number(),
  name: v.string(),
  score: v.number(),
  isMe: v.boolean(),
});

/**
 * The top scores of a game, one per person, and the caller's own best and
 * place. Anyone can read it, so the games' leaderboard works signed out;
 * a signed-out caller has no best of their own here.
 */
export const leaderboard = query({
  args: { game: gameIdValidator },
  returns: v.object({
    top: v.array(entryValidator),
    me: meValidator,
  }),
  handler: async (ctx, { game }) => {
    const email = await optionalEmail(ctx);
    const rows = await ctx.db
      .query("gameScores")
      .withIndex("by_game_and_score", (q) => q.eq("game", game))
      .order("desc")
      .take(LEADERBOARD_SIZE);
    const top = [];
    for (const row of rows) {
      top.push({
        id: row._id,
        // Equal scores share the place of the first of them.
        rank: rows.findIndex((other) => other.score === row.score) + 1,
        name: await nameFor(ctx, row.email),
        score: row.score,
        isMe: email !== null && row.email === email,
      });
    }
    return { top, me: email ? await placeOf(ctx, email, game) : null };
  },
});

/** Someone's best at a game and their place, or null before they've a score. */
const placeOf = async (ctx: Ctx, email: string, game: GameId) => {
  const mine = await ctx.db
    .query("gameScores")
    .withIndex("by_email_and_game", (q) => q.eq("email", email).eq("game", game))
    .unique();
  if (!mine) return null;
  const ahead = await ctx.db
    .query("gameScores")
    .withIndex("by_game_and_score", (q) => q.eq("game", game).gt("score", mine.score))
    .take(RANK_LIMIT);
  return { score: mine.score, rank: ahead.length < RANK_LIMIT ? ahead.length + 1 : null };
};

/**
 * One page of a game's whole leaderboard, best first, one row per person.
 * The app numbers the rows from the pages it has, so equal scores share a
 * place across pages too. Anyone can read it, as with `leaderboard`.
 */
export const leaderboardPage = query({
  args: { game: gameIdValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { game, paginationOpts }) => {
    if (paginationOpts.numItems > MAX_PAGE_SIZE) {
      throw new ConvexError(`Ask for at most ${MAX_PAGE_SIZE} scores at a time.`);
    }
    const email = await optionalEmail(ctx);
    const result = await ctx.db
      .query("gameScores")
      .withIndex("by_game_and_score", (q) => q.eq("game", game))
      .order("desc")
      .paginate(paginationOpts);
    const page = [];
    for (const row of result.page) {
      page.push({
        id: row._id,
        name: await nameFor(ctx, row.email),
        score: row.score,
        isMe: email !== null && row.email === email,
      });
    }
    return { ...result, page };
  },
});

/** The caller's best at a game and their place, for the top of the leaderboard. */
export const myLeaderboardPlace = query({
  args: { game: gameIdValidator },
  returns: meValidator,
  handler: async (ctx, { game }) => {
    const email = await optionalEmail(ctx);
    return email ? await placeOf(ctx, email, game) : null;
  },
});

/** How many bests one call of `resetScores` deletes before it calls itself again. */
export const RESET_BATCH = 500;

/**
 * Wipes a game's leaderboard and tells everyone who was on it, by push, in
 * the given words. Each person has one best per game, so every batch tells
 * different people. Set the game's `SCORES_RESET_AT` first, so phones can't
 * publish the old runs again. Run by hand:
 * `npx convex run gameScores:resetScores '{"game":"runner","title":"…","body":"…"}'`.
 */
export const resetScores = internalMutation({
  args: { game: gameIdValidator, title: v.string(), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("gameScores")
      .withIndex("by_game_and_score", (q) => q.eq("game", args.game))
      .take(RESET_BATCH);
    for (const row of rows) await ctx.db.delete("gameScores", row._id);
    if (rows.length > 0) {
      await ctx.scheduler.runAfter(0, internal.push.sendMany, {
        to: rows.map((row) => row.email),
        title: args.title,
        body: args.body,
        url: `/games/${args.game}`,
      });
    }
    if (rows.length === RESET_BATCH) await ctx.scheduler.runAfter(0, internal.gameScores.resetScores, args);
    return null;
  },
});

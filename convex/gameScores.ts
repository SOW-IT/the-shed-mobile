import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { MAX_SCORES_PER_SUBMIT, scoreProblem } from "../shared/games";
import { gameIdValidator } from "./gameScoreData";
import { Ctx, currentStaffYear, optionalEmail, requireEmail, resolveName } from "./model";

export const LEADERBOARD_SIZE = 10;
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
  }),
  handler: async (ctx, { scores }) => {
    const email = await requireEmail(ctx);
    if (scores.length > MAX_SCORES_PER_SUBMIT) {
      throw new ConvexError(`Send at most ${MAX_SCORES_PER_SUBMIT} scores at a time.`);
    }
    const now = Date.now();
    const accepted: string[] = [];
    const rejected: { runId: string; reason: string }[] = [];
    for (const entry of scores) {
      const reason = scoreProblem(entry, now);
      if (reason) {
        rejected.push({ runId: entry.runId, reason });
        continue;
      }
      accepted.push(entry.runId);
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
    return { accepted, rejected };
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
    me: v.union(
      v.null(),
      v.object({ score: v.number(), rank: v.union(v.number(), v.null()) })
    ),
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
    const mine = email
      ? await ctx.db
          .query("gameScores")
          .withIndex("by_email_and_game", (q) => q.eq("email", email).eq("game", game))
          .unique()
      : null;
    if (!mine) return { top, me: null };
    const ahead = await ctx.db
      .query("gameScores")
      .withIndex("by_game_and_score", (q) => q.eq("game", game).gt("score", mine.score))
      .take(RANK_LIMIT);
    return {
      top,
      me: { score: mine.score, rank: ahead.length < RANK_LIMIT ? ahead.length + 1 : null },
    };
  },
});

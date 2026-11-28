import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import {
  CURRENT_GAME_VERSION,
  SCORE_GAME_IDS,
  isGameVersion,
  MAX_SCORES_PER_SUBMIT,
  PODIUM_PLACES,
  scoreProblem,
  versionOf,
  type ScoreGameId,
  type GameVersion,
} from "../shared/games";
import { lookFor, withHeight } from "../shared/world";
import { worldLookValidator } from "./worldData";
import { payoutMinEntries, PLACE_COINS } from "../shared/coins";
import { awardPlace, paidForRun, type RunPayout } from "./coins";
import { gameIdValidator } from "./gameScoreData";
import { beatenInTop, beatenPush } from "../shared/leaderboard";
import { accountName, fullName } from "../shared/names";
import { Ctx, currentStaffYear, optionalEmail, requireEmail, resolveName } from "./model";

export const LEADERBOARD_SIZE = 10;
/** The most rows one page of the full leaderboard may ask for. */
export const MAX_PAGE_SIZE = 50;
/** Past this many people ahead of you, the board says "500+" for your place. */
export const RANK_LIMIT = 500;
const PODIUM_LIMIT = 200;

const queuedScoreValidator = v.object({
  runId: v.string(),
  game: gameIdValidator,
  version: v.optional(v.number()),
  score: v.number(),
  durationMs: v.number(),
  playedAt: v.number(),
});

const versionArg = v.optional(v.number());

const storedVersion = (version: GameVersion) => (version === 1 ? undefined : version);

const boardVersion = (version: number | undefined): GameVersion => (isGameVersion(version) ? version : 1);

const bestOf = (ctx: Ctx, email: string, game: ScoreGameId, version: GameVersion) =>
  ctx.db
    .query("gameScores")
    .withIndex("by_email_and_game_and_version", (q) => q.eq("email", email).eq("game", game).eq("version", storedVersion(version)))
    .unique();

const board = (ctx: Ctx, game: ScoreGameId, version: GameVersion) =>
  ctx.db.query("gameScores").withIndex("by_game_and_version_and_score", (q) => q.eq("game", game).eq("version", storedVersion(version)));

/**
 * Publishes runs a phone saved, keeping each person's best per game. The
 * phone sends the same run id on every retry, and a run that isn't better
 * than the saved best changes nothing, so sending a run twice is harmless.
 * Every run comes back as accepted or rejected, so the phone can stop
 * sending it either way. A run that becomes someone's best and puts them in
 * the game's top 3 pays coins for that place (`awardPlace`); `coins` lists
 * what each run paid, and a resent run gets the same answer.
 */
export const submitScores = mutation({
  args: { scores: v.array(queuedScoreValidator) },
  returns: v.object({
    accepted: v.array(v.string()),
    rejected: v.array(v.object({ runId: v.string(), reason: v.string() })),
    coins: v.array(v.object({ runId: v.string(), coins: v.number(), place: v.optional(v.number()) })),
  }),
  handler: async (ctx, { scores }) => {
    const email = await requireEmail(ctx);
    if (scores.length > MAX_SCORES_PER_SUBMIT) {
      throw new ConvexError(`Send at most ${MAX_SCORES_PER_SUBMIT} scores at a time.`);
    }
    const now = Date.now();
    const accepted: string[] = [];
    const rejected: { runId: string; reason: string }[] = [];
    const coins: ({ runId: string } & RunPayout)[] = [];
    for (const raw of scores) {
      const entry = { ...raw, version: raw.version as GameVersion | undefined };
      const reason = scoreProblem(entry, now);
      if (reason) {
        rejected.push({ runId: entry.runId, reason });
        continue;
      }
      accepted.push(entry.runId);
      if (coins.some((c) => c.runId === entry.runId)) continue;
      const version = versionOf(entry.version);
      const before = await paidForRun(ctx, email, entry.runId);
      const best = await bestOf(ctx, email, entry.game, version);
      const run = { ...entry, version: storedVersion(version), updatedAt: now };
      const newBest = !best || (best.runId !== entry.runId && entry.score > best.score);
      if (newBest) {
        const beaten = beatenInTop(await podiumOf(ctx, entry.game, version, entry.score), email, best?.score ?? null, entry.score);
        if (beaten.length > 0) {
          await ctx.scheduler.runAfter(0, internal.gameScores.tellBeaten, { game: entry.game, by: email, beaten });
        }
        if (best) await ctx.db.patch("gameScores", best._id, run);
        else await ctx.db.insert("gameScores", { email, ...run });
      }
      const paid = before ?? (newBest ? await payForBest(ctx, email, { ...entry, version }, !best, now) : null);
      if (paid) coins.push({ runId: entry.runId, ...paid });
    }
    return { accepted, rejected, coins };
  },
});

type BoardRun = { runId: string; game: ScoreGameId; version: GameVersion; score: number };

const payForBest = async (ctx: MutationCtx, email: string, run: BoardRun, joined: boolean, now: number) => {
  const needed = payoutMinEntries(run.version);
  if (needed > 0) {
    const entries = (await board(ctx, run.game, run.version).take(needed + 1)).length;
    if (entries < needed) return null;
    if (joined && entries === needed) return await payTop3(ctx, email, run, now);
  }
  return await awardPlace(ctx, email, run, await topPlace(ctx, run.game, run.version, run.score), now);
};

const payTop3 = async (ctx: MutationCtx, email: string, run: BoardRun, now: number) => {
  const rows = await board(ctx, run.game, run.version).order("desc").take(PODIUM_LIMIT);
  let mine: RunPayout | null = null;
  for (const row of rows) {
    const place = rows.findIndex((other) => other.score === row.score) + 1;
    if (place > PLACE_COINS.length) break;
    if (row.email === email) mine = await awardPlace(ctx, email, run, place, now);
    else await awardPlace(ctx, row.email, { runId: row.runId, game: run.game, version: run.version }, place, now);
  }
  return mine;
};

/**
 * The place a score holds on its game's board, as the board numbers it
 * (equal scores share a place), or past the paying places when it's below 3rd.
 */
const topPlace = async (ctx: Ctx, game: ScoreGameId, version: GameVersion, score: number): Promise<number> => {
  const ahead = await ctx.db
    .query("gameScores")
    .withIndex("by_game_and_version_and_score", (q) => q.eq("game", game).eq("version", storedVersion(version)).gt("score", score))
    .take(PLACE_COINS.length);
  return ahead.length + 1;
};

const podiumOf = async (ctx: Ctx, game: ScoreGameId, version: GameVersion, score: number) => {
  const top = await board(ctx, game, version).order("desc").take(PLACE_COINS.length);
  const lowest = top.length > 0 ? top[top.length - 1].score : null;
  if (lowest === null || lowest >= score) return [];
  return await ctx.db
    .query("gameScores")
    .withIndex("by_game_and_version_and_score", (q) => q.eq("game", game).eq("version", storedVersion(version)).gte("score", lowest))
    .order("desc")
    .take(PODIUM_LIMIT);
};

export const nameFor = async (ctx: Ctx, email: string): Promise<string> => {
  const resolved = await resolveName(ctx, email, currentStaffYear());
  if (resolved) return resolved;
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return accountName(user?.name, email);
};

const meValidator = v.union(v.null(), v.object({ score: v.number(), rank: v.union(v.number(), v.null()) }));

const entryValidator = v.object({
  id: v.id("gameScores"),
  rank: v.number(),
  name: v.string(),
  score: v.number(),
  playedAt: v.number(),
  isMe: v.boolean(),
});

/**
 * The top scores of a game, one per person, and the caller's own best and
 * place. Anyone can read it, so the games' leaderboard works signed out;
 * a signed-out caller has no best of their own here.
 */
export const leaderboard = query({
  args: { game: gameIdValidator, version: versionArg },
  returns: v.object({
    top: v.array(entryValidator),
    me: meValidator,
  }),
  handler: async (ctx, args) => {
    const { game } = args;
    const version = boardVersion(args.version);
    const email = await optionalEmail(ctx);
    const rows = await board(ctx, game, version).order("desc").take(LEADERBOARD_SIZE);
    const top = [];
    for (const row of rows) {
      top.push({
        id: row._id,
        // Equal scores share the place of the first of them.
        rank: rows.findIndex((other) => other.score === row.score) + 1,
        name: await nameFor(ctx, row.email),
        score: row.score,
        playedAt: row.playedAt,
        isMe: email !== null && row.email === email,
      });
    }
    return { top, me: email ? await placeOf(ctx, email, game, version) : null };
  },
});

/** Someone's best at a game and their place, or null before they've a score. */
const placeOf = async (ctx: Ctx, email: string, game: ScoreGameId, version: GameVersion) => {
  const mine = await bestOf(ctx, email, game, version);
  if (!mine) return null;
  const ahead = await ctx.db
    .query("gameScores")
    .withIndex("by_game_and_version_and_score", (q) => q.eq("game", game).eq("version", storedVersion(version)).gt("score", mine.score))
    .take(RANK_LIMIT);
  return { score: mine.score, rank: ahead.length < RANK_LIMIT ? ahead.length + 1 : null };
};

/**
 * One page of a game's whole leaderboard, best first, one row per person.
 * The app numbers the rows from the pages it has, so equal scores share a
 * place across pages too. Anyone can read it, as with `leaderboard`.
 */
export const leaderboardPage = query({
  args: { game: gameIdValidator, version: versionArg, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { game, version, paginationOpts }) => {
    if (paginationOpts.numItems > MAX_PAGE_SIZE) {
      throw new ConvexError(`Ask for at most ${MAX_PAGE_SIZE} scores at a time.`);
    }
    const email = await optionalEmail(ctx);
    const result = await board(ctx, game, boardVersion(version)).order("desc").paginate(paginationOpts);
    const page = [];
    for (const row of result.page) {
      page.push({
        id: row._id,
        name: await nameFor(ctx, row.email),
        score: row.score,
        playedAt: row.playedAt,
        isMe: email !== null && row.email === email,
      });
    }
    return { ...result, page };
  },
});

/**
 * A game's top scores for the podium over its leaderboard: names, scores
 * and World looks (their saved look, or their default Garden look).
 */
export const podium = query({
  args: { game: gameIdValidator, version: versionArg },
  returns: v.array(
    v.object({ id: v.id("gameScores"), name: v.string(), score: v.number(), isMe: v.boolean(), look: v.union(v.null(), worldLookValidator) })
  ),
  handler: async (ctx, { game, version }) => {
    const email = await optionalEmail(ctx);
    const rows = await board(ctx, game, boardVersion(version)).order("desc").take(PODIUM_PLACES);
    const top = [];
    for (const row of rows) {
      const saved = await ctx.db.query("worldLooks").withIndex("by_email", (q) => q.eq("email", row.email)).unique();
      top.push({
        id: row._id,
        name: await nameFor(ctx, row.email),
        score: row.score,
        isMe: email !== null && row.email === email,
        look: withHeight(saved?.look ?? lookFor(row.email), row.email),
      });
    }
    return top;
  },
});

/** The caller's best at a game and their place, for the top of the leaderboard. */
export const myLeaderboardPlace = query({
  args: { game: gameIdValidator, version: versionArg },
  returns: meValidator,
  handler: async (ctx, { game, version }) => {
    const email = await optionalEmail(ctx);
    return email ? await placeOf(ctx, email, game, boardVersion(version)) : null;
  },
});

export const myBests = query({
  args: { version: versionArg, current: v.optional(v.boolean()) },
  returns: v.union(v.null(), v.object({ email: v.string(), bests: v.array(v.object({ game: gameIdValidator, score: v.number() })) })),
  handler: async (ctx, args) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const bests = [];
    for (const game of SCORE_GAME_IDS) {
      const version = args.current ? CURRENT_GAME_VERSION[game] : boardVersion(args.version);
      const row = await bestOf(ctx, email, game, version);
      if (row) bests.push({ game, score: row.score });
    }
    return { email, bests };
  },
});

export const tellBeaten = internalMutation({
  args: {
    game: gameIdValidator,
    by: v.string(),
    beaten: v.array(v.object({ email: v.string(), place: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, { game, by, beaten }) => {
    const name = fullName(await nameFor(ctx, by));
    for (const { email, place } of beaten) {
      await ctx.scheduler.runAfter(0, internal.push.send, { to: email, ...beatenPush(name, game, place) });
    }
    return null;
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
  args: { game: gameIdValidator, version: versionArg, title: v.string(), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await board(ctx, args.game, boardVersion(args.version)).take(RESET_BATCH);
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

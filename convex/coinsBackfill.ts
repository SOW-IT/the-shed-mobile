import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { boardOf, PLACE_COINS } from "../shared/coins";
import { GAME_IDS } from "../shared/games";
import { awardPlace } from "./coins";
import { env } from "./environment";

/** The `oneOffRuns` name that marks the backfill done. */
export const TOP3_BACKFILL = "coins-top3-backfill";

const PRODUCTION_DEPLOYMENT = "https://giant-bloodhound-191.";

const onProduction = (): boolean => env("CONVEX_CLOUD_URL")?.startsWith(PRODUCTION_DEPLOYMENT) ?? false;

/**
 * Pays the people already in a game's top 3 when 2.12.49 made places pay,
 * once. 2.12.49 pays a place only when a new best reaches it, so whoever was
 * already 1st, 2nd or 3rd had nothing for it. For each game's current board,
 * everyone placed 1st to 3rd (equal scores share a place, as the leaderboard
 * shows) is paid what that board still owes them for the place, through
 * `awardPlace`, so anyone 2.12.49 already paid gets only the difference, if
 * any.
 *
 * The hourly cron in crons.ts runs it, so production pays without anyone
 * running a command there. The first run pays and writes its `oneOffRuns`
 * row in the same transaction; every run after that finds the row and does
 * nothing. Even without the row a second run pays nothing, as the board's
 * ledger rows already cover each place.
 */
export const payStandingTop3 = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!onProduction()) return null;
    const done = await ctx.db
      .query("oneOffRuns")
      .withIndex("by_name", (q) => q.eq("name", TOP3_BACKFILL))
      .first();
    if (done) return null;
    const now = Date.now();
    let people = 0;
    let coins = 0;
    for (const game of GAME_IDS) {
      const board = boardOf(game);
      let seen = 0;
      let place = 0;
      let placeScore: number | null = null;
      // Best first; equal scores share the place of the first of them.
      for await (const row of ctx.db
        .query("gameScores")
        .withIndex("by_game_and_score", (q) => q.eq("game", game))
        .order("desc")) {
        if (row.score !== placeScore) {
          place = seen + 1;
          placeScore = row.score;
        }
        if (place > PLACE_COINS.length) break;
        seen++;
        const paid = await awardPlace(ctx, row.email, { runId: `backfill:${board}:${row.email}`, game }, place, now);
        if (paid) {
          people++;
          coins += paid.coins;
        }
      }
    }
    await ctx.db.insert("oneOffRuns", { name: TOP3_BACKFILL, at: now });
    console.log(`${TOP3_BACKFILL}: paid ${coins} coins to ${people} top-3 places`);
    return null;
  },
});

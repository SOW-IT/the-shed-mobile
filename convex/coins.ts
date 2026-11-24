import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { boardOf, coinDay, PLACE_COINS, placePayout, START_COINS } from "../shared/coins";
import type { GameId } from "../shared/games";
import { Ctx, optionalEmail } from "./model";

export const walletOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldWallets")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

export const ensureWallet = async (ctx: MutationCtx, email: string, now: number): Promise<Doc<"worldWallets">> => {
  const found = await walletOf(ctx, email);
  if (found) return found;
  const id = await ctx.db.insert("worldWallets", { email, balance: START_COINS, earnedDay: coinDay(now), earnedToday: 0, items: {}, wallpapers: [] });
  await ctx.db.insert("coinLedger", { email, delta: START_COINS, kind: "start", at: now });
  return (await ctx.db.get("worldWallets", id))!;
};

/** What a run paid, and for which place, when it paid anything. */
export type RunPayout = { coins: number; place?: number };

/** What a run already paid, so a resent run gets the same answer and no more coins. */
export const paidForRun = async (ctx: MutationCtx, email: string, runId: string): Promise<RunPayout | null> => {
  const row = await ctx.db
    .query("coinLedger")
    .withIndex("by_email_and_runId", (q) => q.eq("email", email).eq("runId", runId))
    .first();
  if (!row) return null;
  return row.place === undefined ? { coins: row.delta } : { coins: row.delta, place: row.place };
};

/**
 * Pays a run that just became someone's best for the place it reached on its
 * game's board: 1st 50, 2nd 25, 3rd 10, less what that board has already paid
 * them. Returns null when it pays nothing: below 3rd, or a place no better
 * than one they've already been paid for.
 */
export const awardPlace = async (
  ctx: MutationCtx,
  email: string,
  run: { runId: string; game: GameId },
  place: number,
  now: number
): Promise<RunPayout | null> => {
  const board = boardOf(run.game);
  // Each payout climbs, so a board has paid someone at most once per place.
  const paid = await ctx.db
    .query("coinLedger")
    .withIndex("by_email_and_board", (q) => q.eq("email", email).eq("board", board))
    .take(PLACE_COINS.length);
  const paidOnBoard = paid.reduce((sum, row) => sum + row.delta, 0);
  const coins = placePayout(place, paidOnBoard);
  if (coins === 0) return null;
  const wallet = await ensureWallet(ctx, email, now);
  const day = coinDay(now);
  const today = wallet.earnedDay === day ? wallet.earnedToday : 0;
  await ctx.db.patch("worldWallets", wallet._id, { balance: wallet.balance + coins, earnedDay: day, earnedToday: today + coins });
  await ctx.db.insert("coinLedger", { email, delta: coins, kind: "game", runId: run.runId, game: run.game, place, board, at: now });
  return { coins, place };
};

export const mine = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ balance: v.number(), items: v.record(v.string(), v.number()), wallpapers: v.array(v.string()), earnedToday: v.number() })
  ),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const wallet = await walletOf(ctx, email);
    if (!wallet) return { balance: START_COINS, items: {}, wallpapers: [], earnedToday: 0 };
    const earnedToday = wallet.earnedDay === coinDay(Date.now()) ? wallet.earnedToday : 0;
    return { balance: wallet.balance, items: wallet.items, wallpapers: wallet.wallpapers, earnedToday };
  },
});

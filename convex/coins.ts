import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { cappedAward, coinDay, coinsForRun, START_COINS } from "../shared/coins";
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

export const awardRun = async (
  ctx: MutationCtx,
  email: string,
  run: { runId: string; game: GameId; score: number },
  now: number
): Promise<number | null> => {
  const earned = coinsForRun(run.game, run.score);
  if (earned === 0) return null;
  const before = await ctx.db
    .query("coinLedger")
    .withIndex("by_email_and_runId", (q) => q.eq("email", email).eq("runId", run.runId))
    .first();
  if (before) return before.delta;
  const wallet = await ensureWallet(ctx, email, now);
  const day = coinDay(now);
  const today = wallet.earnedDay === day ? wallet.earnedToday : 0;
  const coins = cappedAward(earned, today);
  await ctx.db.patch("worldWallets", wallet._id, { balance: wallet.balance + coins, earnedDay: day, earnedToday: today + coins });
  await ctx.db.insert("coinLedger", { email, delta: coins, kind: "game", runId: run.runId, game: run.game, at: now });
  return coins;
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

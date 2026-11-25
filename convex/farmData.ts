import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { FREE_PLOTS, STARTER_SEEDS } from "../shared/farm";
import type { Ctx } from "./model";

export const farmOf = (ctx: Ctx, owner: string) =>
  ctx.db
    .query("worldFarms")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .unique();

export const ensureFarm = async (ctx: MutationCtx, owner: string): Promise<Doc<"worldFarms">> => {
  const found = await farmOf(ctx, owner);
  if (found) return found;
  const id = await ctx.db.insert("worldFarms", { owner, plots: FREE_PLOTS, seeds: {}, crops: {} });
  return (await ctx.db.get("worldFarms", id))!;
};

export const giveStarterSeeds = async (ctx: MutationCtx, owner: string, now: number) => {
  const farm = await ensureFarm(ctx, owner);
  if (farm.giftAt !== undefined) return;
  const { crop, count } = STARTER_SEEDS;
  await ctx.db.patch("worldFarms", farm._id, { seeds: { ...farm.seeds, [crop]: (farm.seeds[crop] ?? 0) + count }, giftAt: now });
};

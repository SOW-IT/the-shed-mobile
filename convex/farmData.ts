import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { BUILDINGS } from "../shared/animals";
import { FREE_PLOTS, PLOT_COUNT, STARTER_SEEDS } from "../shared/farm";
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

export const noteWaterer = async (ctx: MutationCtx, email: string, owner: string) => {
  const found = await ctx.db
    .query("worldWaterers")
    .withIndex("by_email_and_owner", (q) => q.eq("email", email).eq("owner", owner))
    .first();
  if (!found) await ctx.db.insert("worldWaterers", { email, owner });
};

export const forgetWaterer = async (ctx: MutationCtx, row: Doc<"worldWaterers">) => {
  const plants = await ctx.db
    .query("worldPlants")
    .withIndex("by_owner_and_plot", (q) => q.eq("owner", row.owner))
    .take(PLOT_COUNT);
  for (const plant of plants) {
    if (!plant.waterings.some((w) => w.email === row.email)) continue;
    await ctx.db.patch("worldPlants", plant._id, { waterings: plant.waterings.map((w) => (w.email === row.email ? { at: w.at, email: "", name: "" } : w)) });
  }
  await ctx.db.delete("worldWaterers", row._id);
};

export const giveStarterSeeds = async (ctx: MutationCtx, owner: string, now: number) => {
  const farm = await ensureFarm(ctx, owner);
  if (farm.giftAt !== undefined) return;
  const { crop, count } = STARTER_SEEDS;
  await ctx.db.patch("worldFarms", farm._id, { seeds: { ...farm.seeds, [crop]: (farm.seeds[crop] ?? 0) + count }, giftAt: now });
};

export const ANIMAL_CAP = BUILDINGS.coop.capacity + BUILDINGS.barn.capacity;

export const animalsOf = (ctx: Ctx, owner: string) =>
  ctx.db
    .query("worldAnimals")
    .withIndex("by_owner_and_kind", (q) => q.eq("owner", owner))
    .take(ANIMAL_CAP * 2);

export const buildingsOf = (ctx: Ctx, owner: string) =>
  ctx.db
    .query("worldBuildings")
    .withIndex("by_owner_and_kind", (q) => q.eq("owner", owner))
    .take(4);

export const noteFeeder = async (ctx: MutationCtx, email: string, owner: string) => {
  const found = await ctx.db
    .query("worldFeeders")
    .withIndex("by_email_and_owner", (q) => q.eq("email", email).eq("owner", owner))
    .first();
  if (!found) await ctx.db.insert("worldFeeders", { email, owner });
};

export const forgetFeeder = async (ctx: MutationCtx, row: Doc<"worldFeeders">) => {
  for (const animal of await animalsOf(ctx, row.owner)) {
    if (!animal.feedings.some((f) => f.email === row.email)) continue;
    await ctx.db.patch("worldAnimals", animal._id, { feedings: animal.feedings.map((f) => (f.email === row.email ? { at: f.at, email: "", name: "" } : f)) });
  }
  await ctx.db.delete("worldFeeders", row._id);
};

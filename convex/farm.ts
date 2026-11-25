import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import {
  bagStacks,
  CROPS,
  farmNudge,
  farmPushDay,
  FREE_PLOTS,
  growth,
  isCrop,
  MAX_SEED_BUY,
  MAX_SEEDS_EACH,
  nudgeText,
  PLOT_COUNT,
  plotPrice,
  stackKey,
  type CropId,
} from "../shared/farm";
import { BACKYARD, NPC } from "../shared/world";
import { ensureWallet } from "./coins";
import { ensureFarm, farmOf, noteWaterer } from "./farmData";
import { type Ctx, optionalEmail, requireEmail } from "./model";
import { blockedEither, memberByEmail, nameFor, ownerOf, placeOf, requireMe } from "./world";

const REMIND_BATCH = 50;

const plantsOf = (ctx: Ctx, owner: string) =>
  ctx.db
    .query("worldPlants")
    .withIndex("by_owner_and_plot", (q) => q.eq("owner", owner))
    .take(PLOT_COUNT);

const plantIn = (ctx: Ctx, owner: string, plot: number) =>
  ctx.db
    .query("worldPlants")
    .withIndex("by_owner_and_plot", (q) => q.eq("owner", owner).eq("plot", plot))
    .unique();

const checkPlot = (plot: number) => {
  if (!Number.isInteger(plot) || plot < 0 || plot >= PLOT_COUNT) throw new ConvexError("That isn't one of the plots.");
};

const inBackyard = async (ctx: MutationCtx) => {
  const me = await requireMe(ctx);
  const owner = placeOf(me.member) === BACKYARD ? await ownerOf(ctx, me.member) : null;
  if (!owner) throw new ConvexError("Go to the backyard first.");
  if (await blockedEither(ctx, owner, me.email)) throw new ConvexError("You can't do that here.");
  return { ...me, owner };
};

const asOwner = async (ctx: MutationCtx) => {
  const me = await inBackyard(ctx);
  if (me.owner !== me.email) throw new ConvexError("Only the owner can do that here.");
  return me;
};

const atSijin = async (ctx: MutationCtx) => {
  const me = await requireMe(ctx);
  if (placeOf(me.member) !== NPC.place) throw new ConvexError(`Find ${NPC.name} in the Café to shop.`);
  return me;
};

const plantThere = async (ctx: MutationCtx, owner: string, plot: number) => {
  checkPlot(plot);
  const plant = await plantIn(ctx, owner, plot);
  if (!plant) throw new ConvexError("Nothing's growing there.");
  return plant;
};

const wateringValidator = v.object({ at: v.number(), by: v.union(v.string(), v.null()), mine: v.boolean() });

const shownPlant = (plant: Doc<"worldPlants">, viewer: string) => ({
  plot: plant.plot,
  crop: plant.crop,
  plantedAt: plant.plantedAt,
  waterings: plant.waterings.map((w) => ({ at: w.at, by: w.email === plant.owner || w.name === "" ? null : w.name, mine: w.email !== "" && w.email === viewer })),
});

export const farm = query({
  args: { roomId: v.optional(v.id("worldRooms")) },
  returns: v.union(
    v.null(),
    v.object({
      ownerName: v.string(),
      mine: v.boolean(),
      plots: v.number(),
      plants: v.array(v.object({ plot: v.number(), crop: v.string(), plantedAt: v.number(), waterings: v.array(wateringValidator) })),
    })
  ),
  handler: async (ctx, { roomId }) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    let owner = email;
    if (roomId !== undefined) {
      const me = await memberByEmail(ctx, email);
      const room = await ctx.db.get("worldRooms", roomId);
      if (!me || me.roomId !== roomId || room?.place !== BACKYARD || !room.owner) return null;
      owner = room.owner;
    }
    const row = await farmOf(ctx, owner);
    return {
      ownerName: await nameFor(ctx, owner),
      mine: owner === email,
      plots: row?.plots ?? FREE_PLOTS,
      plants: (await plantsOf(ctx, owner)).map((plant) => shownPlant(plant, email)),
    };
  },
});

export const bag = query({
  args: {},
  returns: v.union(v.null(), v.object({ seeds: v.record(v.string(), v.number()), crops: v.record(v.string(), v.number()), reminders: v.boolean() })),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const row = await farmOf(ctx, email);
    return { seeds: row?.seeds ?? {}, crops: row?.crops ?? {}, reminders: row?.reminders !== false };
  },
});

const done = v.union(v.object({ ok: v.literal(true), serverNow: v.number() }), v.object({ ok: v.literal(false), reason: v.string(), serverNow: v.number() }));

export const water = mutation({
  args: { plot: v.number() },
  returns: done,
  handler: async (ctx, { plot }) => {
    const me = await inBackyard(ctx);
    const plant = await plantThere(ctx, me.owner, plot);
    const now = Date.now();
    const g = growth(plant, now);
    const refuse = (reason: string) => ({ ok: false as const, reason, serverNow: now });
    if (g.stage === "dead") return refuse("It's died.");
    if (g.stage === "ripe") return refuse("It's ready. No water needed.");
    if (!g.thirsty) return refuse("Already watered.");
    await ctx.db.patch("worldPlants", plant._id, { waterings: [...plant.waterings, { at: now, email: me.email, name: me.member.name }] });
    if (me.email !== me.owner) await noteWaterer(ctx, me.email, me.owner);
    return { ok: true as const, serverNow: now };
  },
});

export const plant = mutation({
  args: { plot: v.number(), crop: v.string() },
  returns: v.object({ ok: v.literal(true), serverNow: v.number() }),
  handler: async (ctx, { plot, crop }) => {
    const me = await asOwner(ctx);
    checkPlot(plot);
    if (!isCrop(crop)) throw new ConvexError("That isn't a seed you can plant.");
    const row = await ensureFarm(ctx, me.email);
    if (plot >= row.plots) throw new ConvexError("Buy that plot first.");
    if (await plantIn(ctx, me.email, plot)) throw new ConvexError("Something's growing there already.");
    const have = row.seeds[crop] ?? 0;
    if (have < 1) throw new ConvexError(`Get seeds from ${NPC.name.split(" ")[0]}.`);
    const now = Date.now();
    await ctx.db.patch("worldFarms", row._id, { seeds: { ...row.seeds, [crop]: have - 1 } });
    await ctx.db.insert("worldPlants", { owner: me.email, plot, crop, plantedAt: now, waterings: [] });
    return { ok: true as const, serverNow: now };
  },
});

export const harvest = mutation({
  args: { plot: v.number() },
  returns: v.union(
    v.object({ ok: v.literal(true), crop: v.string(), wilts: v.number(), serverNow: v.number() }),
    v.object({ ok: v.literal(false), reason: v.string(), serverNow: v.number() })
  ),
  handler: async (ctx, { plot }) => {
    const me = await asOwner(ctx);
    const plant = await plantThere(ctx, me.email, plot);
    const now = Date.now();
    const g = growth(plant, now);
    if (g.stage !== "ripe") return { ok: false as const, reason: g.stage === "dead" ? "It's died." : "It isn't ready yet.", serverNow: now };
    const row = await ensureFarm(ctx, me.email);
    const key = stackKey(plant.crop as CropId, g.wilts);
    await ctx.db.patch("worldFarms", row._id, { crops: { ...row.crops, [key]: (row.crops[key] ?? 0) + 1 } });
    await ctx.db.delete("worldPlants", plant._id);
    return { ok: true as const, crop: plant.crop, wilts: g.wilts, serverNow: now };
  },
});

export const clear = mutation({
  args: { plot: v.number() },
  returns: done,
  handler: async (ctx, { plot }) => {
    const me = await asOwner(ctx);
    const plant = await plantThere(ctx, me.email, plot);
    const now = Date.now();
    if (growth(plant, now).stage !== "dead") return { ok: false as const, reason: "It's still growing.", serverNow: now };
    await ctx.db.delete("worldPlants", plant._id);
    return { ok: true as const, serverNow: now };
  },
});

export const buyPlot = mutation({
  args: { plot: v.optional(v.number()) },
  returns: v.object({ balance: v.number(), plots: v.number() }),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const row = await ensureFarm(ctx, email);
    if (args.plot !== undefined && args.plot !== row.plots) throw new ConvexError("That plot has changed. Open it again.");
    const price = plotPrice(row.plots);
    if (price === null) throw new ConvexError("You have every plot.");
    const wallet = await ensureWallet(ctx, email, now);
    if (wallet.balance < price) throw new ConvexError(`You need ${price - wallet.balance} more coins.`);
    const balance = wallet.balance - price;
    const plots = row.plots + 1;
    await ctx.db.patch("worldWallets", wallet._id, { balance });
    await ctx.db.patch("worldFarms", row._id, { plots });
    await ctx.db.insert("coinLedger", { email, delta: -price, kind: "plot-buy", item: `plot-${plots}`, at: now });
    return { balance, plots };
  },
});

export const buySeeds = mutation({
  args: { crop: v.string(), count: v.number() },
  returns: v.object({ balance: v.number(), seeds: v.number() }),
  handler: async (ctx, { crop, count }) => {
    const me = await atSijin(ctx);
    if (!isCrop(crop)) throw new ConvexError(`${NPC.name.split(" ")[0]} doesn't sell that.`);
    if (!Number.isInteger(count) || count < 1 || count > MAX_SEED_BUY) throw new ConvexError(`Buy 1 to ${MAX_SEED_BUY} at a time.`);
    const now = Date.now();
    const row = await ensureFarm(ctx, me.email);
    const seeds = (row.seeds[crop] ?? 0) + count;
    if (seeds > MAX_SEEDS_EACH) throw new ConvexError(`Your bag holds ${MAX_SEEDS_EACH} of each seed.`);
    const price = CROPS[crop].seed * count;
    const wallet = await ensureWallet(ctx, me.email, now);
    if (wallet.balance < price) throw new ConvexError(`You need ${price - wallet.balance} more coins.`);
    const balance = wallet.balance - price;
    await ctx.db.patch("worldWallets", wallet._id, { balance });
    await ctx.db.patch("worldFarms", row._id, { seeds: { ...row.seeds, [crop]: seeds } });
    await ctx.db.insert("coinLedger", { email: me.email, delta: -price, kind: "seed-buy", item: crop, at: now });
    return { balance, seeds };
  },
});

export const sell = mutation({
  args: { stack: v.optional(v.string()) },
  returns: v.object({ balance: v.number(), coins: v.number() }),
  handler: async (ctx, { stack }) => {
    const me = await atSijin(ctx);
    const now = Date.now();
    const row = await farmOf(ctx, me.email);
    const selling = bagStacks(row?.crops ?? {}).filter((s) => stack === undefined || s.key === stack);
    if (!row || selling.length === 0) throw new ConvexError("Nothing to sell.");
    const crops = { ...row.crops };
    let coins = 0;
    for (const s of selling) {
      delete crops[s.key];
      coins += s.count * s.price;
      await ctx.db.insert("coinLedger", { email: me.email, delta: s.count * s.price, kind: "crop-sell", item: s.key, at: now });
    }
    const wallet = await ensureWallet(ctx, me.email, now);
    const balance = wallet.balance + coins;
    await ctx.db.patch("worldWallets", wallet._id, { balance });
    await ctx.db.patch("worldFarms", row._id, { crops });
    return { balance, coins };
  },
});

export const setReminders = mutation({
  args: { on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { on }) => {
    const email = await requireEmail(ctx);
    const row = await ensureFarm(ctx, email);
    await ctx.db.patch("worldFarms", row._id, { reminders: on ? undefined : false });
    return null;
  },
});

const remindBatch = async (ctx: MutationCtx, day: string, cursor: string | null, now: number) => {
  const page = await ctx.db.query("worldFarms").paginate({ numItems: REMIND_BATCH, cursor });
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.farm.remindFrom, { day, cursor: page.continueCursor });
  let sent = 0;
  for (const row of page.page) {
    if (row.reminders === false || row.pushedDay === day) continue;
    const nudge = farmNudge(await plantsOf(ctx, row.owner), row.pushedAt ?? 0, now);
    if (!nudge.due) continue;
    await ctx.db.patch("worldFarms", row._id, { pushedDay: day, pushedAt: now });
    await ctx.scheduler.runAfter(0, internal.push.send, { to: row.owner, title: "Your backyard", body: nudgeText(nudge), url: "/world" });
    sent++;
  }
  return sent;
};

export const remind = internalMutation({
  args: {},
  returns: v.object({ skipped: v.boolean(), sent: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const day = farmPushDay(now);
    if (day === null) return { skipped: true, sent: 0 };
    return { skipped: false, sent: await remindBatch(ctx, day, null, now) };
  },
});

export const remindFrom = internalMutation({
  args: { day: v.string(), cursor: v.string() },
  returns: v.number(),
  handler: async (ctx, { day, cursor }) => await remindBatch(ctx, day, cursor, Date.now()),
});

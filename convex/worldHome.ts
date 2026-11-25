import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  DEFAULT_WALLPAPER,
  FURNITURE,
  fitInRoom,
  HOME_MAX_ITEMS,
  blocksBackDoor,
  isFurniture,
  isTurn,
  isWallpaper,
  MAX_OWNED_EACH,
  ownedLeft,
  placementProblem,
  WALLPAPERS,
  wallpaperOr,
} from "../shared/home";
import { fullBucket, takeToken, NPC } from "../shared/world";
import { ensureWallet, walletOf } from "./coins";
import { optionalEmail } from "./model";
import { homeBackTo, homeOf, homeRowOf, memberByEmail, nameFor, requireMe, placeOf } from "./world";
import { worldPlacedValidator } from "./worldData";

const homeRow = homeRowOf;


export const home = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(
    v.null(),
    v.object({
      ownerName: v.string(),
      mine: v.boolean(),
      wallpaper: v.string(),
      items: v.array(worldPlacedValidator),
      // Where the door takes the caller: the place they came from.
      backTo: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { roomId }) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const me = await memberByEmail(ctx, email);
    const room = await ctx.db.get("worldRooms", roomId);
    if (!me || me.roomId !== roomId || !room?.owner) return null;
    const row = await homeRow(ctx, room.owner);
    return {
      ownerName: await nameFor(ctx, room.owner),
      mine: room.owner === email,
      wallpaper: wallpaperOr(row?.wallpaper),
      items: row?.items ?? [],
      backTo: await homeBackTo(ctx, email),
    };
  },
});

const inOwnHome = async (ctx: MutationCtx) => {
  const me = await requireMe(ctx);
  const owner = await homeOf(ctx, me.member);
  if (owner !== me.email) throw new ConvexError("You can only decorate your own home.");
  return me;
};

const spendDecorate = (bucket: Doc<"worldHomes">["bucket"], now: number) => takeToken("decorate", bucket, now);

const decorated = v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), retryInMs: v.number() }));

export const placeItem = mutation({
  args: { item: v.string(), x: v.number(), z: v.number(), turn: v.number() },
  returns: v.union(v.object({ ok: v.literal(true), key: v.string() }), v.object({ ok: v.literal(false), retryInMs: v.number() })),
  handler: async (ctx, args) => {
    const me = await inOwnHome(ctx);
    if (!isFurniture(args.item) || !isTurn(args.turn)) throw new ConvexError("That isn't something you can place.");
    const now = Date.now();
    const row = await homeRow(ctx, me.email);
    const items = row?.items ?? [];
    const wallet = await walletOf(ctx, me.email);
    if (ownedLeft(wallet?.items, items, args.item) < 1) throw new ConvexError("Buy one from Sijin in the Café first.");
    if (items.length >= HOME_MAX_ITEMS) throw new ConvexError(`A home holds ${HOME_MAX_ITEMS} things. Put something away first.`);
    const spot = fitInRoom(args.item, args.x, args.z, args.turn);
    if (!spot) throw new ConvexError("There's no room for that there.");
    const token = spendDecorate(row?.bucket ?? fullBucket("decorate", now), now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs };
    const key = `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const placed = [...items, { key, item: args.item, x: spot.x, z: spot.z, turn: args.turn }];
    if (row) await ctx.db.patch("worldHomes", row._id, { items: placed, bucket: token.bucket });
    else await ctx.db.insert("worldHomes", { owner: me.email, wallpaper: DEFAULT_WALLPAPER, items: placed, bucket: token.bucket });
    return { ok: true as const, key };
  },
});

export const moveItem = mutation({
  args: { key: v.string(), x: v.number(), z: v.number(), turn: v.number() },
  returns: decorated,
  handler: async (ctx, args) => {
    const me = await inOwnHome(ctx);
    const now = Date.now();
    const row = await homeRow(ctx, me.email);
    const placed = row?.items.find((p) => p.key === args.key);
    if (!row || !placed) throw new ConvexError("That's been put away.");
    const problem = placementProblem(placed.item, args.x, args.z, args.turn);
    if (problem) throw new ConvexError(problem);
    if (isFurniture(placed.item) && blocksBackDoor(placed.item, args.x, args.z, args.turn)) throw new ConvexError("Keep the back door clear.");
    const token = spendDecorate(row.bucket, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs };
    await ctx.db.patch("worldHomes", row._id, {
      items: row.items.map((p) => (p.key === args.key ? { ...p, x: args.x, z: args.z, turn: args.turn } : p)),
      bucket: token.bucket,
    });
    return { ok: true as const };
  },
});

export const removeItem = mutation({
  args: { key: v.string() },
  returns: decorated,
  handler: async (ctx, { key }) => {
    const me = await inOwnHome(ctx);
    const now = Date.now();
    const row = await homeRow(ctx, me.email);
    if (!row || !row.items.some((p) => p.key === key)) return { ok: true as const };
    const token = spendDecorate(row.bucket, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs };
    await ctx.db.patch("worldHomes", row._id, { items: row.items.filter((p) => p.key !== key), bucket: token.bucket });
    return { ok: true as const };
  },
});

export const setWallpaper = mutation({
  args: { wallpaper: v.string() },
  returns: decorated,
  handler: async (ctx, { wallpaper }) => {
    if (!isWallpaper(wallpaper)) throw new ConvexError("That isn't one of the wallpapers.");
    const me = await inOwnHome(ctx);
    const now = Date.now();
    const wallet = await walletOf(ctx, me.email);
    if (WALLPAPERS[wallpaper].price > 0 && !wallet?.wallpapers.includes(wallpaper)) throw new ConvexError("Buy it from Sijin in the Café first.");
    const row = await homeRow(ctx, me.email);
    if ((row?.wallpaper ?? DEFAULT_WALLPAPER) === wallpaper) return { ok: true as const };
    const token = spendDecorate(row?.bucket ?? fullBucket("decorate", now), now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs };
    if (row) await ctx.db.patch("worldHomes", row._id, { wallpaper, bucket: token.bucket });
    else await ctx.db.insert("worldHomes", { owner: me.email, wallpaper, items: [], bucket: token.bucket });
    return { ok: true as const };
  },
});

export const buy = mutation({
  args: { item: v.string() },
  returns: v.object({ balance: v.number() }),
  handler: async (ctx, { item }) => {
    const me = await requireMe(ctx);
    if (placeOf(me.member) !== NPC.place) throw new ConvexError(`Find ${NPC.name} in the Café to shop.`);
    const now = Date.now();
    const wallet = await ensureWallet(ctx, me.email, now);
    const furniture = isFurniture(item);
    if (!furniture && !isWallpaper(item)) throw new ConvexError("Sijin doesn't sell that.");
    const price = furniture ? FURNITURE[item].price : WALLPAPERS[item as keyof typeof WALLPAPERS].price;
    if (!furniture && (price === 0 || wallet.wallpapers.includes(item))) throw new ConvexError("You already have that wallpaper.");
    if (furniture && (wallet.items[item] ?? 0) >= MAX_OWNED_EACH) throw new ConvexError(`You have ${MAX_OWNED_EACH} of those already.`);
    if (wallet.balance < price) throw new ConvexError(`You need ${price - wallet.balance} more coins.`);
    const balance = wallet.balance - price;
    await ctx.db.patch("worldWallets", wallet._id, {
      balance,
      ...(furniture ? { items: { ...wallet.items, [item]: (wallet.items[item] ?? 0) + 1 } } : { wallpapers: [...wallet.wallpapers, item] }),
    });
    await ctx.db.insert("coinLedger", { email: me.email, delta: -price, kind: "buy", item, at: now });
    return { balance };
  },
});

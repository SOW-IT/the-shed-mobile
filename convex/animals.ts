import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  ANIMALS,
  BUILDINGS,
  buildingFor,
  cleanName,
  FEED_BUYS,
  FEEDS,
  isAnimal,
  isBuilding,
  isFeed,
  keptFeedings,
  life,
  MAX_FEED_EACH,
  MAX_NAME_TAGS,
  NAME_MAX,
  NAME_TAG_PRICE,
} from "../shared/animals";
import { BACKYARD } from "../shared/world";
import { ensureWallet } from "./coins";
import { asOwner, atFarmShop, inBackyard, JOSH } from "./farm";
import { animalsOf, buildingsOf, ensureFarm, farmOf, noteFeeder } from "./farmData";
import { optionalEmail, requireEmail } from "./model";
import { blockedEither, memberByEmail } from "./world";


const feedingValidator = v.object({ at: v.number(), by: v.union(v.string(), v.null()), mine: v.boolean() });

const animalValidator = v.object({
  id: v.id("worldAnimals"),
  kind: v.string(),
  name: v.string(),
  boughtAt: v.number(),
  feedings: v.array(feedingValidator),
  collectedAt: v.optional(v.number()),
});

const shownAnimal = (animal: Doc<"worldAnimals">, viewer: string, hidden: ReadonlySet<string>) => ({
  id: animal._id,
  kind: animal.kind,
  name: animal.name,
  boughtAt: animal.boughtAt,
  feedings: animal.feedings.map((f) => ({ at: f.at, by: f.email === animal.owner || f.name === "" || hidden.has(f.email) ? null : f.name, mine: f.email !== "" && f.email === viewer })),
  ...(animal.collectedAt === undefined ? {} : { collectedAt: animal.collectedAt }),
});

export const yard = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(
    v.null(),
    v.object({
      mine: v.boolean(),
      coop: v.boolean(),
      barn: v.boolean(),
      animals: v.array(animalValidator),
      wandered: v.array(v.string()),
    })
  ),
  handler: async (ctx, { roomId }) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const me = await memberByEmail(ctx, email);
    const room = await ctx.db.get("worldRooms", roomId);
    if (!me || me.roomId !== roomId || room?.place !== BACKYARD || !room.owner) return null;
    const owner = room.owner;
    if (await blockedEither(ctx, owner, email)) return null;
    const kinds = new Set((await buildingsOf(ctx, owner)).map((b) => b.kind));
    const mine = owner === email;
    const animals = await animalsOf(ctx, owner);
    const feeders = new Set(animals.flatMap((a) => a.feedings.map((f) => f.email)).filter((e) => e !== "" && e !== owner && e !== email));
    const hidden = new Set<string>();
    for (const feeder of feeders) if (await blockedEither(ctx, email, feeder)) hidden.add(feeder);
    return {
      mine,
      coop: kinds.has("coop"),
      barn: kinds.has("barn"),
      animals: animals.map((animal) => shownAnimal(animal, email, hidden)),
      wandered: mine ? ((await farmOf(ctx, owner))?.wandered ?? []) : [],
    };
  },
});

const animalThere = async (ctx: MutationCtx, owner: string, rawId: string) => {
  const id = ctx.db.normalizeId("worldAnimals", rawId);
  const animal = id && (await ctx.db.get("worldAnimals", id));
  if (!animal || animal.owner !== owner) throw new ConvexError("That animal isn't here.");
  return animal;
};

const spend = async (ctx: MutationCtx, email: string, price: number, now: number) => {
  const wallet = await ensureWallet(ctx, email, now);
  if (wallet.balance < price) throw new ConvexError(`You need ${price - wallet.balance} more coins.`);
  const balance = wallet.balance - price;
  await ctx.db.patch("worldWallets", wallet._id, { balance });
  return balance;
};

const ownsBuilding = async (ctx: MutationCtx, owner: string, kind: string) =>
  (await ctx.db
    .query("worldBuildings")
    .withIndex("by_owner_and_kind", (q) => q.eq("owner", owner).eq("kind", kind))
    .first()) !== null;

export const buyBuilding = mutation({
  args: { kind: v.string() },
  returns: v.object({ balance: v.number() }),
  handler: async (ctx, { kind }) => {
    const email = await requireEmail(ctx);
    if (!isBuilding(kind)) throw new ConvexError(`${JOSH} doesn't build that.`);
    if (await ownsBuilding(ctx, email, kind)) throw new ConvexError(`You have a ${BUILDINGS[kind].short.toLowerCase()} already.`);
    const now = Date.now();
    const price = BUILDINGS[kind].price;
    const balance = await spend(ctx, email, price, now);
    await ensureFarm(ctx, email);
    await ctx.db.insert("worldBuildings", { owner: email, kind, boughtAt: now });
    await ctx.db.insert("coinLedger", { email, delta: -price, kind: "building-buy", item: kind, at: now });
    return { balance };
  },
});

const letGo = async (ctx: MutationCtx, owner: string, now: number) => {
  const names: string[] = [];
  const kept: Doc<"worldAnimals">[] = [];
  for (const animal of await animalsOf(ctx, owner)) {
    if (life(animal, now).mood !== "gone") {
      kept.push(animal);
      continue;
    }
    names.push(animal.name);
    await ctx.db.delete("worldAnimals", animal._id);
  }
  return { names, kept };
};

const nameOf = (raw: string) => {
  const name = cleanName(raw);
  if (!name) throw new ConvexError(`Give it a name, up to ${NAME_MAX} characters.`);
  return name;
};

export const buyAnimal = mutation({
  args: { kind: v.string(), name: v.string() },
  returns: v.object({ balance: v.number(), id: v.id("worldAnimals") }),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    if (!isAnimal(args.kind)) throw new ConvexError(`${JOSH} doesn't sell that.`);
    const kind = args.kind;
    const name = nameOf(args.name);
    const building = buildingFor(kind);
    if (!(await ownsBuilding(ctx, email, building))) throw new ConvexError(`Buy the ${BUILDINGS[building].short.toLowerCase()} first.`);
    const now = Date.now();
    const { names, kept } = await letGo(ctx, email, now);
    if (kept.filter((a) => a.kind === kind).length >= BUILDINGS[building].capacity) throw new ConvexError(`The ${BUILDINGS[building].short.toLowerCase()} is full.`);
    const price = ANIMALS[kind].price;
    const balance = await spend(ctx, email, price, now);
    const farm = await ensureFarm(ctx, email);
    if (names.length > 0) await ctx.db.patch("worldFarms", farm._id, { wandered: [...(farm.wandered ?? []), ...names] });
    const id = await ctx.db.insert("worldAnimals", { owner: email, kind, name, boughtAt: now, feedings: [] });
    await ctx.db.insert("coinLedger", { email, delta: -price, kind: "animal-buy", item: kind, at: now });
    return { balance, id };
  },
});

const done = v.union(v.object({ ok: v.literal(true), serverNow: v.number() }), v.object({ ok: v.literal(false), reason: v.string(), serverNow: v.number() }));

export const feed = mutation({
  args: { animalId: v.string() },
  returns: done,
  handler: async (ctx, { animalId }) => {
    const me = await inBackyard(ctx);
    const animal = await animalThere(ctx, me.owner, animalId);
    const now = Date.now();
    const refuse = (reason: string) => ({ ok: false as const, reason, serverNow: now });
    const l = life(animal, now);
    if (l.mood === "gone") return refuse(`${animal.name} wandered off.`);
    if (l.mood === "fed") return refuse("Already fed today.");
    const food = isAnimal(animal.kind) ? ANIMALS[animal.kind].feed : "grain";
    const row = await ensureFarm(ctx, me.email);
    const have = row.feed?.[food] ?? 0;
    if (have < 1) return refuse(`Get feed from ${JOSH}.`);
    await ctx.db.patch("worldFarms", row._id, { feed: { ...row.feed, [food]: have - 1 } });
    const feedings = keptFeedings({ ...animal, feedings: [...animal.feedings, { at: now, email: me.email, name: me.member.name }] }, now);
    await ctx.db.patch("worldAnimals", animal._id, { feedings });
    if (me.email !== me.owner) await noteFeeder(ctx, me.email, me.owner);
    return { ok: true as const, serverNow: now };
  },
});

export const collect = mutation({
  args: { animalId: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), good: v.string(), serverNow: v.number() }), v.object({ ok: v.literal(false), reason: v.string(), serverNow: v.number() })),
  handler: async (ctx, { animalId }) => {
    const me = await asOwner(ctx);
    const animal = await animalThere(ctx, me.email, animalId);
    const now = Date.now();
    if (!life(animal, now).ready) return { ok: false as const, reason: "Nothing to collect yet.", serverNow: now };
    const good = isAnimal(animal.kind) ? ANIMALS[animal.kind].product : "egg";
    const row = await ensureFarm(ctx, me.email);
    await ctx.db.patch("worldFarms", row._id, { goods: { ...row.goods, [good]: (row.goods?.[good] ?? 0) + 1 } });
    await ctx.db.patch("worldAnimals", animal._id, { collectedAt: now });
    return { ok: true as const, good, serverNow: now };
  },
});

export const rename = mutation({
  args: { animalId: v.string(), name: v.string() },
  returns: v.object({ name: v.string(), nameTags: v.number() }),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const animal = await animalThere(ctx, email, args.animalId);
    const name = nameOf(args.name);
    if (name === animal.name) throw new ConvexError("Pick a different name.");
    if (life(animal, Date.now()).mood === "gone") throw new ConvexError(`${animal.name} wandered off.`);
    const row = await ensureFarm(ctx, email);
    const tags = row.nameTags ?? 0;
    if (tags < 1) throw new ConvexError(`Get a name tag from ${JOSH}.`);
    await ctx.db.patch("worldFarms", row._id, { nameTags: tags - 1 });
    await ctx.db.patch("worldAnimals", animal._id, { name });
    return { name, nameTags: tags - 1 };
  },
});

export const settle = mutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const { names } = await letGo(ctx, email, Date.now());
    const row = await farmOf(ctx, email);
    const noted = row?.wandered ?? [];
    if (row && noted.length > 0) await ctx.db.patch("worldFarms", row._id, { wandered: undefined });
    return [...noted, ...names];
  },
});

export const buyFeed = mutation({
  args: { feed: v.string(), count: v.number() },
  returns: v.object({ balance: v.number(), feed: v.number() }),
  handler: async (ctx, { feed, count }) => {
    const me = await atFarmShop(ctx);
    if (!isFeed(feed)) throw new ConvexError(`${JOSH} doesn't sell that.`);
    if (!(FEED_BUYS as readonly number[]).includes(count)) throw new ConvexError(`Buy ${FEED_BUYS.join(" or ")} at a time.`);
    const now = Date.now();
    const row = await ensureFarm(ctx, me.email);
    const total = (row.feed?.[feed] ?? 0) + count;
    if (total > MAX_FEED_EACH) throw new ConvexError(`Your bag holds ${MAX_FEED_EACH} ${FEEDS[feed].label.toLowerCase()}.`);
    const price = FEEDS[feed].price * count;
    const balance = await spend(ctx, me.email, price, now);
    await ctx.db.patch("worldFarms", row._id, { feed: { ...row.feed, [feed]: total } });
    await ctx.db.insert("coinLedger", { email: me.email, delta: -price, kind: "feed-buy", item: `${feed}:${count}`, at: now });
    return { balance, feed: total };
  },
});

export const buyNameTag = mutation({
  args: {},
  returns: v.object({ balance: v.number(), nameTags: v.number() }),
  handler: async (ctx) => {
    const me = await atFarmShop(ctx);
    const now = Date.now();
    const row = await ensureFarm(ctx, me.email);
    const nameTags = (row.nameTags ?? 0) + 1;
    if (nameTags > MAX_NAME_TAGS) throw new ConvexError(`Your bag holds ${MAX_NAME_TAGS} name tags.`);
    const balance = await spend(ctx, me.email, NAME_TAG_PRICE, now);
    await ctx.db.patch("worldFarms", row._id, { nameTags });
    await ctx.db.insert("coinLedger", { email: me.email, delta: -NAME_TAG_PRICE, kind: "nametag-buy", at: now });
    return { balance, nameTags };
  },
});

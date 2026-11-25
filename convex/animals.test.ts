import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { ANIMALS, BUILDINGS, FEEDS, GOODS, MAX_FEED_EACH, MAX_NAME_TAGS, NAME_TAG_PRICE } from "../shared/animals";
import { DAY_MS, FREE_PLOTS } from "../shared/farm";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const HOUR = 60 * 60_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

const go = async (t: T, email: string, to: string, extra: { door?: boolean; invite?: string } = {}) => {
  const reply = await asUser(t, email).mutation(api.world.travel, { to, ...extra });
  later(5000);
  return reply;
};

const intoBackyard = async (t: T, email: string) => {
  await asUser(t, email).mutation(api.world.join, { backyard: true });
  await go(t, email, "home");
  return await go(t, email, "backyard", { door: true });
};

const visit = async (t: T, owner: string, guest: string) => {
  const { memberId } = await asUser(t, guest).mutation(api.world.join, { backyard: true });
  await asUser(t, owner).mutation(api.world.invite, { memberId });
  later(5000);
  const [card] = await asUser(t, guest).query(api.world.invites, {});
  await go(t, guest, "home", { invite: card.id });
  return await go(t, guest, "backyard", { door: true });
};

const atCafe = async (t: T, email: string) => {
  await asUser(t, email).mutation(api.world.join, { backyard: true });
  await go(t, email, "cafe");
};

const atJosh = async (t: T, email: string) => {
  await asUser(t, email).mutation(api.world.join, { backyard: true });
  await go(t, email, "beach");
  await go(t, email, "garden");
};

const roomOf = (t: T, email: string) =>
  t.run(async (ctx) => (await ctx.db.query("worldMembers").withIndex("by_email", (q) => q.eq("email", email)).first())!.roomId);

const farmRow = (t: T, owner: string) => t.run((ctx) => ctx.db.query("worldFarms").withIndex("by_owner", (q) => q.eq("owner", owner)).unique());

const setFarm = (t: T, owner: string, fields: { feed?: Record<string, number>; goods?: Record<string, number>; nameTags?: number; crops?: Record<string, number>; wandered?: string[] }) =>
  t.run(async (ctx) => {
    const row = await ctx.db.query("worldFarms").withIndex("by_owner", (q) => q.eq("owner", owner)).unique();
    if (row) await ctx.db.patch("worldFarms", row._id, fields);
    else await ctx.db.insert("worldFarms", { owner, plots: FREE_PLOTS, seeds: {}, crops: {}, ...fields });
  });

const give = (t: T, email: string, coins: number) =>
  t.run(async (ctx) => {
    const row = await ctx.db.query("worldWallets").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (row) await ctx.db.patch("worldWallets", row._id, { balance: coins });
    else await ctx.db.insert("worldWallets", { email, balance: coins, earnedDay: "2000-01-01", earnedToday: 0, items: {}, wallpapers: [] });
  });

const balanceOf = (t: T, email: string) => t.run(async (ctx) => (await ctx.db.query("worldWallets").withIndex("by_email", (q) => q.eq("email", email)).unique())?.balance);

const ledger = (t: T, email: string) =>
  t.run((ctx) => ctx.db.query("coinLedger").withIndex("by_email_and_at", (q) => q.eq("email", email)).collect());

const build = (t: T, owner: string, kind: "coop" | "barn") => t.run((ctx) => ctx.db.insert("worldBuildings", { owner, kind, boughtAt: Date.now() }));

const raise = (t: T, owner: string, kind: "chicken" | "cow", boughtAt: number, feedings: number[] = [], name = "Pat") =>
  t.run((ctx) => ctx.db.insert("worldAnimals", { owner, kind, name, boughtAt, feedings: feedings.map((at) => ({ at, email: owner, name: "Owner" })) }));

const animal = (t: T, id: Id<"worldAnimals">) => t.run((ctx) => ctx.db.get("worldAnimals", id));

const grownHen = (t: T, owner: string, extra: number[] = []) => {
  const born = Date.now() - 4 * DAY_MS - HOUR;
  return raise(t, owner, "chicken", born, [1, 2, 3].map((n) => born + n * DAY_MS + HOUR).concat(extra), "Henrietta");
};

describe("buildings", () => {
  test("the coop and the barn cost 50 and 80, one each, from anywhere", async () => {
    const t = newConvex();
    await give(t, ANNA, 200);
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.animals.buyBuilding, { kind: "coop" })).toEqual({ balance: 150 });
    expect(await anna.mutation(api.animals.buyBuilding, { kind: "barn" })).toEqual({ balance: 70 });
    await expect(anna.mutation(api.animals.buyBuilding, { kind: "coop" })).rejects.toThrow(/have a coop already/);
    await expect(anna.mutation(api.animals.buyBuilding, { kind: "pigsty" })).rejects.toThrow(/doesn't build that/);
    expect((await ledger(t, ANNA)).map((row) => [row.kind, row.delta, row.item])).toEqual([
      ["building-buy", -BUILDINGS.coop.price, "coop"],
      ["building-buy", -BUILDINGS.barn.price, "barn"],
    ]);
    expect(await farmRow(t, ANNA)).not.toBeNull();
  });

  test("the balance is checked on the server", async () => {
    const t = newConvex();
    await give(t, ANNA, 79);
    await expect(asUser(t, ANNA).mutation(api.animals.buyBuilding, { kind: "barn" })).rejects.toThrow(/need 1 more coins/);
    expect(await balanceOf(t, ANNA)).toBe(79);
  });
});

describe("buying animals", () => {
  test("a chick needs the coop, and a calf the barn", async () => {
    const t = newConvex();
    await give(t, ANNA, 500);
    const anna = asUser(t, ANNA);
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "chicken", name: "Pip" })).rejects.toThrow(/Buy the coop first/);
    await build(t, ANNA, "coop");
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "cow", name: "Daisy" })).rejects.toThrow(/Buy the barn first/);
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "goat", name: "Billy" })).rejects.toThrow(/doesn't sell that/);
    const { balance, id } = await anna.mutation(api.animals.buyAnimal, { kind: "chicken", name: "Pip" });
    expect(balance).toBe(500 - ANIMALS.chicken.price);
    expect(await animal(t, id)).toMatchObject({ owner: ANNA, kind: "chicken", name: "Pip", feedings: [] });
    expect((await ledger(t, ANNA)).at(-1)).toMatchObject({ kind: "animal-buy", delta: -24, item: "chicken" });
  });

  test("4 hens fill the coop and 2 cows the barn", async () => {
    const t = newConvex();
    await give(t, ANNA, 1000);
    await build(t, ANNA, "coop");
    await build(t, ANNA, "barn");
    const anna = asUser(t, ANNA);
    for (let i = 0; i < 4; i++) await anna.mutation(api.animals.buyAnimal, { kind: "chicken", name: `Hen ${i}` });
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "chicken", name: "Five" })).rejects.toThrow(/coop is full/);
    for (let i = 0; i < 2; i++) await anna.mutation(api.animals.buyAnimal, { kind: "cow", name: `Cow ${i}` });
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "cow", name: "Three" })).rejects.toThrow(/barn is full/);
    expect(await balanceOf(t, ANNA)).toBe(1000 - 4 * 24 - 2 * 55);
  });

  test("naming is free when buying, filtered like chat, and at most 16 characters", async () => {
    const t = newConvex();
    await give(t, ANNA, 100);
    await build(t, ANNA, "barn");
    const anna = asUser(t, ANNA);
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "cow", name: "Seventeen letters" })).rejects.toThrow(/up to 16 characters/);
    await expect(anna.mutation(api.animals.buyAnimal, { kind: "cow", name: "​ \n" })).rejects.toThrow(/Give it a name/);
    const { id } = await anna.mutation(api.animals.buyAnimal, { kind: "cow", name: "  Daisy\n May " });
    expect((await animal(t, id))?.name).toBe("Daisy May");
    expect(await balanceOf(t, ANNA)).toBe(45);
  });

  test("short of coins, nothing is bought", async () => {
    const t = newConvex();
    await give(t, ANNA, 54);
    await build(t, ANNA, "barn");
    await expect(asUser(t, ANNA).mutation(api.animals.buyAnimal, { kind: "cow", name: "Daisy" })).rejects.toThrow(/need 1 more coins/);
    expect(await t.run((ctx) => ctx.db.query("worldAnimals").collect())).toEqual([]);
  });

  test("an animal that wandered off frees its space, and the owner gets a note", async () => {
    const t = newConvex();
    await give(t, ANNA, 100);
    await build(t, ANNA, "barn");
    await raise(t, ANNA, "cow", Date.now() - 3 * DAY_MS, [], "Daisy");
    await raise(t, ANNA, "cow", Date.now() - HOUR, [], "Bessie");
    await asUser(t, ANNA).mutation(api.animals.buyAnimal, { kind: "cow", name: "Clover" });
    expect((await t.run((ctx) => ctx.db.query("worldAnimals").collect())).map((a) => a.name)).toEqual(["Bessie", "Clover"]);
    expect((await farmRow(t, ANNA))?.wandered).toEqual(["Daisy"]);
  });
});

describe("the yard", () => {
  test("shows the owner's buildings and animals to people in that backyard only", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await build(t, ANNA, "coop");
    await raise(t, ANNA, "chicken", Date.now(), [], "Pip");
    const roomId = await roomOf(t, ANNA);
    expect(await asUser(t, ANNA).query(api.animals.yard, { roomId })).toMatchObject({ mine: true, coop: true, barn: false, animals: [{ kind: "chicken", name: "Pip", feedings: [] }], wandered: [] });
    await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    expect(await asUser(t, BEN).query(api.animals.yard, { roomId })).toBeNull();
    expect(await t.query(api.animals.yard, { roomId })).toBeNull();
    const garden = await roomOf(t, BEN);
    expect(await asUser(t, BEN).query(api.animals.yard, { roomId: garden })).toBeNull();
  });

  test("a visitor sees the animals, not the owner's notes", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await setFarm(t, ANNA, { wandered: ["Daisy"] });
    const roomId = await roomOf(t, ANNA);
    expect(await asUser(t, ANNA).query(api.animals.yard, { roomId })).toMatchObject({ mine: true, wandered: ["Daisy"] });
    expect(await asUser(t, BEN).query(api.animals.yard, { roomId })).toMatchObject({ mine: false, wandered: [] });
  });

  test("the owner settles what wandered off once", async () => {
    const t = newConvex();
    await setFarm(t, ANNA, { wandered: ["Daisy"] });
    await raise(t, ANNA, "chicken", Date.now() - 4 * DAY_MS, [], "Pip");
    await raise(t, ANNA, "chicken", Date.now(), [], "Dot");
    expect(await asUser(t, ANNA).mutation(api.animals.settle, {})).toEqual(["Daisy", "Pip"]);
    expect(await asUser(t, ANNA).mutation(api.animals.settle, {})).toEqual([]);
    expect((await t.run((ctx) => ctx.db.query("worldAnimals").collect())).map((a) => a.name)).toEqual(["Dot"]);
    expect(await asUser(t, CARA).mutation(api.animals.settle, {})).toEqual([]);
  });
});

describe("feeding", () => {
  test("one feed from the bag, once a window, and buying covers the first", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const id = await raise(t, ANNA, "cow", Date.now() - DAY_MS - HOUR, [], "Daisy");
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.animals.feed, { animalId: id })).toMatchObject({ ok: false, reason: "Get feed from Josh." });
    await setFarm(t, ANNA, { feed: { hay: 2, grain: 5 } });
    expect(await anna.mutation(api.animals.feed, { animalId: id })).toMatchObject({ ok: true });
    expect(await anna.mutation(api.animals.feed, { animalId: id })).toMatchObject({ ok: false, reason: "Already fed today." });
    expect((await farmRow(t, ANNA))?.feed).toEqual({ hay: 1, grain: 5 });
    expect((await animal(t, id))?.feedings).toEqual([{ at: expect.any(Number), email: ANNA, name: expect.any(String) }]);
    const young = await raise(t, ANNA, "cow", Date.now(), [], "Calfy");
    expect(await anna.mutation(api.animals.feed, { animalId: young })).toMatchObject({ ok: false, reason: "Already fed today." });
  });

  test("a wandered-off animal can't be fed, and only animals in this backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await setFarm(t, ANNA, { feed: { grain: 5 } });
    const gone = await raise(t, ANNA, "chicken", Date.now() - 3 * DAY_MS, [], "Pip");
    expect(await asUser(t, ANNA).mutation(api.animals.feed, { animalId: gone })).toMatchObject({ ok: false, reason: "Pip wandered off." });
    const elsewhere = await raise(t, BEN, "chicken", Date.now() - DAY_MS - HOUR);
    await expect(asUser(t, ANNA).mutation(api.animals.feed, { animalId: elsewhere })).rejects.toThrow(/isn't here/);
    await expect(asUser(t, ANNA).mutation(api.animals.feed, { animalId: "nope" })).rejects.toThrow(/isn't here/);
    await go(t, ANNA, "garden");
    await expect(asUser(t, ANNA).mutation(api.animals.feed, { animalId: gone })).rejects.toThrow(/Go to the backyard first/);
  });

  test("a grown animal keeps only the feedings it still needs", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await setFarm(t, ANNA, { feed: { grain: 20 } });
    const born = Date.now() - 4 * DAY_MS - HOUR;
    const id = await raise(t, ANNA, "chicken", born, [1, 2, 3, 4].map((n) => born + n * DAY_MS + 10 * 60_000));
    for (let n = 0; n < 3; n++) {
      later(DAY_MS);
      expect(await asUser(t, ANNA).mutation(api.animals.feed, { animalId: id })).toMatchObject({ ok: true });
    }
    expect((await animal(t, id))?.feedings).toHaveLength(5);
  });
});

describe("visitors", () => {
  test("feed with their own feed, and the animal shows who fed it", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await setFarm(t, ANNA, { feed: { hay: 3 } });
    const id = await raise(t, ANNA, "cow", Date.now() - DAY_MS - HOUR, [], "Daisy");
    const ben = asUser(t, BEN);
    expect(await ben.mutation(api.animals.feed, { animalId: id })).toMatchObject({ ok: false, reason: "Get feed from Josh." });
    await setFarm(t, BEN, { feed: { hay: 1 } });
    expect(await ben.mutation(api.animals.feed, { animalId: id })).toMatchObject({ ok: true });
    expect((await farmRow(t, ANNA))?.feed).toEqual({ hay: 3 });
    expect((await farmRow(t, BEN))?.feed).toEqual({ hay: 0 });
    const roomId = await roomOf(t, ANNA);
    const seen = await asUser(t, ANNA).query(api.animals.yard, { roomId });
    expect(seen?.animals[0].feedings).toEqual([{ at: expect.any(Number), by: expect.any(String), mine: false }]);
    expect((await ben.query(api.animals.yard, { roomId }))?.animals[0].feedings[0].mine).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("worldFeeders").collect())).toMatchObject([{ email: BEN, owner: ANNA }]);
    later(DAY_MS);
    await setFarm(t, BEN, { feed: { hay: 1 } });
    await ben.mutation(api.animals.feed, { animalId: id });
    expect(await t.run((ctx) => ctx.db.query("worldFeeders").collect())).toHaveLength(1);
  });

  test("can't collect, rename or buy for the owner", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    const id = await grownHen(t, ANNA, [Date.now() - 10 * 60_000]);
    await setFarm(t, BEN, { nameTags: 2 });
    await give(t, BEN, 500);
    const ben = asUser(t, BEN);
    await expect(ben.mutation(api.animals.collect, { animalId: id })).rejects.toThrow(/Only the owner/);
    await expect(ben.mutation(api.animals.rename, { animalId: id, name: "Mine" })).rejects.toThrow(/isn't here/);
    await expect(ben.mutation(api.animals.buyAnimal, { kind: "chicken", name: "Pip" })).rejects.toThrow(/Buy the coop first/);
    expect((await animal(t, id))?.name).toBe("Henrietta");
    expect((await farmRow(t, ANNA))?.goods).toBeUndefined();
  });

  test("someone blocked sees no yard, and a blocked feeder's name is hidden", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await visit(t, ANNA, CARA);
    await t.run((ctx) => ctx.db.insert("worldAnimals", { owner: ANNA, kind: "cow", name: "Daisy", boughtAt: Date.now() - DAY_MS - HOUR, feedings: [{ at: Date.now(), email: CARA, name: "Cara" }] }));
    const roomId = await roomOf(t, ANNA);
    expect((await asUser(t, BEN).query(api.animals.yard, { roomId }))?.animals[0].feedings[0].by).toBe("Cara");
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: BEN, blockedEmail: CARA, blockedName: "Cara" }));
    expect((await asUser(t, BEN).query(api.animals.yard, { roomId }))?.animals[0].feedings[0].by).toBeNull();
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "Ben" }));
    expect(await asUser(t, BEN).query(api.animals.yard, { roomId })).toBeNull();
  });

  test("someone blocked can't feed", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await setFarm(t, BEN, { feed: { hay: 1 } });
    const id = await raise(t, ANNA, "cow", Date.now() - DAY_MS - HOUR);
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "Ben" }));
    await expect(asUser(t, BEN).mutation(api.animals.feed, { animalId: id })).rejects.toThrow(/can't do that here/);
  });
});

describe("collecting", () => {
  test("the owner collects an egg into the bag, once per fed window", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const anna = asUser(t, ANNA);
    const id = await grownHen(t, ANNA);
    expect(await anna.mutation(api.animals.collect, { animalId: id })).toMatchObject({ ok: false, reason: "Nothing to collect yet." });
    await setFarm(t, ANNA, { feed: { grain: 1 } });
    await anna.mutation(api.animals.feed, { animalId: id });
    expect(await anna.mutation(api.animals.collect, { animalId: id })).toMatchObject({ ok: true, good: "egg" });
    expect(await anna.mutation(api.animals.collect, { animalId: id })).toMatchObject({ ok: false });
    expect((await farmRow(t, ANNA))?.goods).toEqual({ egg: 1 });
  });

  test("milking a grown cow", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const born = Date.now() - 5 * DAY_MS - 2 * HOUR;
    const id = await raise(t, ANNA, "cow", born, [1, 2, 3, 4, 5].map((n) => born + n * DAY_MS + HOUR));
    await setFarm(t, ANNA, { goods: { milk: 2 } });
    expect(await asUser(t, ANNA).mutation(api.animals.collect, { animalId: id })).toMatchObject({ ok: true, good: "milk" });
    expect((await farmRow(t, ANNA))?.goods).toEqual({ milk: 3 });
  });
});

describe("renaming", () => {
  test("needs a name tag, which it uses up", async () => {
    const t = newConvex();
    const id = await raise(t, ANNA, "cow", Date.now(), [], "Daisy");
    const anna = asUser(t, ANNA);
    await setFarm(t, ANNA, {});
    await expect(anna.mutation(api.animals.rename, { animalId: id, name: "Bessie" })).rejects.toThrow(/Get a name tag from Josh/);
    await setFarm(t, ANNA, { nameTags: 1 });
    await expect(anna.mutation(api.animals.rename, { animalId: id, name: "x".repeat(17) })).rejects.toThrow(/up to 16/);
    await expect(anna.mutation(api.animals.rename, { animalId: id, name: "Daisy" })).rejects.toThrow(/different name/);
    expect(await anna.mutation(api.animals.rename, { animalId: id, name: "Bessie" })).toEqual({ name: "Bessie", nameTags: 0 });
    expect((await animal(t, id))?.name).toBe("Bessie");
  });

  test("not once it's wandered off", async () => {
    const t = newConvex();
    await setFarm(t, ANNA, { nameTags: 1 });
    const id = await raise(t, ANNA, "cow", Date.now() - 3 * DAY_MS, [], "Daisy");
    await expect(asUser(t, ANNA).mutation(api.animals.rename, { animalId: id, name: "Bessie" })).rejects.toThrow(/wandered off/);
    expect((await farmRow(t, ANNA))?.nameTags).toBe(1);
  });
});

describe("Josh's feed and name tags", () => {
  test("grain and hay come in 1 or 5, from Josh in the Garden only, at the table's price", async () => {
    const t = newConvex();
    await atCafe(t, ANNA);
    await expect(asUser(t, ANNA).mutation(api.animals.buyFeed, { feed: "hay", count: 1 })).rejects.toThrow(/Find Josh Kim in the Garden/);
    await go(t, ANNA, "garden");
    await give(t, ANNA, 100);
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.animals.buyFeed, { feed: "grain", count: 5 })).toEqual({ balance: 100 - 5 * FEEDS.grain.price, feed: 5 });
    expect(await anna.mutation(api.animals.buyFeed, { feed: "hay", count: 1 })).toEqual({ balance: 90 - FEEDS.hay.price, feed: 1 });
    await expect(anna.mutation(api.animals.buyFeed, { feed: "hay", count: 3 })).rejects.toThrow(/Buy 1 or 5/);
    await expect(anna.mutation(api.animals.buyFeed, { feed: "corn", count: 1 })).rejects.toThrow(/doesn't sell that/);
    expect((await ledger(t, ANNA)).filter((row) => row.kind === "feed-buy").map((row) => [row.delta, row.item])).toEqual([[-10, "grain:5"], [-3, "hay:1"]]);
  });

  test("the bag holds 99 of each, and the balance is checked", async () => {
    const t = newConvex();
    await atJosh(t, ANNA);
    await setFarm(t, ANNA, { feed: { hay: MAX_FEED_EACH - 4 } });
    await give(t, ANNA, 100);
    await expect(asUser(t, ANNA).mutation(api.animals.buyFeed, { feed: "hay", count: 5 })).rejects.toThrow(/holds 99 hay/);
    await give(t, ANNA, 2);
    await expect(asUser(t, ANNA).mutation(api.animals.buyFeed, { feed: "hay", count: 1 })).rejects.toThrow(/need 1 more coins/);
  });

  test("a name tag is 20 coins and stacks", async () => {
    const t = newConvex();
    await atJosh(t, ANNA);
    await give(t, ANNA, 45);
    expect(await asUser(t, ANNA).mutation(api.animals.buyNameTag, {})).toEqual({ balance: 45 - NAME_TAG_PRICE, nameTags: 1 });
    expect(await asUser(t, ANNA).mutation(api.animals.buyNameTag, {})).toEqual({ balance: 5, nameTags: 2 });
    await expect(asUser(t, ANNA).mutation(api.animals.buyNameTag, {})).rejects.toThrow(/need 15 more/);
    await setFarm(t, ANNA, { nameTags: MAX_NAME_TAGS });
    await expect(asUser(t, ANNA).mutation(api.animals.buyNameTag, {})).rejects.toThrow(/holds 9 name tags/);
    expect((await ledger(t, ANNA)).filter((row) => row.kind === "nametag-buy")).toHaveLength(2);
  });
});

describe("selling eggs and milk", () => {
  test("Sell all includes them at Josh, one stack sells alone, and the old app at Sijin sells only crops", async () => {
    const t = newConvex();
    await atCafe(t, ANNA);
    await give(t, ANNA, 0);
    await setFarm(t, ANNA, { crops: { "lettuce:0": 2 }, goods: { egg: 3, milk: 1 } });
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.farm.sell, {})).toEqual({ balance: 8, coins: 8 });
    expect((await farmRow(t, ANNA))?.goods).toEqual({ egg: 3, milk: 1 });
    await expect(anna.mutation(api.farm.sell, { goods: true })).rejects.toThrow(/Find Josh Kim in the Garden/);
    await go(t, ANNA, "garden");
    expect(await anna.mutation(api.farm.sell, { stack: "milk", goods: true })).toEqual({ balance: 17, coins: GOODS.milk.sells });
    await setFarm(t, ANNA, { crops: { "carrot:0": 1 } });
    expect(await anna.mutation(api.farm.sell, { goods: true })).toEqual({ balance: 17 + 11 + 18, coins: 29 });
    expect(await farmRow(t, ANNA)).toMatchObject({ crops: {}, goods: {} });
    expect((await ledger(t, ANNA)).filter((row) => row.kind === "product-sell").map((row) => [row.item, row.delta])).toEqual([["milk", 9], ["egg", 18]]);
    await expect(anna.mutation(api.farm.sell, { goods: true })).rejects.toThrow(/Nothing to sell/);
  });
});

describe("reminders", () => {
  const AEDT_6PM = Date.UTC(2026, 11, 1, 7, 13);
  const AEST_6PM = Date.UTC(2026, 5, 1, 8, 13);

  const sentTo = async (t: T) =>
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter((job) => job.name.includes("push")).map((job) => job.args[0] as { to: string; body: string });

  test.each([
    ["AEDT", AEDT_6PM],
    ["AEST", AEST_6PM],
  ])("one push at 18:00 Sydney with plants and animals together (%s)", async (_, at) => {
    const t = newConvex();
    vi.setSystemTime(at);
    await setFarm(t, ANNA, {});
    await t.run((ctx) => ctx.db.insert("worldPlants", { owner: ANNA, plot: 0, crop: "tomato", plantedAt: at - DAY_MS - HOUR, waterings: [] }));
    await raise(t, ANNA, "cow", at - DAY_MS - HOUR);
    await raise(t, ANNA, "chicken", at - 2 * DAY_MS - HOUR);
    await grownHen(t, ANNA, [at - HOUR]);
    expect(await t.mutation(internal.farm.remind, {})).toEqual({ skipped: false, sent: 1 });
    expect(await sentTo(t)).toEqual([expect.objectContaining({ to: ANNA, body: "1 plant needs water · 2 animals are hungry · 1 egg to collect" })]);
    expect(await t.mutation(internal.farm.remind, {})).toEqual({ skipped: false, sent: 0 });
  });

  test("animals alone send it, and milk counts", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    await setFarm(t, ANNA, {});
    const born = AEDT_6PM - 5 * DAY_MS - 2 * HOUR;
    await raise(t, ANNA, "cow", born, [1, 2, 3, 4, 5].map((n) => born + n * DAY_MS + HOUR));
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 1 });
    expect(await sentTo(t)).toEqual([expect.objectContaining({ body: "1 cow to milk" })]);
  });

  test("turned off, no push", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    await asUser(t, ANNA).mutation(api.farm.setReminders, { on: false });
    await raise(t, ANNA, "cow", AEDT_6PM - DAY_MS - HOUR);
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 0 });
  });

  test("an animal that's fed with nothing waiting sends nothing", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    await setFarm(t, ANNA, {});
    await raise(t, ANNA, "cow", AEDT_6PM - HOUR);
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 0 });
  });
});

describe("account deletion", () => {
  test("a feeder's name comes off every animal they fed, and the feeding still counts", async () => {
    const t = newConvex();
    await raise(t, ANNA, "cow", Date.now(), [], "Plain");
    const id = await t.run((ctx) => ctx.db.insert("worldAnimals", { owner: ANNA, kind: "cow", name: "Daisy", boughtAt: Date.now() - DAY_MS - HOUR, feedings: [{ at: Date.now(), email: BEN, name: "Ben" }] }));
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("worldFeeders", { email: BEN, owner: ANNA });
      return await ctx.db.insert("users", { email: BEN, name: "Ben" });
    });
    await t.mutation(internal.account.wipe, { userId });
    expect((await animal(t, id))?.feedings).toEqual([{ at: Date.now(), email: "", name: "" }]);
  });

  test("an owner's account takes the feeder and waterer rows about their farm with it", async () => {
    const t = newConvex();
    const userId = await t.run(async (ctx) => {
      await ctx.db.insert("worldFeeders", { email: BEN, owner: ANNA });
      await ctx.db.insert("worldWaterers", { email: BEN, owner: ANNA });
      await ctx.db.insert("worldFeeders", { email: BEN, owner: CARA });
      return await ctx.db.insert("users", { email: ANNA, name: "Anna" });
    });
    await t.mutation(internal.account.wipe, { userId });
    expect(await t.run((ctx) => ctx.db.query("worldFeeders").collect())).toMatchObject([{ owner: CARA }]);
    expect(await t.run((ctx) => ctx.db.query("worldWaterers").collect())).toEqual([]);
  });
});

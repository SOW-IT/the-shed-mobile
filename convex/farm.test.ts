import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { CROPS, DAY_MS, farmWindow, FREE_PLOTS, MAX_SEED_BUY, MAX_SEEDS_EACH, PLOT_COUNT, PLOT_PRICES, STARTER_SEEDS, sellPrice, stackKey } from "../shared/farm";
import { BACK_DOOR } from "../shared/home";
import { HOME_ARRIVAL, posAt } from "../shared/world";

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

const memberOf = (t: T, email: string) =>
  t.run(async (ctx) => {
    const member = await ctx.db
      .query("worldMembers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    const room = member && (await ctx.db.get("worldRooms", member.roomId));
    const state = member && (await ctx.db.query("worldState").withIndex("by_memberId", (q) => q.eq("memberId", member._id)).unique());
    return { member, room, state };
  });

const farmRow = (t: T, owner: string) => t.run((ctx) => ctx.db.query("worldFarms").withIndex("by_owner", (q) => q.eq("owner", owner)).unique());

const setFarm = (t: T, owner: string, fields: { seeds?: Record<string, number>; crops?: Record<string, number>; plots?: number }) =>
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

const pushes = (t: T) => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

describe("the backyard", () => {
  test("the back door leads from your home to your backyard and back", async () => {
    const reply = await intoBackyard(newConvex(), ANNA);
    expect(reply).toMatchObject({ ok: true, place: "backyard" });
  });

  test("you come in at the back door's pad, and go back in at the back door", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const out = await memberOf(t, ANNA);
    expect(out.room).toMatchObject({ place: "backyard", owner: ANNA });
    expect(posAt(out.state!, Date.now()).z).toBeGreaterThan(6);
    await go(t, ANNA, "home", { door: true });
    const back = await memberOf(t, ANNA);
    expect(back.room).toMatchObject({ place: "home", owner: ANNA });
    expect(posAt(back.state!, Date.now())).toMatchObject({ x: BACK_DOOR.x, z: BACK_DOOR.z });
    await go(t, ANNA, "garden");
    expect((await memberOf(t, ANNA)).room?.place).toBe("garden");
  });

  test("the first visit gives 4 lettuce seeds, once only", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    expect((await farmRow(t, ANNA))?.seeds).toEqual({ [STARTER_SEEDS.crop]: STARTER_SEEDS.count });
    await go(t, ANNA, "home", { door: true });
    await go(t, ANNA, "backyard", { door: true });
    expect((await farmRow(t, ANNA))?.seeds).toEqual({ lettuce: 4 });
  });

  test("nobody jumps straight to a backyard from a public place: it's through the home", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, { backyard: true });
    await expect(asUser(t, ANNA).mutation(api.world.travel, { to: "backyard" })).rejects.toThrow(/no way to Backyard/);
    expect((await memberOf(t, ANNA)).room?.place).toBe("garden");
    await go(t, ANNA, "home");
    expect(await go(t, ANNA, "backyard", { door: true })).toMatchObject({ ok: true, place: "backyard" });
    expect((await memberOf(t, ANNA)).room?.owner).toBe(ANNA);
  });

  test("a guest follows the owner through the back door into the owner's backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    const anna = await memberOf(t, ANNA);
    const ben = await memberOf(t, BEN);
    expect(ben.room?._id).toBe(anna.room?._id);
    expect(await farmRow(t, BEN)).toBeNull();
    await go(t, BEN, "home", { door: true });
    expect((await memberOf(t, BEN)).room).toMatchObject({ place: "home", owner: ANNA });
  });

  test("your own backyard from someone else's, when you don't come through their door", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await go(t, BEN, "backyard");
    expect((await memberOf(t, BEN)).room).toMatchObject({ place: "backyard", owner: BEN });
  });

  test("nobody gets into a backyard without the owner's invite", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    await go(t, BEN, "home");
    const forged = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: CARA, at: Date.now(), expiresAt: Date.now() + DAY_MS }));
    await expect(asUser(t, BEN).mutation(api.world.travel, { to: "backyard", invite: forged })).rejects.toThrow(/isn't yours/);
    const invite = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: BEN, at: Date.now(), expiresAt: Date.now() - 1 }));
    await expect(asUser(t, BEN).mutation(api.world.travel, { to: "backyard", invite })).rejects.toThrow(/run out/);
  });

  test("an invite can't be carried through a door, and the door doesn't let a blocked guest through", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    await go(t, BEN, "home");
    await go(t, BEN, "backyard", { door: true });
    const invite = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: BEN, at: Date.now(), expiresAt: Date.now() + DAY_MS }));
    await expect(asUser(t, BEN).mutation(api.world.travel, { to: "home", invite, door: true })).rejects.toThrow(/isn't a way in/);
    expect((await memberOf(t, BEN)).room?.owner).toBe(BEN);
    await go(t, BEN, "garden");
    await go(t, BEN, "home", { invite });
    await asUser(t, ANNA).mutation(api.world.block, { memberId: (await memberOf(t, BEN)).member!._id });
    later(5000);
    await expect(asUser(t, BEN).mutation(api.world.travel, { to: "backyard", door: true })).rejects.toThrow(/run out/);
  });

  test("someone blocked can't farm in that backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "lettuce" });
    await visit(t, ANNA, BEN);
    await asUser(t, ANNA).mutation(api.world.block, { memberId: (await memberOf(t, BEN)).member!._id });
    later(DAY_MS);
    await expect(asUser(t, BEN).mutation(api.farm.water, { plot: 0 })).rejects.toThrow(/can't do that here/);
  });

  test("a full backyard turns people away", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const { room } = await memberOf(t, ANNA);
    await t.run((ctx) => ctx.db.patch("worldRooms", room!._id, { memberCount: 8 }));
    await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    await go(t, BEN, "home");
    const invite = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: BEN, at: Date.now(), expiresAt: Date.now() + DAY_MS }));
    await expect(asUser(t, BEN).mutation(api.world.travel, { to: "backyard", invite })).rejects.toThrow(/backyard is full/);
  });

  test("a home and a backyard are two rooms of one owner", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    const invite = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: BEN, at: Date.now(), expiresAt: Date.now() + DAY_MS }));
    await go(t, BEN, "home", { invite });
    const ben = await memberOf(t, BEN);
    expect(ben.room).toMatchObject({ place: "home", owner: ANNA, memberCount: 1 });
    expect(posAt(ben.state!, Date.now())).toMatchObject(HOME_ARRIVAL);
  });

  test("lines said in a backyard reach the whole World, tagged as the backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, ANNA).mutation(api.world.say, { text: "Weeding" });
    const { roomId } = await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    const heard = await asUser(t, BEN).query(api.world.chatLog, { roomId });
    expect(heard?.find((line) => line.text === "Weeding")).toMatchObject({ place: "backyard", here: false, isMe: false });
    const own = await asUser(t, ANNA).query(api.world.chatLog, { roomId: (await memberOf(t, ANNA)).room!._id });
    expect(own?.find((line) => line.text === "Weeding")).toMatchObject({ here: true, isMe: true });
  });

  test("in a backyard you read and answer the World's chat, and someone else's backyard hears it too", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await intoBackyard(t, CARA);
    const { roomId } = await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    await asUser(t, BEN).mutation(api.world.say, { text: "Anyone about?" });
    const annaRoom = (await memberOf(t, ANNA)).room!._id;
    const inYard = await asUser(t, ANNA).query(api.world.chatLog, { roomId: annaRoom });
    expect(inYard?.find((line) => line.text === "Anyone about?")).toMatchObject({ place: "garden", here: false });
    await asUser(t, ANNA).mutation(api.world.say, { text: "In my backyard" });
    const garden = await asUser(t, BEN).query(api.world.chatLog, { roomId });
    expect(garden?.find((line) => line.text === "In my backyard")).toMatchObject({ place: "backyard", here: false });
    const otherYard = await asUser(t, CARA).query(api.world.chatLog, { roomId: (await memberOf(t, CARA)).room!._id });
    expect(otherYard?.find((line) => line.text === "In my backyard")).toMatchObject({ place: "backyard", here: false });
  });

  test("after leaving the backyard and coming back, the World's chat and your own lines are still there", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, ANNA).mutation(api.world.say, { text: "Planting" });
    await go(t, ANNA, "home", { door: true });
    await go(t, ANNA, "garden");
    const inGarden = await asUser(t, ANNA).query(api.world.chatLog, { roomId: (await memberOf(t, ANNA)).room!._id });
    expect(inGarden?.find((line) => line.text === "Planting")).toMatchObject({ place: "backyard", here: false });
    await go(t, ANNA, "home");
    await go(t, ANNA, "backyard", { door: true });
    // An empty backyard closes, so this is a new room: the line is back, tagged.
    const back = await asUser(t, ANNA).query(api.world.chatLog, { roomId: (await memberOf(t, ANNA)).room!._id });
    expect(back?.find((line) => line.text === "Planting")).toMatchObject({ place: "backyard", isMe: true });
  });

  test("who came into a backyard, and lines said there before backyards talked to the World, stay in that backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const yard = (await memberOf(t, ANNA)).room!;
    const annaMember = (await memberOf(t, ANNA)).member!;
    await t.run((ctx) =>
      ctx.db.insert("worldChat", { roomId: yard._id, place: "backyard", memberId: annaMember._id, email: ANNA, name: "anna", text: "Said before", at: Date.now() })
    );
    const { roomId } = await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    const heard = (await asUser(t, BEN).query(api.world.chatLog, { roomId }))!;
    expect(heard.some((line) => line.text === "Said before")).toBe(false);
    expect(heard.some((line) => line.place === "backyard")).toBe(false);
    const own = (await asUser(t, ANNA).query(api.world.chatLog, { roomId: yard._id }))!;
    expect(own.find((line) => line.text === "Said before")).toMatchObject({ here: true });
  });
});

describe("older apps never land in a backyard", () => {
  test("coming back to the World goes home instead, unless the app knows the backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, ANNA).mutation(api.world.leave, {});
    later(5000);
    expect((await asUser(t, ANNA).mutation(api.world.join, {})).place).toBe("home");
    await asUser(t, ANNA).mutation(api.world.leave, {});
    await go(t, ANNA, "garden").catch(() => undefined);
    later(5000);
    await asUser(t, ANNA).mutation(api.world.join, { backyard: true });
    await go(t, ANNA, "backyard");
    await asUser(t, ANNA).mutation(api.world.leave, {});
    later(5000);
    expect((await asUser(t, ANNA).mutation(api.world.join, { backyard: true })).place).toBe("backyard");
  });

  test("a guest leaving someone's backyard comes back to the Garden", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await asUser(t, BEN).mutation(api.world.leave, {});
    later(5000);
    expect((await asUser(t, BEN).mutation(api.world.join, { backyard: true })).place).toBe("garden");
  });

  test("a poke from a backyard opens the owner's home on an older app", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await t.run((ctx) => ctx.db.insert("staffProfiles", { email: BEN, name: "Ben", year: 2026 }));
    const profile = await t.run(async (ctx) => (await ctx.db.query("staffProfiles").first())!._id);
    expect(await asUser(t, ANNA).mutation(api.world.pokeStaff, { profileId: profile })).toMatchObject({ ok: true });
    const poke = await t.run(async (ctx) => (await ctx.db.query("worldPokes").first())!);
    expect(poke).toMatchObject({ place: "backyard", owner: ANNA });
    const note = await t.run(async (ctx) => (await ctx.db.query("notifications").first())!);
    expect(note.body).toBe("Come and join me in my backyard.");
    const old = await asUser(t, BEN).mutation(api.world.join, { poke: poke._id });
    expect(old.place).toBe("home");
    expect((await memberOf(t, BEN)).room?.owner).toBe(ANNA);
    await asUser(t, BEN).mutation(api.world.leave, {});
    later(60_000);
    const current = await asUser(t, BEN).mutation(api.world.join, { poke: poke._id, backyard: true });
    expect(current.place).toBe("backyard");
  });

  test("a poke from a backyard whose owner has gone still finds the backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await t.run((ctx) => ctx.db.insert("staffProfiles", { email: BEN, name: "Ben", year: 2026 }));
    const profile = await t.run(async (ctx) => (await ctx.db.query("staffProfiles").first())!._id);
    await asUser(t, ANNA).mutation(api.world.pokeStaff, { profileId: profile });
    await asUser(t, ANNA).mutation(api.world.leave, {});
    const poke = await t.run(async (ctx) => (await ctx.db.query("worldPokes").first())!);
    expect((await asUser(t, BEN).mutation(api.world.join, { poke: poke._id, backyard: true })).place).toBe("backyard");
    await asUser(t, BEN).mutation(api.world.leave, {});
    later(60_000);
    expect((await asUser(t, BEN).mutation(api.world.join, { poke: poke._id })).place).toBe("home");
  });
});

describe("planting, watering and harvesting", () => {
  test("the owner plants a seed from the bag", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "lettuce" });
    expect((await farmRow(t, ANNA))?.seeds).toEqual({ lettuce: 3 });
    const farm = await asUser(t, ANNA).query(api.farm.farm, { roomId: (await memberOf(t, ANNA)).room!._id });
    expect(farm).toMatchObject({ mine: true, plots: FREE_PLOTS, plants: [{ plot: 0, crop: "lettuce", plantedAt: Date.now(), waterings: [] }] });
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "lettuce" })).rejects.toThrow(/growing there already/);
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: FREE_PLOTS, crop: "lettuce" })).rejects.toThrow(/Buy that plot/);
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: 1, crop: "tomato" })).rejects.toThrow(/Get seeds from Josh/);
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: 1, crop: "kale" })).rejects.toThrow(/isn't a seed/);
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: PLOT_COUNT, crop: "lettuce" })).rejects.toThrow(/isn't one of the plots/);
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: 0.5, crop: "lettuce" })).rejects.toThrow(/isn't one of the plots/);
  });

  test("farming needs you in a backyard", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, { backyard: true });
    await expect(asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "lettuce" })).rejects.toThrow(/backyard first/);
    await expect(asUser(t, ANNA).mutation(api.farm.water, { plot: 0 })).rejects.toThrow(/backyard first/);
    await go(t, ANNA, "home");
    await expect(asUser(t, ANNA).mutation(api.farm.water, { plot: 0 })).rejects.toThrow(/backyard first/);
  });

  test("watering inside a window counts once, and planting covered the first", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const anna = asUser(t, ANNA);
    await anna.mutation(api.farm.plant, { plot: 0, crop: "lettuce" });
    const lettucePlanted = Date.now();
    expect(await anna.mutation(api.farm.water, { plot: 0 })).toMatchObject({ ok: false, reason: "Already watered." });
    await expect(anna.mutation(api.farm.water, { plot: 1 })).rejects.toThrow(/Nothing's growing/);
    vi.setSystemTime(farmWindow(lettucePlanted, 1).start);
    expect(await anna.mutation(api.farm.water, { plot: 0 })).toMatchObject({ ok: false, reason: "It's ready. No water needed." });
    await setFarm(t, ANNA, { seeds: { tomato: 1 } });
    await anna.mutation(api.farm.plant, { plot: 1, crop: "tomato" });
    const tomatoPlanted = Date.now();
    vi.setSystemTime(farmWindow(tomatoPlanted, 1).start + HOUR);
    expect(await anna.mutation(api.farm.water, { plot: 1 })).toMatchObject({ ok: true });
    expect(await anna.mutation(api.farm.water, { plot: 1 })).toMatchObject({ ok: false, reason: "Already watered." });
    vi.setSystemTime(farmWindow(tomatoPlanted, 5).start);
    expect(await anna.mutation(api.farm.water, { plot: 1 })).toMatchObject({ ok: false, reason: "It's died." });
  });

  test("harvesting a ripe crop puts it in the bag by condition", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const anna = asUser(t, ANNA);
    await setFarm(t, ANNA, { seeds: { lettuce: 1, carrot: 1 } });
    await anna.mutation(api.farm.plant, { plot: 0, crop: "lettuce" });
    await anna.mutation(api.farm.plant, { plot: 1, crop: "carrot" });
    const planted = Date.now();
    expect(await anna.mutation(api.farm.harvest, { plot: 0 })).toMatchObject({ ok: false, reason: "It isn't ready yet." });
    vi.setSystemTime(farmWindow(planted, 2).start + HOUR);
    expect(await anna.mutation(api.farm.harvest, { plot: 0 })).toMatchObject({ ok: true, crop: "lettuce", wilts: 0 });
    expect(await anna.mutation(api.farm.water, { plot: 1 })).toMatchObject({ ok: true });
    vi.setSystemTime(farmWindow(planted, 3).start);
    expect(await anna.mutation(api.farm.harvest, { plot: 1 })).toMatchObject({ ok: true, crop: "carrot", wilts: 1 });
    expect((await farmRow(t, ANNA))?.crops).toEqual({ [stackKey("lettuce", 0)]: 1, [stackKey("carrot", 1)]: 1 });
    expect(await anna.query(api.farm.bag, {})).toEqual({ seeds: { lettuce: 0, carrot: 0 }, crops: { "lettuce:0": 1, "carrot:1": 1 }, reminders: true, feed: {}, goods: {}, nameTags: 0 });
  });

  test("a dead plant is cleared for free and the seed is lost", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const anna = asUser(t, ANNA);
    await anna.mutation(api.farm.plant, { plot: 2, crop: "lettuce" });
    const planted = Date.now();
    expect(await anna.mutation(api.farm.clear, { plot: 2 })).toMatchObject({ ok: false, reason: "It's still growing." });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("worldPlants").first())!;
      await ctx.db.patch("worldPlants", row._id, { crop: "watermelon" });
    });
    vi.setSystemTime(farmWindow(planted, 4).start);
    expect(await anna.mutation(api.farm.harvest, { plot: 2 })).toMatchObject({ ok: false, reason: "It's died." });
    expect(await anna.mutation(api.farm.clear, { plot: 2 })).toMatchObject({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldPlants").collect())).toEqual([]);
    expect((await farmRow(t, ANNA))?.seeds).toEqual({ lettuce: 3 });
  });
});

describe("who can do what", () => {
  test("a visitor waters, and the plot shows who watered it", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await setFarm(t, ANNA, { seeds: { tomato: 1 } });
    await asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "tomato" });
    const planted = Date.now();
    await visit(t, ANNA, BEN);
    vi.setSystemTime(farmWindow(planted, 1).start + HOUR);
    expect(await asUser(t, BEN).mutation(api.farm.water, { plot: 0 })).toMatchObject({ ok: true });
    const roomId = (await memberOf(t, BEN)).room!._id;
    const seen = await asUser(t, BEN).query(api.farm.farm, { roomId });
    expect(seen).toMatchObject({ mine: false, plants: [{ waterings: [{ by: expect.any(String), mine: true }] }] });
    const owners = await asUser(t, ANNA).query(api.farm.farm, { roomId });
    expect(owners?.plants[0].waterings[0]).toMatchObject({ by: seen?.plants[0].waterings[0].by, mine: false });
    expect((await pushes(t)).filter((job) => job.name.includes("push"))).toEqual([]);
  });

  test("deleting a visitor's account takes their name off the plants they watered, and the watering still counts", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await setFarm(t, ANNA, { seeds: { tomato: 1 } });
    await asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "tomato" });
    const planted = Date.now();
    await visit(t, ANNA, BEN);
    vi.setSystemTime(farmWindow(planted, 1).start + HOUR);
    await asUser(t, BEN).mutation(api.farm.water, { plot: 0 });
    await asUser(t, BEN).mutation(api.farm.water, { plot: 0 });
    expect(await t.run((ctx) => ctx.db.query("worldWaterers").collect())).toMatchObject([{ email: BEN, owner: ANNA }]);
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: BEN, name: "Ben" }));
    vi.useFakeTimers();
    await t.mutation(internal.account.wipe, { userId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [plant] = await t.run((ctx) => ctx.db.query("worldPlants").collect());
    expect(plant.waterings).toHaveLength(1);
    expect(plant.waterings[0]).toMatchObject({ email: "", name: "" });
    const seen = await asUser(t, ANNA).query(api.farm.farm, { roomId: (await memberOf(t, ANNA)).room!._id });
    expect(seen?.plants[0].waterings[0]).toMatchObject({ by: null, mine: false });
    expect(await t.run((ctx) => ctx.db.query("worldWaterers").collect())).toEqual([]);
  });

  test("the owner's own watering shows no name", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await setFarm(t, ANNA, { seeds: { tomato: 1 } });
    await asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "tomato" });
    const planted = Date.now();
    vi.setSystemTime(farmWindow(planted, 1).start + HOUR);
    await asUser(t, ANNA).mutation(api.farm.water, { plot: 0 });
    const farm = await asUser(t, ANNA).query(api.farm.farm, {});
    expect(farm?.plants[0].waterings[0]).toMatchObject({ by: null, mine: true });
  });

  test("a visitor can't plant, harvest or clear", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await asUser(t, ANNA).mutation(api.farm.plant, { plot: 0, crop: "lettuce" });
    const planted = Date.now();
    await visit(t, ANNA, BEN);
    await setFarm(t, BEN, { seeds: { lettuce: 2 } });
    const ben = asUser(t, BEN);
    await expect(ben.mutation(api.farm.plant, { plot: 1, crop: "lettuce" })).rejects.toThrow(/Only the owner/);
    vi.setSystemTime(farmWindow(planted, 1).start);
    await expect(ben.mutation(api.farm.harvest, { plot: 0 })).rejects.toThrow(/Only the owner/);
    await expect(ben.mutation(api.farm.clear, { plot: 0 })).rejects.toThrow(/Only the owner/);
    expect(await t.run((ctx) => ctx.db.query("worldPlants").collect())).toHaveLength(1);
  });

  test("buying a plot always buys your own, never the backyard you're in", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    await visit(t, ANNA, BEN);
    await give(t, BEN, 100);
    expect(await asUser(t, BEN).mutation(api.farm.buyPlot, {})).toEqual({ balance: 90, plots: FREE_PLOTS + 1 });
    expect((await farmRow(t, ANNA))?.plots).toBe(FREE_PLOTS);
    expect((await farmRow(t, BEN))?.plots).toBe(FREE_PLOTS + 1);
  });

  test("you sell only your own crops", async () => {
    const t = newConvex();
    await setFarm(t, ANNA, { crops: { "tomato:0": 3 } });
    await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    await go(t, BEN, "cafe");
    await expect(asUser(t, BEN).mutation(api.farm.sell, {})).rejects.toThrow(/Nothing to sell/);
    await expect(asUser(t, BEN).mutation(api.farm.sell, { stack: "tomato:0" })).rejects.toThrow(/Nothing to sell/);
    expect((await farmRow(t, ANNA))?.crops).toEqual({ "tomato:0": 3 });
  });

  test("a farm is seen only from inside its backyard", async () => {
    const t = newConvex();
    await intoBackyard(t, ANNA);
    const annaRoom = (await memberOf(t, ANNA)).room!._id;
    const { roomId: benRoom } = await asUser(t, BEN).mutation(api.world.join, { backyard: true });
    expect(await asUser(t, BEN).query(api.farm.farm, { roomId: annaRoom })).toBeNull();
    expect(await asUser(t, BEN).query(api.farm.farm, { roomId: benRoom })).toBeNull();
    expect(await t.query(api.farm.farm, {})).toBeNull();
    expect(await t.query(api.farm.bag, {})).toBeNull();
    expect(await asUser(t, CARA).query(api.farm.farm, {})).toMatchObject({ mine: true, plots: FREE_PLOTS, plants: [] });
    expect(await asUser(t, CARA).query(api.farm.bag, {})).toEqual({ seeds: {}, crops: {}, reminders: true, feed: {}, goods: {}, nameTags: 0 });
  });
});

describe("plots", () => {
  test("plots 5 to 12 cost 10 to 1280 coins, in order", async () => {
    const t = newConvex();
    await give(t, ANNA, 10_000);
    const anna = asUser(t, ANNA);
    let balance = 10_000;
    for (const price of PLOT_PRICES) {
      balance -= price;
      expect(await anna.mutation(api.farm.buyPlot, {})).toMatchObject({ balance });
    }
    expect((await farmRow(t, ANNA))?.plots).toBe(PLOT_COUNT);
    await expect(anna.mutation(api.farm.buyPlot, {})).rejects.toThrow(/every plot/);
    const rows = (await ledger(t, ANNA)).filter((row) => row.kind === "plot-buy");
    expect(rows.map((row) => [row.delta, row.item])).toEqual(PLOT_PRICES.map((price, i) => [-price, `plot-${FREE_PLOTS + i + 1}`]));
  });

  test("a plot offer that's out of date charges nothing", async () => {
    const t = newConvex();
    await give(t, ANNA, 100);
    expect(await asUser(t, ANNA).mutation(api.farm.buyPlot, { plot: FREE_PLOTS })).toMatchObject({ plots: FREE_PLOTS + 1 });
    await expect(asUser(t, ANNA).mutation(api.farm.buyPlot, { plot: FREE_PLOTS })).rejects.toThrow(/has changed/);
    expect(await balanceOf(t, ANNA)).toBe(90);
  });

  test("buying a plot checks the balance", async () => {
    const t = newConvex();
    await give(t, ANNA, 5);
    await expect(asUser(t, ANNA).mutation(api.farm.buyPlot, {})).rejects.toThrow(/need 5 more coins/);
    expect(await balanceOf(t, ANNA)).toBe(5);
  });
});

describe("Josh's farm shop, and Sijin's for older apps", () => {
  const atCafe = async (t: T, email: string) => {
    await asUser(t, email).mutation(api.world.join, { backyard: true });
    await go(t, email, "cafe");
  };

  test("seeds are bought in person from Josh in the Garden, or from Sijin in the Café on older apps", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, { backyard: true });
    await go(t, ANNA, "beach");
    await expect(asUser(t, ANNA).mutation(api.farm.buySeeds, { crop: "tomato", count: 1 })).rejects.toThrow(/Find Josh Kim in the Garden/);
    await go(t, ANNA, "garden");
    await give(t, ANNA, CROPS.lettuce.seed);
    expect(await asUser(t, ANNA).mutation(api.farm.buySeeds, { crop: "lettuce", count: 1 })).toEqual({ balance: 0, seeds: 1 });
    await go(t, ANNA, "cafe");
    await give(t, ANNA, CROPS.tomato.seed * 2);
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.farm.buySeeds, { crop: "tomato", count: 2 })).toEqual({ balance: 0, seeds: 2 });
    await expect(anna.mutation(api.farm.buySeeds, { crop: "tomato", count: 1 })).rejects.toThrow(/need 25 more coins/);
    await expect(anna.mutation(api.farm.buySeeds, { crop: "kale", count: 1 })).rejects.toThrow(/doesn't sell that/);
    await expect(anna.mutation(api.farm.buySeeds, { crop: "tomato", count: 0 })).rejects.toThrow(/at a time/);
    await expect(anna.mutation(api.farm.buySeeds, { crop: "tomato", count: MAX_SEED_BUY + 1 })).rejects.toThrow(/at a time/);
    await expect(anna.mutation(api.farm.buySeeds, { crop: "tomato", count: 1.5 })).rejects.toThrow(/at a time/);
    expect((await ledger(t, ANNA)).filter((row) => row.kind === "seed-buy").map((row) => [row.delta, row.item])).toEqual([[-CROPS.lettuce.seed, "lettuce"], [-50, "tomato"]]);
  });

  test("the bag holds so many of each seed", async () => {
    const t = newConvex();
    await atCafe(t, ANNA);
    await setFarm(t, ANNA, { seeds: { lettuce: MAX_SEEDS_EACH } });
    await expect(asUser(t, ANNA).mutation(api.farm.buySeeds, { crop: "lettuce", count: 1 })).rejects.toThrow(/holds 99/);
  });

  test("sell all sells every stack at its own price", async () => {
    const t = newConvex();
    await atCafe(t, ANNA);
    await setFarm(t, ANNA, { crops: { "tomato:0": 3, "tomato:1": 1, "watermelon:2": 2, junk: 4 } });
    const total = 3 * sellPrice("tomato", 0) + sellPrice("tomato", 1) + 2 * sellPrice("watermelon", 2);
    const before = (await asUser(t, ANNA).query(api.coins.mine, {}))!.balance;
    expect(await asUser(t, ANNA).mutation(api.farm.sell, {})).toEqual({ balance: before + total, coins: total });
    expect((await farmRow(t, ANNA))?.crops).toEqual({ junk: 4 });
    const sold = (await ledger(t, ANNA)).filter((row) => row.kind === "crop-sell");
    expect(sold.map((row) => [row.item, row.delta])).toEqual([
      ["tomato:0", 3 * sellPrice("tomato", 0)],
      ["tomato:1", sellPrice("tomato", 1)],
      ["watermelon:2", 2 * sellPrice("watermelon", 2)],
    ]);
  });

  test("one stack sells on its own", async () => {
    const t = newConvex();
    await atCafe(t, ANNA);
    await setFarm(t, ANNA, { crops: { "carrot:0": 2, "carrot:1": 1 } });
    expect(await asUser(t, ANNA).mutation(api.farm.sell, { stack: "carrot:1" })).toMatchObject({ coins: sellPrice("carrot", 1) });
    expect((await farmRow(t, ANNA))?.crops).toEqual({ "carrot:0": 2 });
  });
});

describe("reminders", () => {
  const AEDT_6PM = Date.UTC(2026, 11, 1, 7, 13);
  const AEST_6PM = Date.UTC(2026, 5, 1, 8, 13);

  const growing = async (t: T, owner: string, plantedAt: number, crop = "tomato") =>
    t.run((ctx) => ctx.db.insert("worldPlants", { owner, plot: 0, crop, plantedAt, waterings: [] }));

  const sentTo = async (t: T) =>
    (await pushes(t)).filter((job) => job.name.includes("push")).map((job) => (job.args[0] as { to: string; body: string }));

  test.each([
    ["AEDT", AEDT_6PM],
    ["AEST", AEST_6PM],
  ])("one combined push at 18:00 Sydney (%s)", async (_, at) => {
    const t = newConvex();
    vi.setSystemTime(at - HOUR);
    expect(await t.mutation(internal.farm.remind, {})).toEqual({ skipped: true, sent: 0 });
    vi.setSystemTime(at);
    await setFarm(t, ANNA, {});
    await growing(t, ANNA, at - 2 * DAY_MS - HOUR);
    await t.run((ctx) => ctx.db.insert("worldPlants", { owner: ANNA, plot: 1, crop: "lettuce", plantedAt: at - 3 * DAY_MS, waterings: [] }));
    expect(await t.mutation(internal.farm.remind, {})).toEqual({ skipped: false, sent: 1 });
    expect(await sentTo(t)).toEqual([expect.objectContaining({ to: ANNA, body: "1 plant needs water · 1 ready to harvest" })]);
    expect(await t.mutation(internal.farm.remind, {})).toEqual({ skipped: false, sent: 0 });
  });

  test("at most one a day, and only for something new", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    await setFarm(t, ANNA, {});
    await t.run((ctx) => ctx.db.insert("worldPlants", { owner: ANNA, plot: 1, crop: "lettuce", plantedAt: AEDT_6PM - 2 * DAY_MS, waterings: [] }));
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 1 });
    vi.setSystemTime(AEDT_6PM + DAY_MS);
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 0 });
  });

  test("nothing to do sends nothing", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    await setFarm(t, ANNA, {});
    await growing(t, ANNA, AEDT_6PM - HOUR);
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 0 });
  });

  test("turned off, no push", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    await asUser(t, ANNA).mutation(api.farm.setReminders, { on: false });
    await growing(t, ANNA, AEDT_6PM - 2 * DAY_MS - HOUR);
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 0 });
    expect((await asUser(t, ANNA).query(api.farm.bag, {}))?.reminders).toBe(false);
    await asUser(t, ANNA).mutation(api.farm.setReminders, { on: true });
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 1 });
  });

  test("goes through every farm in pages", async () => {
    const t = newConvex();
    vi.setSystemTime(AEDT_6PM);
    for (let i = 0; i < 55; i++) {
      const owner = `farmer${i}@sow.org.au`;
      await setFarm(t, owner, {});
      await growing(t, owner, AEDT_6PM - 2 * DAY_MS - HOUR);
    }
    expect(await t.mutation(internal.farm.remind, {})).toMatchObject({ sent: 50 });
    const next = (await pushes(t)).find((job) => job.name.includes("remindFrom"))!;
    expect(await t.mutation(internal.farm.remindFrom, next.args[0] as { day: string; cursor: string })).toBe(5);
  });
});

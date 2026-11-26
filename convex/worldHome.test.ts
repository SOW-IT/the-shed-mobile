import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { currentStaffYear } from "./model";
import { removeFromWorld } from "./world";
import { START_COINS } from "../shared/coins";
import { BACK_DOOR, DOOR_CLEAR, FURNITURE, HOME_CAP, HOME_DOOR, footprint, placementProblem } from "../shared/home";
import { ARRIVE_APART, BUCKETS, HOME_ARRIVAL, INVITE_MS, KNOCK_MS, NPC, POKE_EVERY_MS, POKE_ARRIVAL_MS, ROOM_CAP, WALK_BOUNDS, distance, posAt } from "../shared/world";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

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

const goTo = async (t: T, email: string, to: string) => {
  const reply = await asUser(t, email).mutation(api.world.travel, { to });
  later(5000);
  return reply;
};

const give = (t: T, email: string, coins: number) =>
  t.run(async (ctx) => {
    await ctx.db.insert("worldWallets", { email, balance: coins, earnedDay: "2000-01-01", earnedToday: 0, items: {}, wallpapers: [] });
  });

const staffProfile = (t: T, email: string) =>
  t.run((ctx) => ctx.db.insert("staffProfiles", { email, name: email.split("@")[0], year: currentStaffYear() }));

describe("homes are invite only", () => {
  test("you can always go home, in your own room", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    await asUser(t, BEN).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await goTo(t, BEN, "home");
    const anna = await memberOf(t, ANNA);
    const ben = await memberOf(t, BEN);
    expect(anna.room?.owner).toBe(ANNA);
    expect(ben.room?.owner).toBe(BEN);
    expect(anna.room?._id).not.toBe(ben.room?._id);
    expect(anna.state && posAt(anna.state, Date.now())).toMatchObject(HOME_ARRIVAL);
  });

  test("someone else's home needs their invite, and it runs out", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    await anna.mutation(api.world.join, {});
    const { memberId: benId } = await ben.mutation(api.world.join, {});
    const forged = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: CARA, at: Date.now(), expiresAt: Date.now() + INVITE_MS }));
    await expect(ben.mutation(api.world.travel, { to: "home", invite: forged })).rejects.toThrow(/isn't yours/);
    expect(await anna.mutation(api.world.invite, { memberId: benId })).toMatchObject({ ok: true });
    const [card] = await ben.query(api.world.invites, {});
    expect(card).toMatchObject({ ownerName: expect.any(String), at: expect.closeTo(Date.now(), -2) });
    expect(await ben.mutation(api.world.travel, { to: "home", invite: card.id })).toMatchObject({ ok: true, place: "home" });
    expect((await memberOf(t, BEN)).room?.owner).toBe(ANNA);
    await goTo(t, BEN, "garden");
    later(INVITE_MS);
    await expect(ben.mutation(api.world.travel, { to: "home", invite: card.id })).rejects.toThrow(/run out/);
  });

  test("a blocked person can't come in even with an old invite", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    await anna.mutation(api.world.join, {});
    const { memberId: benId } = await ben.mutation(api.world.join, {});
    await anna.mutation(api.world.invite, { memberId: benId });
    const [card] = await ben.query(api.world.invites, {});
    await anna.mutation(api.world.block, { memberId: benId });
    await expect(ben.mutation(api.world.travel, { to: "home", invite: card.id })).rejects.toThrow(/run out/);
  });

  test(`a home holds ${HOME_CAP}`, async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    const { room } = await memberOf(t, ANNA);
    await t.run((ctx) => ctx.db.patch("worldRooms", room!._id, { memberCount: HOME_CAP }));
    const ben = asUser(t, BEN);
    await ben.mutation(api.world.join, {});
    const id = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: BEN, at: Date.now(), expiresAt: Date.now() + INVITE_MS }));
    await expect(ben.mutation(api.world.travel, { to: "home", invite: id })).rejects.toThrow(/full/);
  });

  test("an invite for someone else, or a made-up one, doesn't open the home on join", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    const caras = await t.run((ctx) => ctx.db.insert("worldInvites", { owner: ANNA, ownerName: "Anna", guest: CARA, at: Date.now(), expiresAt: Date.now() + INVITE_MS }));
    await asUser(t, BEN).mutation(api.world.join, { invite: caras });
    expect((await memberOf(t, BEN)).room?.owner).toBeUndefined();
    await asUser(t, BEN).mutation(api.world.leave, {});
    later(60_000);
    await asUser(t, BEN).mutation(api.world.join, { invite: "not-an-id" });
    expect((await memberOf(t, BEN)).room?.owner).toBeUndefined();
  });

  test("a guest's poke from someone else's home doesn't let the poked person in", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    const ben = asUser(t, BEN);
    const { memberId: benId } = await ben.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await asUser(t, ANNA).mutation(api.world.invite, { memberId: benId });
    const [card] = await ben.query(api.world.invites, {});
    await ben.mutation(api.world.travel, { to: "home", invite: card.id });
    later(10_000);
    await ben.mutation(api.world.pokeStaff, { profileId: await staffProfile(t, CARA) });
    const [poke] = await t.run((ctx) => ctx.db.query("worldPokes").collect());
    expect(poke).toMatchObject({ place: "home", owner: ANNA });
    await asUser(t, CARA).mutation(api.world.join, { poke: poke._id });
    expect((await memberOf(t, CARA)).room?.owner).toBeUndefined();
  });

  test("going from one home to another never leaves you standing in their furniture", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const { memberId: benId } = await asUser(t, BEN).mutation(api.world.join, {});
    await goTo(t, BEN, "home");
    await asUser(t, BEN).mutation(api.world.move, { toX: 0, toZ: -4 });
    later(30_000);
    await t.run((ctx) =>
      ctx.db.insert("worldHomes", { owner: ANNA, wallpaper: "plain", items: [{ key: "t", item: "table", x: 0, z: -4, turn: 0 }], bucket: { tokens: 1, at: 0 } })
    );
    await goTo(t, ANNA, "home");
    await anna.mutation(api.world.move, { toX: 3, toZ: 3 });
    later(30_000);
    await anna.mutation(api.world.invite, { memberId: benId });
    const [card] = await asUser(t, BEN).query(api.world.invites, {});
    await asUser(t, BEN).mutation(api.world.travel, { to: "home", invite: card.id });
    const ben = await memberOf(t, BEN);
    expect(ben.room?.owner).toBe(ANNA);
    const at = posAt(ben.state!, Date.now());
    const { hw, hd } = footprint("table", 0);
    expect(Math.abs(at.x) < hw && Math.abs(at.z + 4) < hd).toBe(false);
  });

  test("what's said at home stays in that home", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    await anna.mutation(api.world.join, {});
    const { roomId } = await ben.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await anna.mutation(api.world.say, { text: "just us" });
    const lines = await ben.query(api.world.chatLog, { roomId });
    expect(lines?.some((line) => line.text === "just us")).toBe(false);
  });

  test("homes don't show in the places list, but someone at their own home shows in the online list as at home", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    await asUser(t, BEN).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    expect(await asUser(t, BEN).query(api.world.elsewhere, {})).toMatchObject([{ place: "home", count: 1, names: ["anna"] }]);
    expect(await asUser(t, BEN).query(api.world.places, {})).toEqual(expect.not.objectContaining({ home: expect.anything() }));
    expect(await asUser(t, BEN).query(api.world.places, {})).toMatchObject({ garden: 1 });
  });

  test("the backyard counts as at home too, a guest in someone else's home isn't listed there, and a block hides them", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    const { memberId: benId } = await asUser(t, BEN).mutation(api.world.join, {});
    await asUser(t, CARA).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await goTo(t, ANNA, "backyard");
    expect(await asUser(t, CARA).query(api.world.elsewhere, {})).toMatchObject([{ place: "home", count: 1, names: ["anna"] }]);
    await goTo(t, ANNA, "home");
    await asUser(t, ANNA).mutation(api.world.invite, { memberId: benId });
    const [card] = await asUser(t, BEN).query(api.world.invites, {});
    await asUser(t, BEN).mutation(api.world.travel, { to: "home", invite: card.id });
    expect(await asUser(t, CARA).query(api.world.elsewhere, {})).toEqual([expect.objectContaining({ place: "home", count: 1, names: ["anna"] })]);
    const annaId = (await memberOf(t, ANNA)).member!._id;
    await asUser(t, CARA).mutation(api.world.block, { memberId: annaId });
    expect(await asUser(t, CARA).query(api.world.elsewhere, {})).toEqual([]);
  });
});

describe("a poke brings them to you", () => {
  const pokeBen = async (t: T) => {
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await goTo(t, ANNA, "beach");
    await anna.mutation(api.world.move, { toX: 2, toZ: 1 });
    later(10_000);
    const profileId = await staffProfile(t, BEN);
    expect(await anna.mutation(api.world.pokeStaff, { profileId })).toEqual({ ok: true });
    const [note] = await t.run((ctx) => ctx.db.query("notifications").collect());
    const poke = new URL(note.url!, "https://x").searchParams.get("poke")!;
    return { anna, poke };
  };

  test("the poke keeps the place and spot the server knew", async () => {
    const t = newConvex();
    await pokeBen(t);
    const [row] = await t.run((ctx) => ctx.db.query("worldPokes").collect());
    expect(row).toMatchObject({ from: ANNA, to: BEN, place: "beach", x: 2, z: 1 });
  });

  test("they arrive beside you, where you are now", async () => {
    const t = newConvex();
    const { anna, poke } = await pokeBen(t);
    await goTo(t, ANNA, "garden");
    await goTo(t, ANNA, "library");
    await asUser(t, BEN).mutation(api.world.join, { poke });
    const ben = await memberOf(t, BEN);
    const annaNow = await memberOf(t, ANNA);
    expect(ben.member?.place).toBe("library");
    expect(ben.member?.roomId).toBe(annaNow.member?.roomId);
    expect(distance(posAt(ben.state!, Date.now()), posAt(annaNow.state!, Date.now()))).toBeLessThan(2);
    void anna;
  });

  test("they arrive in your room of the place, even when another has space", async () => {
    const t = newConvex();
    const full = await t.run((ctx) => ctx.db.insert("worldRooms", { place: "beach", instance: 1, memberCount: ROOM_CAP }));
    const { poke } = await pokeBen(t);
    await t.run((ctx) => ctx.db.patch("worldRooms", full, { memberCount: 1 }));
    await asUser(t, BEN).mutation(api.world.join, { poke });
    expect((await memberOf(t, BEN)).member?.roomId).toBe((await memberOf(t, ANNA)).member?.roomId);
  });

  test("someone already in the garden on another phone is brought over too", async () => {
    const t = newConvex();
    const { poke } = await pokeBen(t);
    await asUser(t, BEN).mutation(api.world.join, {});
    await asUser(t, BEN).mutation(api.world.join, { poke });
    const ben = await memberOf(t, BEN);
    const anna = await memberOf(t, ANNA);
    expect(ben.member).toMatchObject({ place: "beach", roomId: anna.member?.roomId, visits: 2 });
    expect(distance(posAt(ben.state!, Date.now()), posAt(anna.state!, Date.now()))).toBeLessThan(2);
    expect(await t.run((ctx) => ctx.db.query("worldRooms").withIndex("by_place_and_instance", (q) => q.eq("place", "garden")).collect())).toEqual([]);
  });

  test("a poke opened on a second phone, already in the poker's full room, keeps the room and moves beside them", async () => {
    const t = newConvex();
    const { poke } = await pokeBen(t);
    const annaNow = await memberOf(t, ANNA);
    await t.run((ctx) => ctx.db.patch("worldRooms", annaNow.room!._id, { memberCount: ROOM_CAP - 1 }));
    await asUser(t, BEN).mutation(api.world.join, {});
    await asUser(t, BEN).mutation(api.world.travel, { to: "beach" });
    later(5000);
    await asUser(t, BEN).mutation(api.world.move, { toX: -4, toZ: 4 });
    later(30_000);
    expect((await memberOf(t, ANNA)).room?.memberCount).toBe(ROOM_CAP);
    await asUser(t, BEN).mutation(api.world.join, { poke });
    const ben = await memberOf(t, BEN);
    const anna = await memberOf(t, ANNA);
    expect(ben.member?.roomId).toBe(anna.member?.roomId);
    const apart = distance(posAt(ben.state!, Date.now()), posAt(anna.state!, Date.now()));
    expect(apart).toBeGreaterThanOrEqual(ARRIVE_APART);
    expect(apart).toBeLessThan(2.5);
  });

  test("an invited guest lands beside the host, not on top of them", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await anna.mutation(api.world.inviteStaff, { profileId: await staffProfile(t, BEN) });
    const [note] = await t.run((ctx) => ctx.db.query("notifications").collect());
    const invite = new URL(note.url!, "https://x").searchParams.get("invite")!;
    await asUser(t, BEN).mutation(api.world.join, { invite });
    const host = await memberOf(t, ANNA);
    const guest = await memberOf(t, BEN);
    expect(guest.room?._id).toBe(host.room?._id);
    expect(distance(posAt(guest.state!, Date.now()), posAt(host.state!, Date.now()))).toBeGreaterThanOrEqual(ARRIVE_APART);
  });

  test("an invite brings someone already in the garden into the home", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await anna.mutation(api.world.inviteStaff, { profileId: await staffProfile(t, BEN) });
    const [note] = await t.run((ctx) => ctx.db.query("notifications").collect());
    const invite = new URL(note.url!, "https://x").searchParams.get("invite")!;
    await asUser(t, BEN).mutation(api.world.join, {});
    await asUser(t, BEN).mutation(api.world.join, { invite });
    expect((await memberOf(t, BEN)).room?.owner).toBe(ANNA);
  });

  test("they arrive where you poked from once you've gone", async () => {
    const t = newConvex();
    const { anna, poke } = await pokeBen(t);
    await anna.mutation(api.world.leave, {});
    await asUser(t, BEN).mutation(api.world.join, { poke });
    const ben = await memberOf(t, BEN);
    expect(ben.member?.place).toBe("beach");
    expect(distance(posAt(ben.state!, Date.now()), { x: 2, z: 1 })).toBeLessThan(2);
  });

  test("someone else's poke, an old one or a made-up one lands as usual", async () => {
    const t = newConvex();
    const { poke } = await pokeBen(t);
    await asUser(t, CARA).mutation(api.world.join, { poke });
    expect((await memberOf(t, CARA)).member?.place).toBeUndefined();
    await asUser(t, BEN).mutation(api.world.join, { poke: "not-an-id" });
    expect((await memberOf(t, BEN)).member?.place).toBeUndefined();
    await asUser(t, BEN).mutation(api.world.leave, {});
    later(POKE_ARRIVAL_MS + 1);
    await asUser(t, BEN).mutation(api.world.join, { poke });
    expect((await memberOf(t, BEN)).member?.place).toBeUndefined();
  });

  test("a poke from your home brings them into it", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    const profileId = await staffProfile(t, BEN);
    await anna.mutation(api.world.pokeStaff, { profileId });
    const [row] = await t.run((ctx) => ctx.db.query("worldPokes").collect());
    await asUser(t, BEN).mutation(api.world.join, { poke: row._id });
    expect((await memberOf(t, BEN)).room?.owner).toBe(ANNA);
  });

  test("an offline invite shares the poke limit and opens their home", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const ben = await staffProfile(t, BEN);
    const cara = await staffProfile(t, CARA);
    expect(await anna.mutation(api.world.inviteStaff, { profileId: ben })).toEqual({ ok: true });
    expect(await anna.mutation(api.world.pokeStaff, { profileId: cara })).toMatchObject({ ok: false, retryInMs: POKE_EVERY_MS });
    const [note] = await t.run((ctx) => ctx.db.query("notifications").collect());
    const invite = new URL(note.url!, "https://x").searchParams.get("invite")!;
    await asUser(t, BEN).mutation(api.world.join, { invite });
    expect((await memberOf(t, BEN)).room?.owner).toBe(ANNA);
  });
});

describe("leaving for good", () => {
  test("deleting an account sends guests in that home back to the garden and removes the room", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const { memberId: benId } = await asUser(t, BEN).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await anna.mutation(api.world.invite, { memberId: benId });
    const [card] = await asUser(t, BEN).query(api.world.invites, {});
    await asUser(t, BEN).mutation(api.world.travel, { to: "home", invite: card.id });
    const homeId = (await memberOf(t, BEN)).room!._id;
    await t.run((ctx) => removeFromWorld(ctx, ANNA));
    const ben = await memberOf(t, BEN);
    expect(ben.member?.place).toBe("garden");
    expect(ben.room).toMatchObject({ place: "garden", memberCount: 1 });
    expect(await t.run((ctx) => ctx.db.get("worldRooms", homeId))).toBeNull();
    expect(await asUser(t, BEN).query(api.worldHome.home, { roomId: homeId })).toBeNull();
  });

  test("the home query is empty once signed out", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    const { room } = await memberOf(t, ANNA);
    expect(await t.query(api.worldHome.home, { roomId: room!._id })).toBeNull();
  });
});

describe("decorating", () => {
  const atHome = async (t: T, coins = 500) => {
    await give(t, ANNA, coins);
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await goTo(t, ANNA, "cafe");
    return anna;
  };

  test("buying spends coins on the server and adds to what you own", async () => {
    const t = newConvex();
    const anna = await atHome(t, 120);
    expect(await anna.mutation(api.worldHome.buy, { item: "sofa" })).toEqual({ balance: 10 });
    await expect(anna.mutation(api.worldHome.buy, { item: "table" })).rejects.toThrow(/30 more coins/);
    expect(await anna.query(api.coins.mine, {})).toMatchObject({ balance: 10, items: { sofa: 1 } });
    await expect(anna.mutation(api.worldHome.buy, { item: "nonsense" })).rejects.toThrow(/doesn't sell/);
  });

  test("you can only shop in the Café", async () => {
    const t = newConvex();
    await give(t, ANNA, 100);
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await expect(anna.mutation(api.worldHome.buy, { item: "rug" })).rejects.toThrow(new RegExp(NPC.name));
  });

  test(`a new player can spend the ${START_COINS} they start with`, async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await goTo(t, ANNA, "cafe");
    expect(await anna.mutation(api.worldHome.buy, { item: "table" })).toEqual({ balance: START_COINS - FURNITURE.table.price });
  });

  test("places, moves, turns and puts away, one write each, seen by visitors", async () => {
    const t = newConvex();
    const anna = await atHome(t);
    await anna.mutation(api.worldHome.buy, { item: "sofa" });
    await anna.mutation(api.worldHome.buy, { item: "mint" });
    await goTo(t, ANNA, "home");
    await anna.mutation(api.worldHome.placeItem, { item: "sofa", x: 0, z: -6, turn: 0 });
    await expect(anna.mutation(api.worldHome.placeItem, { item: "sofa", x: 1, z: -2, turn: 0 })).rejects.toThrow(/Buy one/);
    const ben = asUser(t, BEN);
    const { memberId: benId } = await ben.mutation(api.world.join, {});
    await anna.mutation(api.world.invite, { memberId: benId });
    const [card] = await ben.query(api.world.invites, {});
    const { roomId } = (await ben.mutation(api.world.travel, { to: "home", invite: card.id })) as { roomId: Id<"worldRooms"> };
    const seen = await ben.query(api.worldHome.home, { roomId });
    expect(seen).toMatchObject({ mine: false, wallpaper: "plain", items: [{ item: "sofa", x: 0, z: -6, turn: 0 }] });
    const key = seen!.items[0].key;
    await anna.mutation(api.worldHome.moveItem, { key, x: 1, z: -4, turn: 1 });
    await anna.mutation(api.worldHome.setWallpaper, { wallpaper: "mint" });
    expect(await ben.query(api.worldHome.home, { roomId })).toMatchObject({ wallpaper: "mint", items: [{ key, x: 1, z: -4, turn: 1 }] });
    await expect(ben.mutation(api.worldHome.removeItem, { key })).rejects.toThrow(/own home/);
    await anna.mutation(api.worldHome.removeItem, { key });
    expect((await ben.query(api.worldHome.home, { roomId }))?.items).toEqual([]);
  });

  test("keeps furniture inside the room and out of the doorway", async () => {
    const t = newConvex();
    const anna = await atHome(t);
    await anna.mutation(api.worldHome.buy, { item: "bed" });
    await goTo(t, ANNA, "home");
    await expect(anna.mutation(api.worldHome.moveItem, { key: "nope", x: 0, z: 0, turn: 0 })).rejects.toThrow(/put away/);
    await anna.mutation(api.worldHome.placeItem, { item: "bed", x: 30, z: 30, turn: 0 });
    const { member } = await memberOf(t, ANNA);
    const home = await anna.query(api.worldHome.home, { roomId: member!.roomId });
    const [bed] = home!.items;
    expect(placementProblem("bed", bed.x, bed.z, 0)).toBeNull();
    await expect(anna.mutation(api.worldHome.moveItem, { key: bed.key, x: WALK_BOUNDS.maxX, z: 0, turn: 0 })).rejects.toThrow(/inside the room/);
    await expect(anna.mutation(api.worldHome.moveItem, { key: bed.key, x: HOME_DOOR.x, z: HOME_DOOR.z - DOOR_CLEAR, turn: 1 })).rejects.toThrow(/doorway/);
    await expect(anna.mutation(api.worldHome.moveItem, { key: bed.key, x: BACK_DOOR.x, z: BACK_DOOR.z + 1, turn: 0 })).rejects.toThrow(/back door clear/);
    await expect(anna.mutation(api.worldHome.moveItem, { key: bed.key, x: 0, z: -4, turn: 5 })).rejects.toThrow();
  });

  test("you walk round solid furniture at home", async () => {
    const t = newConvex();
    const anna = await atHome(t);
    await anna.mutation(api.worldHome.buy, { item: "table" });
    await goTo(t, ANNA, "home");
    await anna.mutation(api.worldHome.placeItem, { item: "table", x: 0, z: -4, turn: 0 });
    const walk = await anna.mutation(api.world.move, { toX: 0, toZ: -4 });
    expect(walk.ok && distance({ x: walk.toX, z: walk.toZ }, { x: 0, z: -4 })).toBeGreaterThan(0.5);
  });

  test("a wallpaper before any furniture makes the home in one write, and the same one again writes nothing", async () => {
    const t = newConvex();
    const anna = await atHome(t);
    await anna.mutation(api.worldHome.buy, { item: "rose" });
    await expect(anna.mutation(api.worldHome.buy, { item: "rose" })).rejects.toThrow(/already have/);
    await expect(anna.mutation(api.worldHome.setWallpaper, { wallpaper: "rose" })).rejects.toThrow(/own home/);
    await goTo(t, ANNA, "home");
    await expect(anna.mutation(api.worldHome.setWallpaper, { wallpaper: "stars" })).rejects.toThrow(/Buy it/);
    await expect(anna.mutation(api.worldHome.setWallpaper, { wallpaper: "tartan" })).rejects.toThrow(/isn't one/);
    expect(await anna.mutation(api.worldHome.setWallpaper, { wallpaper: "rose" })).toEqual({ ok: true });
    expect(await anna.mutation(api.worldHome.setWallpaper, { wallpaper: "rose" })).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldHomes").collect())).toMatchObject([{ owner: ANNA, wallpaper: "rose", items: [] }]);
  });

  test("decorating flat out is slowed down, not refused", async () => {
    const t = newConvex();
    const anna = await atHome(t, 1000);
    for (let i = 0; i < 8; i++) await anna.mutation(api.worldHome.buy, { item: "plant" });
    await goTo(t, ANNA, "home");
    const replies = [];
    for (let i = 0; i < 8; i++) replies.push(await anna.mutation(api.worldHome.placeItem, { item: "plant", x: -3 + i * 0.8, z: -6, turn: 0 }));
    expect(replies.filter((r) => r.ok)).toHaveLength(BUCKETS.decorate.burst);
    expect(replies.at(-1)).toMatchObject({ ok: false, retryInMs: expect.any(Number) });
    const { member } = await memberOf(t, ANNA);
    const key = (await anna.query(api.worldHome.home, { roomId: member!.roomId }))!.items[0].key;
    expect(await anna.mutation(api.worldHome.moveItem, { key, x: 0, z: -5, turn: 0 })).toMatchObject({ ok: false });
    expect(await anna.mutation(api.worldHome.removeItem, { key })).toMatchObject({ ok: false });
    expect(await anna.mutation(api.worldHome.removeItem, { key: "gone" })).toEqual({ ok: true });
    later(60_000);
    expect(await anna.mutation(api.worldHome.setWallpaper, { wallpaper: "plain" })).toEqual({ ok: true });
  });

  test("inviting again refreshes the invite instead of adding one", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const { memberId } = await asUser(t, BEN).mutation(api.world.join, {});
    await anna.mutation(api.world.invite, { memberId });
    later(5000);
    await anna.mutation(api.world.invite, { memberId });
    expect(await t.run((ctx) => ctx.db.query("worldInvites").collect())).toMatchObject([{ owner: ANNA, guest: BEN, at: expect.closeTo(Date.now(), -2) }]);
    expect(await anna.mutation(api.world.invite, { memberId: (await memberOf(t, ANNA)).member!._id })).toMatchObject({ ok: false, reason: "That's you." });
  });
});

describe("asking to visit someone's home", () => {
  test("you can ask to visit someone who is home, and letting you in sends an invite", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const { memberId: annaId } = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    expect(await ben.mutation(api.world.knock, { memberId: annaId })).toMatchObject({ ok: false, reason: "They aren't home right now." });

    await goTo(t, ANNA, "home");
    expect(await ben.mutation(api.world.knock, { memberId: annaId })).toMatchObject({ ok: true });
    const knocks = await anna.query(api.world.knocks, {});
    expect(knocks).toHaveLength(1);
    expect(knocks[0]).toMatchObject({ guestName: expect.any(String), at: expect.closeTo(Date.now(), -2), expiresAt: expect.closeTo(Date.now() + KNOCK_MS, -2) });

    // Only the homeowner can answer the request.
    expect(await ben.mutation(api.world.answerKnock, { knockId: knocks[0].id, allow: true })).toMatchObject({ ok: false, reason: "That request has gone." });

    expect(await anna.mutation(api.world.answerKnock, { knockId: knocks[0].id, allow: true })).toMatchObject({ ok: true });
    expect(await anna.query(api.world.knocks, {})).toEqual([]);
    const [card] = await ben.query(api.world.invites, {});
    expect(card).toMatchObject({ ownerName: expect.any(String) });
    expect(await ben.mutation(api.world.travel, { to: "home", invite: card.id })).toMatchObject({ ok: true, place: "home" });
    expect((await memberOf(t, BEN)).room?.owner).toBe(ANNA);
  });

  test("asking works when they are in their backyard, refreshes on repeat, and refuses when you're already there", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const { memberId: annaId } = await anna.mutation(api.world.join, {});
    const { memberId: benId } = await ben.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await goTo(t, ANNA, "backyard");
    expect(await ben.mutation(api.world.knock, { memberId: annaId })).toMatchObject({ ok: true });
    later(5000);
    expect(await ben.mutation(api.world.knock, { memberId: annaId })).toMatchObject({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldKnocks").collect())).toHaveLength(1);
    expect(await ben.mutation(api.world.knock, { memberId: benId })).toMatchObject({ ok: false, reason: "That's you." });

    // Once Ben is in Anna's home (even while Anna is in the backyard), knocking is refused.
    const [knock] = await anna.query(api.world.knocks, {});
    await anna.mutation(api.world.answerKnock, { knockId: knock.id, allow: true });
    const [invite] = await ben.query(api.world.invites, {});
    await ben.mutation(api.world.travel, { to: "home", invite: invite.id });
    expect(await ben.mutation(api.world.knock, { memberId: annaId })).toMatchObject({ ok: false, reason: "You're already at their home." });
  });

  test("declining clears the request without inviting, and expired or blocked requests are rejected and swept", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);
    const { memberId: annaId } = await anna.mutation(api.world.join, {});
    const { memberId: benId } = await ben.mutation(api.world.join, {});
    await cara.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");

    await ben.mutation(api.world.knock, { memberId: annaId });
    const [first] = await anna.query(api.world.knocks, {});
    expect(await anna.mutation(api.world.answerKnock, { knockId: first.id, allow: false })).toMatchObject({ ok: true });
    expect(await anna.query(api.world.knocks, {})).toEqual([]);
    expect(await ben.query(api.world.invites, {})).toEqual([]);

    // Blocked guests are hidden from knocks and refused.
    await ben.mutation(api.world.knock, { memberId: annaId });
    await anna.mutation(api.world.block, { memberId: benId });
    expect(await anna.query(api.world.knocks, {})).toEqual([]);
    expect(await ben.mutation(api.world.knock, { memberId: annaId })).toMatchObject({ ok: false, reason: "They've left the World." });

    // Expired requests are hidden from knocks, can't be allowed, and get cleaned up by sweep.
    await cara.mutation(api.world.knock, { memberId: annaId });
    const [caras] = await anna.query(api.world.knocks, {});
    later(KNOCK_MS + 1);
    expect(await anna.query(api.world.knocks, {})).toEqual([]);
    expect(await anna.mutation(api.world.answerKnock, { knockId: caras.id, allow: true })).toMatchObject({ ok: false, reason: "That request has run out." });
    await t.mutation(internal.world.sweep, {});
    expect(await t.run((ctx) => ctx.db.query("worldKnocks").collect())).toEqual([]);
  });

  test("newer requests from blocked guests don't push out an older request", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const { memberId: annaId } = await anna.mutation(api.world.join, {});
    await asUser(t, BEN).mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await asUser(t, BEN).mutation(api.world.knock, { memberId: annaId });
    for (let i = 0; i < 6; i++) {
      const guest = asUser(t, `guest${i}@sow.org.au`);
      later(1000);
      await guest.mutation(api.world.join, {});
      await guest.mutation(api.world.knock, { memberId: annaId });
      await guest.mutation(api.world.block, { memberId: annaId });
    }
    const knocks = await anna.query(api.world.knocks, {});
    expect(knocks).toHaveLength(1);
    expect(knocks[0].at).toBeLessThan(Date.now() - 5000);
  });

  test("letting in someone who already left reports they left and clears the request", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const { memberId: annaId } = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    await goTo(t, ANNA, "home");
    await ben.mutation(api.world.knock, { memberId: annaId });
    const [knock] = await anna.query(api.world.knocks, {});
    await ben.mutation(api.world.leave, {});
    expect(await anna.mutation(api.world.answerKnock, { knockId: knock.id, allow: true })).toMatchObject({ ok: false, reason: "They've left the World." });
    expect(await anna.query(api.world.knocks, {})).toEqual([]);
  });
});

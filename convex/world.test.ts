import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import { currentStaffYear } from "./model";
import { removeFromWorld } from "./world";
import { BALL_HOME, KICK_GAP_MS, KICK_SPEED } from "../shared/ball";
import {
  ASK_MS,
  BUCKETS,
  CHAT_LOG_SIZE,
  CHAT_ROOM_CAP,
  CHAT_TTL_MS,
  DUEL_AGAIN_MS,
  DUEL_FIRST_MS,
  DUEL_PICK_CHANGES,
  DUEL_REVEAL_MS,
  arrivalSpot,
  ELSEWHERE_NAMES,
  SEATS,
  PLACE_OBSTACLES,
  clampTarget,
  INTERACT_RADIUS,
  MAX_BLOCKS,
  MAX_POKE_LENGTH,
  OFFLINE_LIST_SIZE,
  POKE_EVERY_MS,
  POKED_GAP_MS,
  REPORT_CONTEXT_LINES,
  THROTTLE_KEEP_MS,
  PRESENCE_TOUCH_MS,
  PRESENCE_TTL_MS,
  REPORTS_PER_WINDOW,
  ROOM_CAP,
  spawnFor,
  SWEEP_EVERY_MS,
  TYPING_REFRESH_MS,
  PING_PUBLISH_MS,
  WALK_SPEED,
  LOOK_SIZES,
  lookFor,
  withHeight,
} from "../shared/world";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";

// The clock moves only when a test moves it, so times compare exactly.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
// convex-test keeps its clock moving forward by a millisecond or so.
const near = (ms: number) => expect.closeTo(ms, -2);

const rows = (t: T) =>
  t.run(async (ctx) => ({
    rooms: await ctx.db.query("worldRooms").collect(),
    members: await ctx.db.query("worldMembers").collect(),
    states: await ctx.db.query("worldState").collect(),
    presence: await ctx.db.query("worldPresence").collect(),
    chat: await ctx.db.query("worldChat").collect(),
    meta: await ctx.db.query("worldMeta").collect(),
  }));

const said = <L extends { kind?: string }>(lines: L[]) => lines.filter((line) => line.kind === undefined);

const lastSeenOf = (t: T, memberId: Id<"worldMembers">) =>
  t.run(async (ctx) => {
    const row = await ctx.db
      .query("worldPresence")
      .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
      .unique();
    return row?.lastSeen;
  });

describe("join and leave", () => {
  test("only a signed-in person can come in", async () => {
    const t = newConvex();
    await expect(t.mutation(api.world.join, {})).rejects.toThrow(/signed in/);
  });

  test("joining makes a room, a member, a state and a presence mark, and starts the sweeper", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const joined = await anna.mutation(api.world.join, {});
    expect(joined).toMatchObject({ instance: 1, serverNow: near(PINNED_NOW)});
    const all = await rows(t);
    expect(all.rooms).toMatchObject([{ place: "garden", instance: 1, memberCount: 1 }]);
    expect(all.members).toMatchObject([{ email: ANNA, name: "anna" }]);
    const spawn = spawnFor(ANNA);
    expect(all.states).toMatchObject([{ fromX: spawn.x, toX: spawn.x, fromZ: spawn.z, startedAt: near(PINNED_NOW)}]);
    expect(all.presence).toMatchObject([{ lastSeen: near(PINNED_NOW)}]);
    expect(all.meta).toMatchObject([{ key: "sweeper", sweepAt: near(PINNED_NOW + SWEEP_EVERY_MS)}]);

    // Again (another tab): the same place, nothing new.
    later(1000);
    expect(await anna.mutation(api.world.join, {})).toMatchObject({ memberId: joined.memberId, roomId: joined.roomId });
    expect((await rows(t)).members).toHaveLength(1);
  });

  test("names come from the user record when there's no profile", async () => {
    const t = newConvex();
    await t.run((ctx) => ctx.db.insert("users", { email: BEN, name: " Ben Ng " }));
    await asUser(t, BEN).mutation(api.world.join, {});
    expect((await rows(t)).members).toMatchObject([{ name: "Ben Ng" }]);
  });

  test("a full room opens the next instance, and an empty one goes", async () => {
    const t = newConvex();
    for (let i = 0; i < ROOM_CAP; i++) await asUser(t, `p${i}@sow.org.au`).mutation(api.world.join, {});
    const extra = await asUser(t, CARA).mutation(api.world.join, {});
    expect(extra.instance).toBe(2);
    await asUser(t, CARA).mutation(api.world.leave, {});
    const all = await rows(t);
    expect(all.rooms.map((r) => [r.instance, r.memberCount])).toEqual([[1, ROOM_CAP]]);
    await asUser(t, "p0@sow.org.au").mutation(api.world.leave, {});
    expect((await rows(t)).rooms[0].memberCount).toBe(ROOM_CAP - 1);
    // Leaving twice is harmless.
    await asUser(t, CARA).mutation(api.world.leave, {});
  });

  test("a new room takes the lowest free instance number", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      await ctx.db.insert("worldRooms", { place: "garden", instance: 2, memberCount: ROOM_CAP });
    });
    expect((await asUser(t, ANNA).mutation(api.world.join, {})).instance).toBe(1);
  });

  test("a half-removed member joins afresh", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const first = await anna.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      const state = (await ctx.db.query("worldState").first())!;
      await ctx.db.delete("worldState", state._id);
    });
    const second = await anna.mutation(api.world.join, {});
    expect(second.memberId).not.toBe(first.memberId);

    await t.run((ctx) => ctx.db.delete("worldRooms", second.roomId));
    const third = await anna.mutation(api.world.join, {});
    expect(third.memberId).not.toBe(second.memberId);
    const all = await rows(t);
    expect(all.members).toHaveLength(1);
    expect(all.states).toHaveLength(1);
  });
});

describe("move", () => {
  test("someone not in the garden can't move", async () => {
    const t = newConvex();
    await expect(asUser(t, ANNA).mutation(api.world.move, { toX: 0, toZ: 0 })).rejects.toThrow(/left the garden/);
  });

  test("walks from where the server says you are, to a spot in the courtyard", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const spawn = spawnFor(ANNA);
    const first = await anna.mutation(api.world.move, { toX: spawn.x, toZ: spawn.z - 2.8 });
    expect(first).toMatchObject({ ok: true, fromX: spawn.x, fromZ: spawn.z, startedAt: near(PINNED_NOW)});
    later((1.4 / WALK_SPEED) * 1000); // 1.4 units along
    const second = await anna.mutation(api.world.move, { toX: 99, toZ: 0 });
    if (!second.ok) throw new Error("turned away");
    expect(second.fromZ).toBeCloseTo(spawn.z - 1.4);
    expect([second.toX, second.toZ]).toEqual([clampTarget(99, 0).x, 0]);
  });

  test("the rate limit turns taps away without writing, and says when to retry", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const { memberId } = await anna.mutation(api.world.join, {});
    for (let i = 0; i < BUCKETS.move.burst; i++) {
      expect((await anna.mutation(api.world.move, { toX: i, toZ: 0 })).ok).toBe(true);
    }
    const before = (await rows(t)).states[0];
    const refused = await anna.mutation(api.world.move, { toX: -1, toZ: 0 });
    expect(refused).toEqual({ ok: false, retryInMs: near(BUCKETS.move.refillMs), serverNow: near(PINNED_NOW)});
    expect((await rows(t)).states[0]).toEqual(before);
    // Presence is marked at most once every PRESENCE_TOUCH_MS.
    expect(await lastSeenOf(t, memberId)).toEqual(near(PINNED_NOW));
    later(PRESENCE_TOUCH_MS);
    await anna.mutation(api.world.move, { toX: 1, toZ: 1 });
    expect(await lastSeenOf(t, memberId)).toEqual(near(PINNED_NOW + PRESENCE_TOUCH_MS));
  });
});

describe("act and say", () => {
  test("an emote shows over your head, within its rate limit", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await expect(anna.mutation(api.world.act, { emote: "poop" })).rejects.toThrow(/choices/);
    for (let i = 0; i < BUCKETS.act.burst; i++) {
      expect((await anna.mutation(api.world.act, { emote: "wave" })).ok).toBe(true);
    }
    expect(await anna.mutation(api.world.act, { emote: "love" })).toMatchObject({ ok: false });
    expect((await rows(t)).states[0].act).toEqual({ emote: "wave", at: near(PINNED_NOW)});
  });

  test("a line becomes the bubble and a chat row; a double tap sends it once", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await expect(anna.mutation(api.world.say, { text: "  " })).rejects.toThrow(/Write something/);
    await anna.mutation(api.world.say, { text: " Lunch\nafter service? " });
    await anna.mutation(api.world.say, { text: "Lunch after service?" });
    const all = await rows(t);
    expect(all.states[0].say).toEqual({ text: "Lunch after service?", at: near(PINNED_NOW)});
    expect(said(all.chat)).toMatchObject([{ email: ANNA, name: "anna", text: "Lunch after service?" }]);
    await anna.mutation(api.world.say, { text: "two" });
    await anna.mutation(api.world.say, { text: "three" });
    expect(await anna.mutation(api.world.say, { text: "four" })).toMatchObject({ ok: false });
    expect(said((await rows(t)).chat)).toHaveLength(3);
  });

  test("a heartbeat marks you present, or says you've been swept", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.world.heartbeat, {})).toEqual({ present: false, serverNow: near(PINNED_NOW)});
    const { memberId } = await anna.mutation(api.world.join, {});
    later(PRESENCE_TOUCH_MS - 1);
    expect(await anna.mutation(api.world.heartbeat, {})).toMatchObject({ present: true });
    expect(await lastSeenOf(t, memberId)).toEqual(near(PINNED_NOW));
    later(1);
    await anna.mutation(api.world.heartbeat, {});
    expect(await lastSeenOf(t, memberId)).toEqual(near(PINNED_NOW + PRESENCE_TOUCH_MS));
    // A presence mark the sweeper half-removed comes back.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("worldPresence").first())!;
      await ctx.db.delete("worldPresence", row._id);
    });
    await anna.mutation(api.world.heartbeat, {});
    expect(await lastSeenOf(t, memberId)).toEqual(near(Date.now()));
  });
});

/** Stands a member still at (x, z). */
const standAt = (t: T, memberId: Id<"worldMembers">, x: number, z: number) =>
  t.run(async (ctx) => {
    const row = (await ctx.db
      .query("worldState")
      .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
      .unique())!;
    await ctx.db.patch("worldState", row._id, { fromX: x, fromZ: z, toX: x, toZ: z, startedAt: 0 });
  });

const stateRow = (t: T, memberId: Id<"worldMembers">) =>
  t.run((ctx) =>
    ctx.db
      .query("worldState")
      .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
      .unique()
  );

describe("places", () => {
  const two = async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    return { t, anna, ben, a, b };
  };

  test("everyone starts in the garden", async () => {
    const { anna, a } = await two();
    expect(a.place).toBe("garden");
    expect(await anna.query(api.world.roster, { roomId: a.roomId })).toMatchObject({ place: "garden" });
    expect(await anna.query(api.world.places, {})).toEqual({ garden: 2, chapel: 0, campfire: 0, cafe: 0, beach: 0 });
  });

  test("travelling moves you to a room of that place, beside the way back", async () => {
    const { t, anna, ben, a, b } = await two();
    await standAt(t, a.memberId, 0, 0);
    await standAt(t, b.memberId, 1, 0);
    await ben.mutation(api.world.ask, { to: a.memberId, kind: "highFive" });
    await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" });
    await anna.mutation(api.world.say, { text: "Only for the Garden" });
    later(1000);
    const moved = await anna.mutation(api.world.travel, { to: "chapel" });
    const spot = arrivalSpot("garden", "chapel");
    expect(moved).toMatchObject({ ok: true, place: "chapel", instance: 1, toX: spot.x, toZ: spot.z, fromX: spot.x, fromZ: spot.z });
    if (!moved.ok) throw new Error("travel refused");
    expect(moved.roomId).not.toBe(a.roomId);
    expect(await anna.query(api.world.roster, { roomId: a.roomId })).toBeNull();
    const there = await anna.query(api.world.roster, { roomId: moved.roomId });
    expect(there).toMatchObject({ place: "chapel", members: [{ memberId: a.memberId, isMe: true }] });
    expect((await stateRow(t, a.memberId))!.ask).toBeUndefined();
    expect((await stateRow(t, a.memberId))!.say).toBeUndefined();
    expect(await anna.query(api.world.places, {})).toMatchObject({ garden: 1, chapel: 1 });
    expect((await ben.query(api.world.roster, { roomId: b.roomId }))!.members).toHaveLength(1);
    expect(await ben.query(api.world.state, { memberId: a.memberId })).toBeNull();
  });

  test("going where you already are changes nothing and costs nothing", async () => {
    const { t, anna, a } = await two();
    const before = (await stateRow(t, a.memberId))!;
    expect(await anna.mutation(api.world.travel, { to: "garden" })).toMatchObject({ ok: true, roomId: a.roomId, place: "garden" });
    expect((await stateRow(t, a.memberId))!.actBucket).toEqual(before.actBucket);
    await expect(anna.mutation(api.world.travel, { to: "moon" })).rejects.toThrow(/somewhere you can go/);
  });

  test("the last one out closes the room, and hopping about is rate limited", async () => {
    const { t, anna, ben } = await two();
    await anna.mutation(api.world.travel, { to: "beach" });
    await ben.mutation(api.world.travel, { to: "beach" });
    expect((await rows(t)).rooms.map((room) => room.place)).toEqual(["beach"]);
    expect((await rows(t)).rooms[0].memberCount).toBe(2);
    await anna.mutation(api.world.travel, { to: "garden" });
    await anna.mutation(api.world.travel, { to: "cafe" });
    expect(await anna.mutation(api.world.travel, { to: "garden" })).toMatchObject({ ok: false, retryInMs: expect.any(Number) });
    expect(await anna.query(api.world.places, {})).toMatchObject({ beach: 1, cafe: 1, garden: 0 });
  });

  test("a walk is kept clear of the furniture of the place you're in", async () => {
    const { t, anna, a } = await two();
    const pew = PLACE_OBSTACLES.chapel[0];
    expect(await anna.mutation(api.world.move, { toX: pew.x, toZ: pew.z })).toMatchObject({ ok: true, toX: pew.x, toZ: pew.z });
    await anna.mutation(api.world.travel, { to: "chapel" });
    const walked = await anna.mutation(api.world.move, { toX: pew.x, toZ: pew.z });
    expect(walked).toMatchObject({ ok: true });
    if (!walked.ok) throw new Error("move refused");
    expect({ x: walked.toX, z: walked.toZ }).toEqual(clampTarget(pew.x, pew.z, "chapel"));
    expect({ x: walked.toX, z: walked.toZ }).not.toEqual({ x: pew.x, z: pew.z });
    expect((await stateRow(t, a.memberId))!.toX).toBe(walked.toX);
  });

  test("sitting walks you to a seat of the place you're in, and walking off stands you up", async () => {
    const { t, anna, a } = await two();
    await standAt(t, a.memberId, 0, 0);
    const blanket = SEATS.garden[0];
    const sat = await anna.mutation(api.world.sit, { seat: blanket.id });
    expect(sat).toMatchObject({ ok: true, fromX: 0, fromZ: 0, toX: blanket.x, toZ: blanket.z });
    expect(await anna.query(api.world.state, { memberId: a.memberId })).toMatchObject({ seat: blanket.id });
    await expect(anna.mutation(api.world.sit, { seat: SEATS.chapel[0].id })).rejects.toThrow(/somewhere you can sit/);

    later(60_000);
    await anna.mutation(api.world.move, { toX: 0, toZ: 0 });
    expect((await stateRow(t, a.memberId))!.seat).toBeUndefined();

    await anna.mutation(api.world.sit, { seat: blanket.id });
    await anna.mutation(api.world.travel, { to: "chapel" });
    expect((await stateRow(t, a.memberId))!.seat).toBeUndefined();
    const pew = SEATS.chapel[0];
    expect(await anna.mutation(api.world.sit, { seat: pew.id })).toMatchObject({ ok: true, toX: pew.x, toZ: pew.z });
  });

  test("sitting shares the walking rate limit", async () => {
    const { anna } = await two();
    const blanket = SEATS.garden[0];
    for (let i = 0; i < BUCKETS.move.burst; i++) await anna.mutation(api.world.sit, { seat: blanket.id });
    expect(await anna.mutation(api.world.sit, { seat: blanket.id })).toMatchObject({ ok: false, retryInMs: expect.any(Number) });
  });

  test("the people list can show who is in the other places", async () => {
    const { t, anna, ben } = await two();
    const cara = asUser(t, CARA);
    await cara.mutation(api.world.join, {});
    expect(await anna.query(api.world.elsewhere, {})).toEqual([]);
    await ben.mutation(api.world.travel, { to: "chapel" });
    await cara.mutation(api.world.travel, { to: "chapel" });
    expect(await anna.query(api.world.elsewhere, {})).toMatchObject([
      { place: "chapel", count: 2, names: [expect.any(String), expect.any(String)], people: [{ look: expect.any(Object) }, { look: expect.any(Object) }] },
    ]);
    expect(await ben.query(api.world.elsewhere, {})).toMatchObject([{ place: "garden", count: 1, names: [expect.any(String)], people: [{ name: expect.any(String), memberId: expect.any(String) }] }]);

    await t.run(async (ctx) => {
      await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "Ben" });
      await ctx.db.insert("worldBlocks", { email: CARA, blockedEmail: ANNA, blockedName: "Anna" });
    });
    expect(await anna.query(api.world.elsewhere, {})).toEqual([]);

    await t.run(async (ctx) => {
      const room = (await ctx.db.query("worldRooms").collect()).find((r) => r.place === "chapel")!;
      for (let i = 0; i < ELSEWHERE_NAMES + 3; i++) {
        await ctx.db.insert("worldMembers", { roomId: room._id, email: `guest${i}@sow.org.au`, name: `Guest ${i}`, look: { skin: 0, hair: 0, hairColour: 0, shirt: 0 }, joinedAt: 0 });
      }
    });
    const [chapel] = await anna.query(api.world.elsewhere, {});
    expect(chapel.count).toBe(ELSEWHERE_NAMES + 3);
    expect(chapel.names).toHaveLength(ELSEWHERE_NAMES);
    expect(chapel.people).toHaveLength(ELSEWHERE_NAMES);
  });

  test("the chat log is shared by every place, and shows lines from before you joined", async () => {
    const { t, anna, ben, a } = await two();
    await ben.mutation(api.world.travel, { to: "chapel" });
    later(1000);
    await ben.mutation(api.world.say, { text: "Anyone in the Chapel?" });
    await anna.mutation(api.world.say, { text: "Garden here" });
    expect(said((await anna.query(api.world.chatLog, { roomId: a.roomId }))!)).toMatchObject([
      { text: "Garden here", isMe: true, place: "garden", here: true },
      { text: "Anyone in the Chapel?", isMe: false, place: "chapel", here: false },
    ]);
    const cara = asUser(t, CARA);
    const c = await cara.mutation(api.world.join, {});
    expect(said((await cara.query(api.world.chatLog, { roomId: c.roomId }))!).map((line) => line.text)).toEqual(["Garden here", "Anyone in the Chapel?"]);

    await t.run(async (ctx) => {
      await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: "From before places", at: Date.now() });
    });
    expect(said((await anna.query(api.world.chatLog, { roomId: a.roomId }))!)).toMatchObject([{ text: "From before places", here: true }, {}, {}]);
    const chapelRoom = await t.run(async (ctx) => (await ctx.db.query("worldMembers").collect()).find((m) => m.email === BEN)!.roomId);
    expect(said((await ben.query(api.world.chatLog, { roomId: chapelRoom }))!)).toMatchObject([{ text: "From before places", here: false }, {}, {}]);
  });

  test("hides someone who blocked you even when hundreds of others have too", async () => {
    const { t, anna, ben } = await two();
    const cara = asUser(t, CARA);
    await cara.mutation(api.world.join, {});
    await ben.mutation(api.world.travel, { to: "chapel" });
    await cara.mutation(api.world.travel, { to: "chapel" });
    await t.run(async (ctx) => {
      for (let i = 0; i < 200; i++) await ctx.db.insert("worldBlocks", { email: `stranger${i}@sow.org.au`, blockedEmail: ANNA, blockedName: "Anna" });
      await ctx.db.insert("worldBlocks", { email: CARA, blockedEmail: ANNA, blockedName: "Anna" });
    });
    const caraId = await t.run(async (ctx) => (await ctx.db.query("worldMembers").collect()).find((m) => m.email === CARA)!._id);
    const found = await anna.query(api.world.elsewhere, {});
    expect(found).toMatchObject([{ place: "chapel", count: 1, names: [expect.any(String)] }]);
    expect(found[0]!.people.map((p) => p.memberId)).not.toContain(caraId);
  });

  test("following someone lands in their room, even in the same place or with space elsewhere", async () => {
    const { t, anna, ben, a, b } = await two();
    const second = await t.run(async (ctx) => {
      const roomId = await ctx.db.insert("worldRooms", { place: "garden", instance: 2, memberCount: 1 });
      await ctx.db.patch("worldMembers", b.memberId, { roomId });
      await ctx.db.patch("worldRooms", a.roomId, { memberCount: 1 });
      return roomId;
    });
    const same = await anna.mutation(api.world.travel, { to: "garden", toMember: b.memberId });
    expect(same).toMatchObject({ ok: true, roomId: second, place: "garden", instance: 2 });
    later(5000);
    await ben.mutation(api.world.travel, { to: "beach" });
    const beachRooms = await t.run(async (ctx) => {
      const ben2 = (await ctx.db.get("worldMembers", b.memberId))!;
      const other = await ctx.db.insert("worldRooms", { place: "beach", instance: 2, memberCount: 1 });
      const old = (await ctx.db.get("worldRooms", ben2.roomId))!;
      await ctx.db.patch("worldMembers", b.memberId, { roomId: other });
      if (old.memberCount <= 1) await ctx.db.patch("worldRooms", old._id, { memberCount: 0 });
      return { other, old: old._id };
    });
    later(5000);
    const beach = await anna.mutation(api.world.travel, { to: "beach", toMember: b.memberId });
    expect(beach).toMatchObject({ ok: true, roomId: beachRooms.other, place: "beach" });
    expect(await anna.query(api.world.roster, { roomId: beachRooms.other })).toMatchObject({ members: expect.arrayContaining([expect.objectContaining({ memberId: b.memberId })]) });
  });

  test("another tab joins you where you are, and leaving from anywhere tidies up", async () => {
    const { t, anna } = await two();
    const moved = await anna.mutation(api.world.travel, { to: "campfire" });
    if (!moved.ok) throw new Error("travel refused");
    expect(await anna.mutation(api.world.join, {})).toMatchObject({ place: "campfire", roomId: moved.roomId });
    await anna.mutation(api.world.leave, {});
    await anna.mutation(api.world.leave, {});
    expect((await rows(t)).rooms.map((room) => room.place)).toEqual(["garden"]);
  });
});

describe("the offline list and pokes", () => {
  const trio = async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);
    await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    await cara.mutation(api.world.join, {});
    later(60_000);
    await ben.mutation(api.world.leave, {});
    return { t, anna, ben, cara };
  };
  const notes = (t: T, email: string) =>
    t.run((ctx) => ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", email)).collect());
  const pushes = (t: T) => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

  test("lists who has left, newest first, and nobody who's here", async () => {
    const { anna, cara } = await trio();
    const list = await anna.query(api.world.offline, {});
    expect(list.people).toEqual([{ id: expect.any(String), name: expect.any(String), lastSeenAt: near(PINNED_NOW + 60_000) }]);
    expect(list.pokeAgainAt).toBe(0);
    later(1000);
    await cara.mutation(api.world.leave, {});
    expect((await anna.query(api.world.offline, {})).people.map((p) => p.lastSeenAt)).toEqual([near(PINNED_NOW + 61_000), near(PINNED_NOW + 60_000)]);
  });

  test("leaves out people blocked either way, and stops at the list size", async () => {
    const { t, anna, ben } = await trio();
    const benRow = (await anna.query(api.world.offline, {})).people[0];
    await t.run(async (ctx) => {
      await ctx.db.insert("worldBlocks", { email: BEN, blockedEmail: ANNA, blockedName: "Anna" });
      for (let i = 0; i < OFFLINE_LIST_SIZE + 5; i++) {
        await ctx.db.insert("worldVisitors", { email: `past${i}@sow.org.au`, name: `Past ${i}`, lastSeenAt: i });
      }
    });
    const list = await anna.query(api.world.offline, {});
    expect(list.people).toHaveLength(OFFLINE_LIST_SIZE);
    expect(list.people.map((p) => p.id)).not.toContain(benRow.id);
    await expect(anna.mutation(api.world.poke, { visitorId: benRow.id })).rejects.toThrow(/can't be poked/);
    expect((await ben.query(api.world.offline, {})).people.map((p) => p.name)).not.toContain("Anna");
  });

  test("looks past people it has to skip, so a full list still shows, up to a limit", async () => {
    const { t, anna } = await trio();
    await t.run(async (ctx) => {
      for (let i = 0; i < 40; i++) {
        const email = `blocked${i}@sow.org.au`;
        await ctx.db.insert("worldVisitors", { email, name: `Blocked ${i}`, lastSeenAt: PINNED_NOW + 500_000 + i });
        await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: email, blockedName: `Blocked ${i}` });
      }
      for (let i = 0; i < OFFLINE_LIST_SIZE; i++) {
        await ctx.db.insert("worldVisitors", { email: `older${i}@sow.org.au`, name: `Older ${i}`, lastSeenAt: 1000 + i });
      }
    });
    const list = await anna.query(api.world.offline, {});
    expect(list.people).toHaveLength(OFFLINE_LIST_SIZE);
    expect(list.people.some((p) => p.name.startsWith("Blocked"))).toBe(false);
    expect(list.people.some((p) => p.name.startsWith("Older"))).toBe(true);

    await t.run(async (ctx) => {
      for (let i = 0; i < 200; i++) {
        const email = `wall${i}@sow.org.au`;
        await ctx.db.insert("worldVisitors", { email, name: `Wall ${i}`, lastSeenAt: PINNED_NOW + 900_000 + i });
        await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: email, blockedName: `Wall ${i}` });
      }
    });
    expect((await anna.query(api.world.offline, {})).people).toEqual([]);
  });

  test("a poke leaves a notification and a push, with your words or the usual ones", async () => {
    const { t, anna, cara } = await trio();
    const ben = (await anna.query(api.world.offline, {})).people[0];
    expect(await anna.mutation(api.world.poke, { visitorId: ben.id, message: `  come\nplay ${"x".repeat(200)}` })).toEqual({ ok: true });
    const [note] = await notes(t, BEN);
    expect(note).toMatchObject({ title: expect.stringMatching(/poked you$/), url: expect.stringMatching(/^\/world\?poke=/), read: false });
    expect(note.body.startsWith("come play x")).toBe(true);
    expect(Array.from(note.body)).toHaveLength(MAX_POKE_LENGTH);
    expect(await pushes(t)).toEqual(expect.arrayContaining([expect.objectContaining({ name: "push:send" })]));
    expect((await anna.query(api.world.offline, {})).pokeAgainAt).toBeCloseTo(PINNED_NOW + 60_000 + POKE_EVERY_MS, -2);

    later(POKED_GAP_MS + 1);
    expect(await cara.mutation(api.world.poke, { visitorId: ben.id, message: "   " })).toEqual({ ok: true });
    expect((await notes(t, BEN)).map((n) => n.body)).toContain("Come and join me in the Garden.");
  });

  test("one poke an hour for each person, whoever it's to", async () => {
    const { t, anna, cara } = await trio();
    const ben = (await anna.query(api.world.offline, {})).people[0];
    await anna.mutation(api.world.poke, { visitorId: ben.id });
    later(1000);
    await cara.mutation(api.world.leave, {});
    const caraRow = (await anna.query(api.world.offline, {})).people[0];
    expect(await anna.mutation(api.world.poke, { visitorId: caraRow.id })).toEqual({ ok: false, retryInMs: near(POKE_EVERY_MS - 1000) });
    expect(await notes(t, CARA)).toEqual([]);
    later(POKE_EVERY_MS);
    expect(await anna.mutation(api.world.poke, { visitorId: caraRow.id })).toEqual({ ok: true });
  });

  test("nobody is poked twice in a few minutes, or while they're here, and never yourself", async () => {
    const { t, anna, ben, cara } = await trio();
    const benRow = (await anna.query(api.world.offline, {})).people[0];
    await anna.mutation(api.world.poke, { visitorId: benRow.id });
    await expect(cara.mutation(api.world.poke, { visitorId: benRow.id })).rejects.toThrow(/a moment ago/);
    later(POKED_GAP_MS + 1);
    await ben.mutation(api.world.join, {});
    await expect(cara.mutation(api.world.poke, { visitorId: benRow.id })).rejects.toThrow(/already in the garden/);
    const mine = await t.run(async (ctx) => (await ctx.db.query("worldVisitors").collect()).find((row) => row.email === CARA)!._id);
    await expect(cara.mutation(api.world.poke, { visitorId: mine })).rejects.toThrow(/can't be poked/);
  });

  test("someone who was here before visits were kept can still poke", async () => {
    const { t, anna } = await trio();
    const ben = (await anna.query(api.world.offline, {})).people[0];
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("worldVisitors").collect()).find((r) => r.email === ANNA)!;
      await ctx.db.delete("worldVisitors", row._id);
    });
    expect((await anna.query(api.world.offline, {})).pokeAgainAt).toBe(0);
    expect(await anna.mutation(api.world.poke, { visitorId: ben.id })).toEqual({ ok: true });
  });
});

describe("how many are online", () => {
  test("counts everyone in every place, follows them in and out, and is zero signed out", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);
    expect(await anna.query(api.world.onlineCount, {})).toBe(0);
    await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    await cara.mutation(api.world.join, {});
    expect(await anna.query(api.world.onlineCount, {})).toBe(3);
    expect(await t.query(api.world.onlineCount, {})).toBe(0);
    // Travelling doesn't change the count; leaving does.
    await ben.mutation(api.world.travel, { to: "chapel" });
    expect(await cara.query(api.world.onlineCount, {})).toBe(3);
    await cara.mutation(api.world.leave, {});
    expect(await cara.query(api.world.onlineCount, {})).toBe(2);
    // Someone gone silent drops off once the sweep takes them out.
    later(PRESENCE_TTL_MS + SWEEP_EVERY_MS + 1);
    await t.mutation(internal.world.sweep, {});
    expect(await cara.query(api.world.onlineCount, {})).toBe(0);
    expect(await t.query(api.world.onlineCount, {})).toBe(0);
  });
});

describe("everyone on staff who isn't here", () => {
  const year = () => currentStaffYear();
  const staff = (t: T, people: { email: string; name?: string; year?: number }[]) =>
    t.run(async (ctx) => {
      const ids: Id<"staffProfiles">[] = [];
      for (const p of people) ids.push(await ctx.db.insert("staffProfiles", { email: p.email, name: p.name, year: p.year ?? year() }));
      return ids;
    });
  const all = async (who: ReturnType<typeof asUser>, numItems: number) => {
    const found = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 100; pages++) {
      const page: { page: { id: Id<"staffProfiles">; name: string; lastSeenAt: number | null }[]; isDone: boolean; continueCursor: string } =
        await who.query(api.world.offlineStaff, { paginationOpts: { numItems, cursor } });
      found.push(...page.page);
      if (page.isDone) return found;
      cursor = page.continueCursor;
    }
    throw new Error("never finished");
  };

  test("pages through this year's staff by name, leaving out you, anyone here and anyone blocked", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    later(1000);
    await ben.mutation(api.world.leave, {});
    const many = Array.from({ length: 60 }, (_, i) => ({ email: `staff${i}@sow.org.au`, name: `Staff ${String(i).padStart(2, "0")}` }));
    await staff(t, [{ email: ANNA, name: "Anna" }, { email: BEN, name: "Ben" }, { email: CARA, name: "Cara" }, { email: "nameless@sow.org.au" }, { email: "old@sow.org.au", name: "Old", year: year() - 1 }, ...many]);
    await asUser(t, CARA).mutation(api.world.join, {});
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: "staff7@sow.org.au", blockedEmail: ANNA, blockedName: "Anna" }));

    const found = await all(anna, 25);
    const names = found.map((p) => p.name);
    expect(names).toContain("Ben");
    expect(names).toContain("nameless");
    expect(names).not.toContain("Anna");
    expect(names).not.toContain("Cara");
    expect(names).not.toContain("Old");
    expect(names).not.toContain("Staff 07");
    expect(names.filter((n) => n.startsWith("Staff "))).toHaveLength(59);
    // By name, and everyone exactly once.
    expect(new Set(found.map((p) => p.id)).size).toBe(found.length);
    const named = names.filter((n) => n !== "nameless");
    expect(named).toEqual([...named].sort());
    expect(found.find((p) => p.name === "Ben")!.lastSeenAt).toEqual(near(PINNED_NOW + 1000));
    expect(found.find((p) => p.name === "Staff 00")!.lastSeenAt).toBeNull();
  });

  test("a page reads a bounded number of profiles", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await staff(t, Array.from({ length: 70 }, (_, i) => ({ email: `s${i}@sow.org.au`, name: `S${i}` })));
    expect((await anna.query(api.world.offlineStaff, { paginationOpts: { numItems: 500, cursor: null } })).page).toHaveLength(50);
    expect((await anna.query(api.world.offlineStaff, { paginationOpts: { numItems: 0, cursor: null } })).page).toHaveLength(1);
    await expect(t.query(api.world.offlineStaff, { paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(/signed in/);
  });

  test("anyone on staff can be poked, even if they've never been here, within the same limits", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const cara = asUser(t, CARA);
    await anna.mutation(api.world.join, {});
    await cara.mutation(api.world.join, {});
    const [dana, ben] = await staff(t, [{ email: "dana@sow.org.au", name: "Dana Lee" }, { email: BEN, name: "Ben" }]);
    expect(await anna.query(api.world.pokeWait, {})).toEqual({ pokeAgainAt: 0 });

    expect(await anna.mutation(api.world.pokeStaff, { profileId: dana, message: "hi" })).toEqual({ ok: true });
    const notes = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", "dana@sow.org.au")).collect());
    expect(notes).toMatchObject([{ title: "anna poked you", body: "hi", url: expect.stringMatching(/^\/world\?poke=/) }]);
    expect(await t.run((ctx) => ctx.db.query("worldPoked").collect())).toMatchObject([{ email: "dana@sow.org.au", lastPokedAt: near(PINNED_NOW) }]);
    expect((await anna.query(api.world.pokeWait, {})).pokeAgainAt).toEqual(near(PINNED_NOW + POKE_EVERY_MS));
    // One poke an hour each, and nobody poked twice in a few minutes.
    expect(await anna.mutation(api.world.pokeStaff, { profileId: ben })).toEqual({ ok: false, retryInMs: near(POKE_EVERY_MS) });
    await expect(cara.mutation(api.world.pokeStaff, { profileId: dana })).rejects.toThrow(/a moment ago/);
    later(POKED_GAP_MS + 1);
    expect(await cara.mutation(api.world.pokeStaff, { profileId: dana })).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldPoked").collect())).toMatchObject([{ lastPokedAt: near(PINNED_NOW + POKED_GAP_MS + 1) }]);

    // Someone who has been here keeps the gap on their visitor row, for both pokes.
    const benUser = asUser(t, BEN);
    await benUser.mutation(api.world.join, {});
    await expect(cara.mutation(api.world.pokeStaff, { profileId: ben })).rejects.toThrow(/already in the garden/);
    await benUser.mutation(api.world.leave, {});
    later(POKE_EVERY_MS);
    expect(await anna.mutation(api.world.pokeStaff, { profileId: ben })).toEqual({ ok: true });
    const benVisitor = await t.run(async (ctx) => (await ctx.db.query("worldVisitors").collect()).find((r) => r.email === BEN)!);
    expect(benVisitor.lastPokedAt).toEqual(near(Date.now()));
    later(POKE_EVERY_MS);
    await expect(cara.mutation(api.world.poke, { visitorId: benVisitor._id })).resolves.toEqual({ ok: true });
  });

  test("never yourself, nobody blocked, and nobody whose profile has gone", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const [me, blocked, gone] = await staff(t, [{ email: ANNA, name: "Anna" }, { email: BEN, name: "Ben" }, { email: CARA, name: "Cara" }]);
    await t.run(async (ctx) => {
      await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "Ben" });
      await ctx.db.delete("staffProfiles", gone);
    });
    await expect(anna.mutation(api.world.pokeStaff, { profileId: me })).rejects.toThrow(/can't be poked/);
    await expect(anna.mutation(api.world.pokeStaff, { profileId: blocked })).rejects.toThrow(/can't be poked/);
    await expect(anna.mutation(api.world.pokeStaff, { profileId: gone })).rejects.toThrow(/can't be poked/);
    await expect(asUser(t, BEN).mutation(api.world.pokeStaff, { profileId: me })).rejects.toThrow(/left the garden/);
  });
});

describe("at the arcade", () => {
  const pair = async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await standAt(t, a.memberId, 0, 0);
    await standAt(t, b.memberId, 1, 0);
    return { t, anna, ben, a, b };
  };

  test("going to the arcade shows on your row, and you stay in the garden", async () => {
    const { t, anna, ben, b } = await pair();
    expect(await ben.mutation(api.world.away, { at: "arcade" })).toMatchObject({ ok: true });
    expect(await anna.query(api.world.state, { memberId: b.memberId })).toMatchObject({ away: "arcade" });
    expect((await rows(t)).members).toHaveLength(2);
    later(PRESENCE_TOUCH_MS + 1);
    await ben.mutation(api.world.away, { at: "arcade" });
    expect((await stateRow(t, b.memberId))!.actBucket.tokens).toBe(BUCKETS.act.burst - 1);
  });

  test("nobody can high five someone who's playing", async () => {
    const { anna, ben, b } = await pair();
    await ben.mutation(api.world.away, { at: "arcade" });
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ ok: false, reason: /arcade/ });
    expect(await ben.mutation(api.world.away, { at: null })).toMatchObject({ ok: true });
    expect(await anna.query(api.world.state, { memberId: b.memberId })).not.toHaveProperty("away");
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ ok: true });
  });

  test("walking off clears it, and coming back never waits on a rate limit", async () => {
    const { t, ben, b } = await pair();
    await ben.mutation(api.world.away, { at: "arcade" });
    await ben.mutation(api.world.move, { toX: 2, toZ: 0 });
    expect((await stateRow(t, b.memberId))!.away).toBeUndefined();
    for (let i = 1; i < BUCKETS.act.burst; i++) {
      await ben.mutation(api.world.away, { at: "arcade" });
      await ben.mutation(api.world.away, { at: null });
    }
    expect(await ben.mutation(api.world.away, { at: "arcade" })).toMatchObject({ ok: false, retryInMs: expect.any(Number) });
    expect(await ben.mutation(api.world.away, { at: null })).toMatchObject({ ok: true });
  });
});

describe("high fives", () => {
  const pair = async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await standAt(t, a.memberId, 0, 0);
    await standAt(t, b.memberId, 1, 0);
    return { t, anna, ben, a, b };
  };

  test("an ask is one write on the asker's row; an accept is one on the other's", async () => {
    const { t, anna, ben, a, b } = await pair();
    const asked = await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" });
    expect(asked).toMatchObject({ ok: true, at: near(PINNED_NOW) });
    expect((await stateRow(t, a.memberId))!.ask).toEqual({ kind: "highFive", to: b.memberId, at: near(PINNED_NOW) });
    // Ben receives it through Anna's state, which he already subscribes to.
    expect(await ben.query(api.world.state, { memberId: a.memberId })).toMatchObject({ ask: { to: b.memberId } });

    later(2000);
    const askAt = (await stateRow(t, a.memberId))!.ask!.at;
    expect(await ben.mutation(api.world.accept, { from: a.memberId, askAt: askAt - 1 })).toMatchObject({ ok: false, reason: /gone/ });
    const accepted = await ben.mutation(api.world.accept, { from: a.memberId, askAt });
    expect(accepted).toMatchObject({ ok: true });
    const reply = (await stateRow(t, b.memberId))!.reply!;
    expect(reply).toEqual({ kind: "highFive", to: a.memberId, askAt: (await stateRow(t, a.memberId))!.ask!.at, at: near(PINNED_NOW + 2000) });
    // A second tap answers the same ask without another write.
    later(500);
    expect(await ben.mutation(api.world.accept, { from: a.memberId, askAt })).toMatchObject({ ok: true, at: reply.at });
    expect((await stateRow(t, b.memberId))!.reply).toEqual(reply);

    // Ben accepts Cara's ask too; accepting Anna's again still replays nothing.
    const cara = asUser(t, CARA);
    const c = await cara.mutation(api.world.join, {});
    await standAt(t, c.memberId, 1.5, 0.5);
    await cara.mutation(api.world.ask, { to: b.memberId, kind: "highFive" });
    const caraAsk = (await stateRow(t, c.memberId))!.ask!.at;
    await ben.mutation(api.world.accept, { from: c.memberId, askAt: caraAsk });
    const bucketBefore = (await stateRow(t, b.memberId))!.actBucket;
    expect(await ben.mutation(api.world.accept, { from: a.memberId, askAt })).toMatchObject({ ok: true, at: reply.at });
    expect((await stateRow(t, b.memberId))!.actBucket).toEqual(bucketBefore);
  });

  test("an ask lapses after ASK_MS, and can't be accepted by anyone else", async () => {
    const { t, anna, ben, a, b } = await pair();
    const cara = asUser(t, CARA);
    const c = await cara.mutation(api.world.join, {});
    await standAt(t, c.memberId, 0.5, 0.5);
    await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" });
    const askAt = (await stateRow(t, a.memberId))!.ask!.at;
    expect(await cara.mutation(api.world.accept, { from: a.memberId, askAt })).toMatchObject({ ok: false, reason: /gone/ });
    expect(await anna.mutation(api.world.accept, { from: b.memberId, askAt })).toMatchObject({ ok: false, reason: /gone/ });
    later(ASK_MS + 50);
    expect(await ben.mutation(api.world.accept, { from: a.memberId, askAt })).toMatchObject({ ok: false, reason: /gone/ });
    expect((await stateRow(t, b.memberId))!.reply).toBeUndefined();
  });

  test("only between people close together, in the same room, who haven't blocked each other", async () => {
    const { t, anna, ben, a, b } = await pair();
    await expect(anna.mutation(api.world.ask, { to: b.memberId, kind: "hug" })).rejects.toThrow(/together/);
    expect(await anna.mutation(api.world.ask, { to: a.memberId, kind: "highFive" })).toMatchObject({ reason: /That's you/ });
    await standAt(t, b.memberId, INTERACT_RADIUS + 0.1, 0);
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ reason: /closer/ });
    await standAt(t, b.memberId, 1, 0);
    await ben.mutation(api.world.block, { memberId: a.memberId });
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ reason: /left/ });
    // Unblocked, so the next refusal can only come from the room check.
    const [blockRow] = await ben.query(api.world.myBlocks, {});
    await ben.mutation(api.world.unblock, { blockId: blockRow.id });
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ ok: true });
    later(BUCKETS.act.refillMs);
    await t.run(async (ctx) => {
      const roomId = await ctx.db.insert("worldRooms", { place: "garden", instance: 9, memberCount: 1 });
      await ctx.db.patch("worldMembers", b.memberId, { roomId });
    });
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ reason: /left/ });
    await ben.mutation(api.world.leave, {});
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ reason: /left/ });
    expect(await anna.mutation(api.world.accept, { from: b.memberId, askAt: 0 })).toMatchObject({ reason: /left/ });
  });

  test("asking and accepting share the emote rate limit", async () => {
    const { t, anna, ben, a, b } = await pair();
    for (let i = 0; i < BUCKETS.act.burst; i++) await anna.mutation(api.world.act, { emote: "wave" });
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ ok: false, retryInMs: near(BUCKETS.act.refillMs) });
    later(BUCKETS.act.refillMs + 100);
    expect(await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" })).toMatchObject({ ok: true });
    for (let i = 0; i < BUCKETS.act.burst; i++) await ben.mutation(api.world.act, { emote: "smile" });
    const askAt = (await stateRow(t, a.memberId))!.ask!.at;
    expect(await ben.mutation(api.world.accept, { from: a.memberId, askAt })).toMatchObject({ ok: false, retryInMs: near(BUCKETS.act.refillMs) });
  });
});

describe("character editor", () => {
  const look = { skin: 7, hair: 5, hairColour: 8, shirt: 9, hat: 2, accessory: 1 };

  test("saving is one write; the roster shows it to everyone, and it's kept for the next visit", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    expect(await anna.mutation(api.world.saveLook, { look })).toEqual({ ok: true });
    const seen = await ben.query(api.world.roster, { roomId: a.roomId });
    expect(seen!.members.find((m) => m.memberId === a.memberId)!.look).toEqual(withHeight(look, ANNA));
    // Saving again straight away writes nothing.
    expect(await anna.mutation(api.world.saveLook, { look: { ...look, hat: 0 } })).toEqual({ ok: false });
    later(3100);
    expect(await anna.mutation(api.world.saveLook, { look: { ...look, hat: 0 } })).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldLooks").collect())).toHaveLength(1);
    await anna.mutation(api.world.leave, {});
    await anna.mutation(api.world.join, {});
    expect((await rows(t)).members.find((m) => m.email === ANNA)!.look).toEqual(withHeight({ ...look, hat: 0 }, ANNA));
  });

  test("anyone who never picked a height is drawn at one picked from their email; a picked one is kept", async () => {
    const t = newConvex();
    const emails = Array.from({ length: 12 }, (_, i) => `walker${i}@sow.org.au`);
    const joined: { roomId: Id<"worldRooms">; memberId: Id<"worldMembers"> }[] = [];
    for (const email of emails) joined.push(await asUser(t, email).mutation(api.world.join, {}));
    const first = joined[0];
    const roster = await asUser(t, emails[0]).query(api.world.roster, { roomId: first.roomId });
    const heights = roster!.members.map((m) => m.look.height);
    expect(heights.every((h) => h !== undefined && h >= 0 && h < LOOK_SIZES.height)).toBe(true);
    expect(new Set(heights).size).toBeGreaterThan(2);
    const walker = asUser(t, emails[1]);
    expect(await walker.mutation(api.world.saveLook, { look: { ...lookFor(emails[1]), height: undefined } })).toEqual({ ok: true });
    const after = await walker.query(api.world.roster, { roomId: first.roomId });
    expect(after!.members.find((m) => m.memberId === joined[1].memberId)!.look.height).toBe(lookFor(emails[1]).height);
    later(3100);
    expect(await walker.mutation(api.world.saveLook, { look: { ...lookFor(emails[1]), height: 0 } })).toEqual({ ok: true });
    const picked = await walker.query(api.world.roster, { roomId: first.roomId });
    expect(picked!.members.find((m) => m.memberId === joined[1].memberId)!.look.height).toBe(0);
  });

  test("a version 2 look (face, body, extras) saves in one write and reaches everyone through the roster", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    const v2 = { v: 2, skin: 2, hair: 10, hairColour: 4, shirt: 3, face: 3, eyes: 3, eyeColour: 2, brows: 2, nose: 1, mouth: 2, height: 4, build: 0, freckles: 1, blush: 2, beard: 3 };
    expect(await anna.mutation(api.world.saveLook, { look: v2 })).toEqual({ ok: true });
    const seen = await ben.query(api.world.roster, { roomId: a.roomId });
    expect(seen!.members.find((m) => m.memberId === a.memberId)!.look).toEqual(v2);
    await expect(anna.mutation(api.world.saveLook, { look: { ...v2, height: 5 } })).rejects.toThrow(/doesn't exist/);
    await expect(anna.mutation(api.world.saveLook, { look: { ...v2, v: 9 } })).rejects.toThrow(/doesn't exist/);
  });

  test("a version 3 look (sliders, makeup, bottoms, favourite colour) saves in one write; a version 2 one still saves", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    const v3 = {
      v: 3, skin: 11, hair: 17, hairColour: 11, shirt: 3, hat: 8, accessory: 6, eyes: 6, mouth: 6, freckles: 3, blush: 4, beard: 5, outfit: 9,
      browColour: 4, eyeY: 0, eyeGap: 6, eyeSize: 5, eyeTilt: 1, browY: 6, browGap: 2, browSize: 4, browTilt: 0, mouthY: 2, mouthSize: 6, mouthTilt: 3,
      glasses: 3, eyeshadow: 2, lipstick: 5, mole: 4, pants: 2, pantsColour: 7, favourite: 9,
    };
    expect(await anna.mutation(api.world.saveLook, { look: v3 })).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldLooks").collect())).toHaveLength(1);
    const seen = await ben.query(api.world.roster, { roomId: a.roomId });
    expect(seen!.members.find((m) => m.memberId === a.memberId)!.look).toEqual(withHeight(v3, ANNA));
    later(3100);
    const v2 = { v: 2, skin: 2, hair: 10, hairColour: 4, shirt: 3, accessory: 1 };
    expect(await anna.mutation(api.world.saveLook, { look: v2 })).toEqual({ ok: true });
    expect((await ben.query(api.world.roster, { roomId: a.roomId }))!.members.find((m) => m.memberId === a.memberId)!.look).toEqual(withHeight(v2, ANNA));
  });

  test("turns away a choice that doesn't exist", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    for (const bad of [{ ...look, skin: 12 }, { ...look, hat: -1 }, { ...look, shirt: 1.5 }, { ...look, accessory: 8 }, { ...look, eyeY: 7 }, { ...look, mouthTilt: -1 }, { ...look, pants: 4 }, { ...look, favourite: 12 }, { ...look, backdrop: 10 }]) {
      await expect(anna.mutation(api.world.saveLook, { look: bad })).rejects.toThrow(/doesn't exist/);
    }
    await expect(t.mutation(api.world.saveLook, { look })).rejects.toThrow(/signed in/);
  });

  test("keeps a chosen background colour", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.saveLook, { look: { ...look, backdrop: 9 } });
    const saved = await t.run((ctx) => ctx.db.query("worldLooks").first());
    expect(saved?.look.backdrop).toBe(9);
  });
});

describe("what people can see", () => {
  test("the roster, a state and the chat log are for people in the room", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await ben.mutation(api.world.say, { text: "hi" });

    const roster = await anna.query(api.world.roster, { roomId: a.roomId });
    expect(roster).toMatchObject({
      instance: 1,
      members: [
        { memberId: a.memberId, name: "anna", isMe: true },
        { memberId: b.memberId, name: "ben", isMe: false },
      ],
    });
    expect(await anna.query(api.world.state, { memberId: b.memberId })).toMatchObject({ say: { text: "hi" } });
    expect(said((await anna.query(api.world.chatLog, { roomId: a.roomId }))!)).toMatchObject([{ name: "ben", text: "hi", isMe: false }]);

    const cara = asUser(t, CARA);
    expect(await cara.query(api.world.roster, { roomId: a.roomId })).toBeNull();
    expect(await cara.query(api.world.state, { memberId: b.memberId })).toBeNull();
    expect(await cara.query(api.world.chatLog, { roomId: a.roomId })).toBeNull();

    await ben.mutation(api.world.leave, {});
    expect(await anna.query(api.world.state, { memberId: b.memberId })).toBeNull();
    await t.run(async (ctx) => {
      const state = (await ctx.db.query("worldState").first())!;
      await ctx.db.delete("worldState", state._id);
    });
    expect(await anna.query(api.world.state, { memberId: a.memberId })).toBeNull();
    await t.run((ctx) => ctx.db.delete("worldRooms", a.roomId));
    expect(await anna.query(api.world.roster, { roomId: a.roomId })).toBeNull();
  });

  test("blocking hides both people from each other, until unblocked", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await ben.mutation(api.world.say, { text: "hi" });
    await expect(anna.mutation(api.world.block, { memberId: a.memberId })).rejects.toThrow(/yourself/);
    await anna.mutation(api.world.block, { memberId: b.memberId });
    await anna.mutation(api.world.block, { memberId: b.memberId });
    const blocked = await anna.query(api.world.myBlocks, {});
    expect(blocked).toMatchObject([{ name: "ben" }]);

    expect((await anna.query(api.world.roster, { roomId: a.roomId }))!.members).toHaveLength(1);
    expect((await ben.query(api.world.roster, { roomId: a.roomId }))!.members).toHaveLength(1);
    expect(await anna.query(api.world.state, { memberId: b.memberId })).toBeNull();
    expect(await ben.query(api.world.state, { memberId: a.memberId })).toBeNull();
    expect((await anna.query(api.world.chatLog, { roomId: a.roomId }))!.filter((line) => !line.isMe)).toEqual([]);

    // Only the person who blocked can unblock.
    await ben.mutation(api.world.unblock, { blockId: blocked[0].id });
    expect(await anna.query(api.world.myBlocks, {})).toHaveLength(1);
    await anna.mutation(api.world.unblock, { blockId: blocked[0].id });
    expect(await anna.query(api.world.myBlocks, {})).toEqual([]);
    expect((await anna.query(api.world.roster, { roomId: a.roomId }))!.members).toHaveLength(2);

    await ben.mutation(api.world.leave, {});
    await expect(anna.mutation(api.world.block, { memberId: b.memberId })).rejects.toThrow(/already left/);
  });
});

describe("report", () => {
  test("copies the room's recent lines, marking the reported person's", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await anna.mutation(api.world.say, { text: "hello" });
    later(1000);
    await ben.mutation(api.world.say, { text: "something unkind" });
    await expect(anna.mutation(api.world.report, { memberId: b.memberId, reason: " " })).rejects.toThrow(/what happened/);
    await expect(anna.mutation(api.world.report, { memberId: a.memberId, reason: "x" })).rejects.toThrow(/yourself/);
    await anna.mutation(api.world.report, { memberId: b.memberId, reason: "Mean to me" });
    const reports = await t.run((ctx) => ctx.db.query("worldReports").collect());
    expect(reports).toMatchObject([
      {
        reporterEmail: ANNA,
        reportedEmail: BEN,
        reportedName: "ben",
        place: "garden",
        instance: 1,
        reason: "Mean to me",
        lines: [
          { name: "anna", text: "hello", reported: false },
          { name: "ben", text: "something unkind", reported: true },
        ],
      },
    ]);
  });

  test("is limited per person, and needs the reported person still there", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    for (let i = 0; i < REPORTS_PER_WINDOW; i++) {
      await anna.mutation(api.world.report, { memberId: b.memberId, reason: `r${i}` });
    }
    await expect(anna.mutation(api.world.report, { memberId: b.memberId, reason: "again" })).rejects.toThrow(/a lot of reports/);
    // A room swept from under the report still files it.
    await t.run(async (ctx) => {
      const room = (await ctx.db.query("worldRooms").first())!;
      await ctx.db.delete("worldRooms", room._id);
    });
    await asUser(t, CARA).mutation(api.world.report, { memberId: b.memberId, reason: "x" });
    const last = await t.run((ctx) => ctx.db.query("worldReports").order("desc").first());
    expect(last).toMatchObject({ place: "garden", instance: 0, lines: [] });
    await ben.mutation(api.world.leave, {});
    await expect(asUser(t, CARA).mutation(api.world.report, { memberId: b.memberId, reason: "x" })).rejects.toThrow(
      /already left/
    );
  });
});

describe("sweep", () => {
  test("removes people gone quiet, old lines and a room's extra lines, and keeps running while anyone's there", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < CHAT_ROOM_CAP + 3; i++) {
        await ctx.db.insert("worldChat", {
          roomId: a.roomId,
          memberId: a.memberId,
          email: ANNA,
          name: "anna",
          text: `line ${i}`,
          at: Date.now() - CHAT_TTL_MS + 5 * 60_000 + i,
        });
      }
      // An old line, and an orphaned presence mark.
      await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: "old", at: 1 });
      await ctx.db.insert("worldPresence", { memberId: a.memberId, lastSeen: 1 });
    });
    await t.run(async (ctx) => {
      const orphan = (await ctx.db.query("worldPresence").withIndex("by_lastSeen", (q) => q.eq("lastSeen", 1)).first())!;
      // Point it at a member that no longer exists.
      const { _id, _creationTime, ...copy } = (await ctx.db.get("worldMembers", a.memberId))!;
      const ghost = await ctx.db.insert("worldMembers", { ...copy, joinedAt: 0 });
      await ctx.db.delete("worldMembers", ghost);
      await ctx.db.patch("worldPresence", orphan._id, { memberId: ghost });
    });

    later(PRESENCE_TTL_MS - 10_000);
    await ben.mutation(api.world.heartbeat, {});
    later(10_001);
    await t.mutation(internal.world.sweep, {});
    let all = await rows(t);
    expect(all.members.map((m) => m.email)).toEqual([BEN]);
    expect(all.presence).toHaveLength(1);
    expect(all.chat).toHaveLength(CHAT_ROOM_CAP);
    expect(all.chat.some((line) => line.text === "old")).toBe(false);
    // Ben is still here, so the next sweep is booked.
    expect(all.meta[0].sweepAt).toEqual(near(Date.now() + SWEEP_EVERY_MS));

    // A backstop run while a sweep is booked books nothing more.
    later(1000);
    await t.mutation(internal.world.sweep, {});
    expect((await rows(t)).meta[0].sweepAt).toEqual(near(Date.now() - 1000 + SWEEP_EVERY_MS));

    later(PRESENCE_TTL_MS + 1);
    await t.mutation(internal.world.sweep, {});
    all = await rows(t);
    expect(all.members).toEqual([]);
    expect(all.rooms).toEqual([]);
    // Their rate limits are kept a while, so one more run is booked for when they expire.
    expect(all.meta[0].sweepAt).toBeGreaterThan(Date.now() + SWEEP_EVERY_MS);
    later(THROTTLE_KEEP_MS + CHAT_TTL_MS);
    await t.mutation(internal.world.sweep, {});
    expect((await rows(t)).meta[0].sweepAt).toBeUndefined();

    // Joining again restarts it.
    await anna.mutation(api.world.join, {});
    expect((await rows(t)).meta[0].sweepAt).toEqual(near(Date.now() + SWEEP_EVERY_MS));
  });

  test("a backstop run restarts a lost sweeper, and an empty world needs none", async () => {
    const t = newConvex();
    await t.mutation(internal.world.sweep, {});
    expect((await rows(t)).meta).toEqual([]);
    await t.run(async (ctx) => {
      const roomId = await ctx.db.insert("worldRooms", { place: "garden", instance: 1, memberCount: 1 });
      const memberId = await ctx.db.insert("worldMembers", {
        roomId,
        email: ANNA,
        name: "anna",
        look: { skin: 0, hair: 0, hairColour: 0, shirt: 0 },
        joinedAt: Date.now(),
      });
      await ctx.db.insert("worldPresence", { memberId, lastSeen: Date.now() });
    });
    await t.mutation(internal.world.sweep, {});
    expect((await rows(t)).meta).toMatchObject([{ sweepAt: near(Date.now() + SWEEP_EVERY_MS)}]);
  });

  test("join books a sweep only when none is coming", async () => {
    const t = newConvex();
    await asUser(t, ANNA).mutation(api.world.join, {});
    later(SWEEP_EVERY_MS);
    await asUser(t, BEN).mutation(api.world.join, {});
    expect((await rows(t)).meta[0].sweepAt).toEqual(near(PINNED_NOW + SWEEP_EVERY_MS));
    // Long overdue: the booked run was lost.
    later(SWEEP_EVERY_MS + 1);
    await asUser(t, CARA).mutation(api.world.join, {});
    expect((await rows(t)).meta[0].sweepAt).toEqual(near(Date.now() + SWEEP_EVERY_MS));
  });
});

describe("review fixes", () => {
  test("leaving and coming back keeps the rate limits, and joining itself is limited", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    for (let i = 0; i < BUCKETS.say.burst; i++) await anna.mutation(api.world.say, { text: `line ${i}` });
    expect(await anna.mutation(api.world.say, { text: "one more" })).toMatchObject({ ok: false });
    await anna.mutation(api.world.leave, {});
    await anna.mutation(api.world.join, {});
    expect(await anna.mutation(api.world.say, { text: "back again" })).toMatchObject({ ok: false });
    for (let i = 0; i < BUCKETS.join.burst - 1; i++) {
      await anna.mutation(api.world.leave, {});
      await anna.mutation(api.world.join, {});
    }
    await anna.mutation(api.world.leave, {});
    await expect(anna.mutation(api.world.join, {})).rejects.toThrow(/come and gone/);
    later(BUCKETS.join.refillMs + 100);
    expect(await anna.mutation(api.world.join, {})).toMatchObject({ instance: 1 });
  });

  test("a room never holds more than CHAT_ROOM_CAP lines, even between sweeps", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < CHAT_ROOM_CAP + 3; i++) {
        await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: `${i}`, at: Date.now() - 1000 + i });
      }
    });
    await anna.mutation(api.world.say, { text: "newest" });
    const chat = (await rows(t)).chat;
    expect(chat).toHaveLength(CHAT_ROOM_CAP);
    expect(chat.some((line) => line.text === "newest")).toBe(true);
  });

  test("a report keeps the reported person's lines however busy the room was after", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await ben.mutation(api.world.say, { text: "the unkind line" });
    await t.run(async (ctx) => {
      for (let i = 0; i < REPORT_CONTEXT_LINES + 5; i++) {
        await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: `chatter ${i}`, at: Date.now() + 1 + i });
      }
    });
    await anna.mutation(api.world.report, { memberId: b.memberId, reason: "Mean" });
    const report = (await t.run((ctx) => ctx.db.query("worldReports").first()))!;
    expect(report.lines[0]).toMatchObject({ text: "the unkind line", reported: true });
    expect(report.lines).toHaveLength(REPORT_CONTEXT_LINES + 1);
    expect(report.lines.map((l) => l.at)).toEqual([...report.lines.map((l) => l.at)].sort((x, y) => x - y));
  });

  test("the chat log leaves out lines past the TTL before the sweeper runs", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.say, { text: "old news" });
    later(CHAT_TTL_MS + 1000);
    await anna.mutation(api.world.heartbeat, {});
    expect(await anna.query(api.world.chatLog, { roomId: a.roomId })).toEqual([]);
  });

  test("a line on a state row is cleared after the chat TTL", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const { memberId } = await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.say, { text: "hello" });
    // Anna stays (heartbeats) past the TTL.
    for (let i = 0; i <= Math.ceil(CHAT_TTL_MS / (PRESENCE_TTL_MS - 1000)); i++) {
      later(PRESENCE_TTL_MS - 1000);
      await anna.mutation(api.world.heartbeat, {});
    }
    await t.mutation(internal.world.sweep, {});
    expect((await stateRow(t, memberId))!.say).toBeUndefined();
    expect(await anna.query(api.world.state, { memberId })).not.toHaveProperty("say");
  });

  test("expired chat is purged in follow-up runs, and the sweeper waits for the last line once the garden empties", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < 205; i++) {
        await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: `${i}`, at: 1 + i });
      }
    });
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(Date.now());
    await t.mutation(internal.world.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useFakeTimers({ toFake: ["Date"] });
    expect(said((await rows(t)).chat)).toHaveLength(0);

    await anna.mutation(api.world.say, { text: "last words" });
    await anna.mutation(api.world.leave, {});
    later(SWEEP_EVERY_MS);
    await t.mutation(internal.world.sweep, {});
    const meta = (await rows(t)).meta[0];
    expect(meta.sweepAt).toBeGreaterThanOrEqual(Date.now() + SWEEP_EVERY_MS);
  });

  test("a second tab leaving keeps the member; the last one removes it", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const first = await anna.mutation(api.world.join, {});
    const second = await anna.mutation(api.world.join, {});
    expect(second.memberId).toBe(first.memberId);
    await anna.mutation(api.world.leave, {});
    expect((await rows(t)).members).toMatchObject([{ _id: first.memberId, visits: 1 }]);
    await anna.mutation(api.world.leave, {});
    expect((await rows(t)).members).toEqual([]);
  });

  test("a state row shows the asks that person answered, for the asker to see", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await standAt(t, a.memberId, 0, 0);
    await standAt(t, b.memberId, 1, 0);
    await anna.mutation(api.world.ask, { to: b.memberId, kind: "highFive" });
    const askAt = (await stateRow(t, a.memberId))!.ask!.at;
    await ben.mutation(api.world.accept, { from: a.memberId, askAt });
    expect((await ben.query(api.world.state, { memberId: b.memberId }))!.answered).toMatchObject([{ to: a.memberId, askAt }]);
    expect((await anna.query(api.world.state, { memberId: b.memberId }))!.answered).toMatchObject([{ to: a.memberId, askAt }]);
  });

  test("the chat log fills from unblocked people when the newest lines are blocked", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: "older but fine", at: Date.now() - 5000 });
      for (let i = 0; i < CHAT_LOG_SIZE + 2; i++) {
        await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: b.memberId, email: BEN, name: "ben", text: `${i}`, at: Date.now() + i });
      }
    });
    await anna.mutation(api.world.block, { memberId: b.memberId });
    expect(said((await anna.query(api.world.chatLog, { roomId: a.roomId }))!)).toMatchObject([{ text: "older but fine" }]);
  });

  test("a report leaves out lines already past the chat TTL", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await ben.mutation(api.world.say, { text: "long ago" });
    later(CHAT_TTL_MS + 1000);
    await ben.mutation(api.world.heartbeat, {});
    await anna.mutation(api.world.heartbeat, {});
    await anna.mutation(api.world.report, { memberId: b.memberId, reason: "Mean" });
    expect((await t.run((ctx) => ctx.db.query("worldReports").first()))!.lines).toEqual([]);
  });

  test("purgeChat stops when nothing is left", async () => {
    const t = newConvex();
    await t.mutation(internal.world.purgeChat, {});
    expect((await rows(t)).chat).toEqual([]);
  });

  test("rooms past the scan get a fresh instance number", async () => {
    const t = newConvex();
    await t.run(async (ctx) => {
      for (let i = 1; i <= 50; i++) await ctx.db.insert("worldRooms", { place: "garden", instance: i, memberCount: ROOM_CAP });
      await ctx.db.insert("worldRooms", { place: "garden", instance: 77, memberCount: ROOM_CAP });
    });
    expect((await asUser(t, ANNA).mutation(api.world.join, {})).instance).toBe(78);
  });

  test("blocking stops at MAX_BLOCKS so every block stays listed", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const b = await asUser(t, BEN).mutation(api.world.join, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_BLOCKS; i++) await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: `p${i}@sow.org.au`, blockedName: `p${i}` });
    });
    await expect(anna.mutation(api.world.block, { memberId: b.memberId })).rejects.toThrow(/Unblock someone/);
    expect(await anna.query(api.world.myBlocks, {})).toHaveLength(MAX_BLOCKS);
  });
});

/**
 * The write budget in the PR, counted per code path rather than measured at
 * the database: each accepted move, emote or line writes the caller's state
 * row once; a line also inserts a chat row (and, in a room already at
 * CHAT_ROOM_CAP lines, deletes the oldest); the presence mark is written at
 * most once every PRESENCE_TOUCH_MS, which the simulation observes directly.
 * It's an estimate of document writes, not a guarantee the database enforces.
 */
describe("write budget per player", () => {
  const simulate = async (perMinute: { move: number; act: number; say: number }, minutes: number, fullRoom = false) => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const { memberId, roomId } = await anna.mutation(api.world.join, {});
    if (fullRoom) {
      // A busy room: already at CHAT_ROOM_CAP, so every line also deletes the oldest.
      await t.run(async (ctx) => {
        for (let i = 1; i < CHAT_ROOM_CAP; i++) {
          await ctx.db.insert("worldChat", { roomId, memberId, email: ANNA, name: "anna", text: `${i}`, at: Date.now() - 1000 + i });
        }
      });
    }
    const chatRows = () => t.run(async (ctx) => (await ctx.db.query("worldChat").collect()).length);
    const counts = { mutations: 0, accepted: 0, stateWrites: 0, chatWrites: 0, chatDeletes: 0, presenceWrites: 0 };
    let lastSeen = await lastSeenOf(t, memberId);
    const tick = 250;
    const every = (n: number) => (n > 0 ? Math.round(60_000 / n / tick) : Infinity);
    for (let step = 1; step <= (minutes * 60_000) / tick; step++) {
      later(tick);
      const calls: Promise<{ ok: boolean }>[] = [];
      let said = 0;
      const before = step % every(perMinute.say) === 0 ? await chatRows() : 0;
      if (step % every(perMinute.move) === 0) calls.push(anna.mutation(api.world.move, { toX: (step % 7) - 3, toZ: (step % 11) - 5 }));
      if (step % every(perMinute.act) === 0) calls.push(anna.mutation(api.world.act, { emote: "wave" }));
      if (step % every(perMinute.say) === 0) {
        calls.push(anna.mutation(api.world.say, { text: `line ${step}` }).then((r) => {
          if (r.ok) said++;
          return r;
        }));
      }
      for (const result of await Promise.all(calls)) {
        counts.mutations++;
        if (result.ok) counts.accepted++;
      }
      if (said) {
        // Lines inserted, and the ones the cap deleted: what didn't add to the room.
        counts.chatWrites += said;
        counts.chatDeletes += before + said - (await chatRows());
      }
      const seen = await lastSeenOf(t, memberId);
      if (seen !== lastSeen) counts.presenceWrites++;
      lastSeen = seen;
    }
    counts.stateWrites = counts.accepted;
    const writes = counts.stateWrites + counts.chatWrites + counts.chatDeletes + counts.presenceWrites;
    return { ...counts, writesPerMinute: writes / minutes, mutationsPerMinute: counts.mutations / minutes };
  };

  test("a player at every rate limit makes an estimated 152 document writes a minute at most, in a room under the chat cap", async () => {
    // Moving four times a second (a finger dragged without a pause, which the
    // app sends at most every 500 ms), an emote and a line every 2 seconds,
    // in a room that stays under CHAT_ROOM_CAP lines (7 minutes of lines).
    const flat = await simulate({ move: 240, act: 30, say: 30 }, 7);
    expect(flat.chatDeletes).toBe(0);
    // 120 moves + 15 emotes + 6 lines (two writes each) + 3 presence marks,
    // plus the first minute's bursts spread over the run.
    expect(flat.writesPerMinute).toBeLessThanOrEqual(152);
    expect(flat.writesPerMinute).toBeGreaterThan(149);
  }, 120_000);

  test("in a room already at the chat cap, each line also deletes one: at most 158 a minute", async () => {
    const busy = await simulate({ move: 240, act: 30, say: 30 }, 10, true);
    expect(busy.chatDeletes).toBe(busy.chatWrites);
    expect(busy.writesPerMinute).toBeLessThanOrEqual(158);
    expect(busy.writesPerMinute).toBeGreaterThan(155);
  }, 120_000);

  test("a typical player makes an estimated 15 document writes a minute", async () => {
    const typical = await simulate({ move: 8, act: 1, say: 2 }, 10);
    expect(typical.writesPerMinute).toBeLessThanOrEqual(16);
    expect(typical.mutationsPerMinute).toBe(11);
  }, 120_000);
});

describe("typing", () => {
  const typingOf = async (t: T, viewer: ReturnType<typeof asUser>, memberId: Id<"worldMembers">) =>
    (await viewer.query(api.world.state, { memberId }))?.typing;

  test("shows while someone types, refreshes at most every few seconds, and clears on send or stop", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    expect(await typingOf(t, ben, a.memberId)).toBeUndefined();

    await anna.mutation(api.world.typing, { on: true });
    const started = await typingOf(t, ben, a.memberId);
    expect(started).toEqual(near(Date.now()));

    later(TYPING_REFRESH_MS - 500);
    await anna.mutation(api.world.typing, { on: true });
    expect(await typingOf(t, ben, a.memberId)).toBe(started);

    later(1000);
    await anna.mutation(api.world.typing, { on: true });
    expect(await typingOf(t, ben, a.memberId)).toBeGreaterThan(started!);

    await anna.mutation(api.world.typing, { on: false });
    expect(await typingOf(t, ben, a.memberId)).toBeUndefined();
    await anna.mutation(api.world.typing, { on: true });
    expect(await typingOf(t, ben, a.memberId)).toBeUndefined();

    later(TYPING_REFRESH_MS);
    await anna.mutation(api.world.typing, { on: true });
    expect(await typingOf(t, ben, a.memberId)).toBeDefined();
    await anna.mutation(api.world.say, { text: "hello" });
    expect(await typingOf(t, ben, a.memberId)).toBeUndefined();
    expect((await stateRow(t, a.memberId))?.typing).toBeUndefined();
  });

  test("someone who left can't type", async () => {
    const t = newConvex();
    await expect(asUser(t, ANNA).mutation(api.world.typing, { on: true })).rejects.toThrow(/left the garden/);
  });
});

describe("coming back", () => {
  test("you come back to the place and spot you left from", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    const moved = await anna.mutation(api.world.travel, { to: "campfire" });
    if (!moved.ok) throw new Error("travel refused");
    const spot = clampTarget(1.1, 2.3, "campfire");
    const memberId = (await rows(t)).members[0]._id;
    await standAt(t, memberId, spot.x, spot.z);
    await anna.mutation(api.world.leave, {});
    expect((await rows(t)).members).toEqual([]);

    later(60 * 60_000);
    const back = await anna.mutation(api.world.join, {});
    expect(back.place).toBe("campfire");
    expect(await stateRow(t, back.memberId)).toMatchObject({ fromX: spot.x, fromZ: spot.z, toX: spot.x, toZ: spot.z });
    expect(await anna.query(api.world.roster, { roomId: back.roomId })).toMatchObject({ place: "campfire" });
  });

  test("a sweep saves where you were standing too, mid-walk", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const joined = await anna.mutation(api.world.join, {});
    const to = clampTarget(2, 1);
    await anna.mutation(api.world.move, { toX: to.x, toZ: to.z });
    later(PRESENCE_TTL_MS + SWEEP_EVERY_MS);
    await t.mutation(internal.world.sweep, {});
    expect((await rows(t)).members).toEqual([]);
    const back = await anna.mutation(api.world.join, {});
    expect(back.place).toBe("garden");
    const state = await stateRow(t, back.memberId);
    expect(state).toMatchObject({ fromX: to.x, fromZ: to.z });
    expect(joined.memberId).not.toBe(back.memberId);
  });

  test("a saved spot inside something is moved out of it", async () => {
    const t = newConvex();
    await t.run((ctx) =>
      ctx.db.insert("worldVisitors", { email: ANNA, name: "anna", lastSeenAt: Date.now(), lastPlace: "garden", lastX: 999, lastZ: -999 })
    );
    const back = await asUser(t, ANNA).mutation(api.world.join, {});
    const fixed = clampTarget(999, -999);
    expect(await stateRow(t, back.memberId)).toMatchObject({ fromX: fixed.x, fromZ: fixed.z });
  });

  test("an unknown saved place falls back to the garden spawn", async () => {
    const t = newConvex();
    await t.run((ctx) =>
      ctx.db.insert("worldVisitors", { email: ANNA, name: "anna", lastSeenAt: Date.now(), lastPlace: "moon", lastX: 1, lastZ: 1 })
    );
    const back = await asUser(t, ANNA).mutation(api.world.join, {});
    const spawn = spawnFor(ANNA);
    expect(back.place).toBe("garden");
    expect(await stateRow(t, back.memberId)).toMatchObject({ fromX: spawn.x, fromZ: spawn.z });
  });
});

describe("chat log and blocked senders", () => {
  test("lines from blocked people don't use up the log", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await ben.mutation(api.world.say, { text: "still here" });
    later(1000);
    await t.run(async (ctx) => {
      await ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: CARA, blockedName: "cara" });
      for (let i = 0; i < 300; i++) {
        await ctx.db.insert("worldChat", { roomId: b.roomId, memberId: b.memberId, email: CARA, name: "cara", text: `spam ${i}`, at: Date.now() + i });
      }
    });
    expect(said((await anna.query(api.world.chatLog, { roomId: a.roomId }))!).map((line) => line.text)).toEqual(["still here"]);
  });
});

describe("rock paper scissors", () => {
  const duelPair = async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await standAt(t, a.memberId, 0, 0);
    await standAt(t, b.memberId, 1, 0);
    return { t, anna, ben, a, b };
  };

  const start = async () => {
    const pair = await duelPair();
    const { t, anna, ben, b, a } = pair;
    const asked = await anna.mutation(api.world.ask, { to: b.memberId, kind: "rps" });
    if (!asked.ok) throw new Error("ask refused");
    expect(await ben.mutation(api.world.accept, { from: a.memberId, askAt: asked.at })).toMatchObject({ ok: true });
    const duel = (await t.run((ctx) => ctx.db.query("worldDuels").first()))!;
    return { ...pair, duel };
  };

  test("accepting a duel starts a five-second round between the two", async () => {
    const { anna, a, b, duel } = await start();
    expect(duel).toMatchObject({ a: a.memberId, b: b.memberId, round: 1, aChanges: 0, bChanges: 0 });
    expect(duel.endsAt - duel.startsAt).toBe(DUEL_FIRST_MS);
    expect(await anna.query(api.world.duels, { roomId: a.roomId })).toMatchObject([{ id: duel._id, round: 1, done: false }]);
  });

  test("nobody sees a pick before the reveal, not even the other player", async () => {
    const { t, anna, ben, a, duel } = await start();
    await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "rock" });
    const cara = asUser(t, CARA);
    await cara.mutation(api.world.join, {});
    expect((await anna.query(api.world.duels, { roomId: a.roomId }))![0].myPick).toBe("rock");
    expect((await ben.query(api.world.duels, { roomId: a.roomId }))![0].myPick).toBeUndefined();
    expect((await cara.query(api.world.duels, { roomId: a.roomId }))![0].myPick).toBeUndefined();
    expect((await ben.query(api.world.duels, { roomId: a.roomId }))![0].shown).toBeUndefined();
  });

  test("the reveal names the winner and ends the game", async () => {
    const { t, anna, ben, a, duel } = await start();
    await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "paper" });
    await ben.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "rock" });
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    const [after] = (await anna.query(api.world.duels, { roomId: a.roomId }))!;
    expect(after).toMatchObject({ done: true, shown: { a: "paper", b: "rock", winner: "a", at: duel.endsAt } });
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    await t.mutation(internal.world.clearDuel, { duelId: duel._id });
    expect(await anna.query(api.world.duels, { roomId: a.roomId })).toEqual([]);
  });

  test("a draw goes again with a three-second round", async () => {
    const { t, anna, ben, a, duel } = await start();
    await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "scissors" });
    await ben.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "scissors" });
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    const [again] = (await anna.query(api.world.duels, { roomId: a.roomId }))!;
    expect(again).toMatchObject({ round: 2, done: false, shown: { winner: "draw" } });
    expect(again.myPick).toBeUndefined();
    expect(again.startsAt).toBe(duel.endsAt + DUEL_REVEAL_MS);
    expect(again.endsAt - again.startsAt).toBe(DUEL_AGAIN_MS);
    await t.mutation(internal.world.clearDuel, { duelId: duel._id });
    expect(await anna.query(api.world.duels, { roomId: a.roomId })).toHaveLength(1);
  });

  test("no pick by the end gets one picked for you", async () => {
    const { t, anna, a, duel } = await start();
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    const [after] = (await anna.query(api.world.duels, { roomId: a.roomId }))!;
    expect(["rock", "paper", "scissors"]).toContain(after.shown!.a);
    expect(["rock", "paper", "scissors"]).toContain(after.shown!.b);
  });

  test("picks only count from the players, inside the round, and not forever", async () => {
    const { t, anna, duel } = await start();
    const cara = asUser(t, CARA);
    await cara.mutation(api.world.join, {});
    expect(await cara.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "rock" })).toMatchObject({ ok: false });
    await expect(anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "lizard" })).rejects.toThrow(/rock, paper or scissors/);
    for (let i = 0; i < DUEL_PICK_CHANGES; i++) {
      await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: i % 2 ? "rock" : "paper" });
    }
    expect(await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "scissors" })).toMatchObject({ ok: false, reason: /mind/ });
    later(DUEL_FIRST_MS + 10);
    expect(await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "rock" })).toMatchObject({ ok: false, reason: /late/ });
  });

  test("each player has their own changes of mind", async () => {
    const { ben, anna, duel } = await start();
    for (let i = 0; i < DUEL_PICK_CHANGES; i++) {
      await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: i % 2 ? "rock" : "paper" });
    }
    expect(await ben.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "scissors" })).toEqual({ ok: true });
  });

  test("a pick sent for an earlier round doesn't count in the next", async () => {
    const { t, anna, ben, a, duel } = await start();
    await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "rock" });
    await ben.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "rock" });
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    later(DUEL_REVEAL_MS + DUEL_FIRST_MS + 100);
    expect(await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "paper" })).toMatchObject({ ok: false, reason: /late/ });
    expect((await anna.query(api.world.duels, { roomId: a.roomId }))![0].myPick).toBeUndefined();
  });

  test("a late reveal still gives the next round its full time", async () => {
    const { t, anna, ben, a, duel } = await start();
    await anna.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "paper" });
    await ben.mutation(api.world.duelPick, { duelId: duel._id, round: 1, pick: "paper" });
    later(DUEL_FIRST_MS + 10_000);
    const resolvedAt = Date.now();
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    const [again] = (await anna.query(api.world.duels, { roomId: a.roomId }))!;
    expect(again.shown!.at).toBeGreaterThanOrEqual(resolvedAt);
    expect(again.startsAt).toBe(again.shown!.at + DUEL_REVEAL_MS);
    expect(again.endsAt - again.startsAt).toBe(DUEL_AGAIN_MS);
  });

  test("someone who blocked a player doesn't see their duel", async () => {
    const { t, anna, a } = await start();
    const cara = asUser(t, CARA);
    await cara.mutation(api.world.join, {});
    expect(await cara.query(api.world.duels, { roomId: a.roomId })).toHaveLength(1);
    await cara.mutation(api.world.block, { memberId: a.memberId });
    expect(await cara.query(api.world.duels, { roomId: a.roomId })).toEqual([]);
    expect(await anna.query(api.world.duels, { roomId: a.roomId })).toHaveLength(1);
  });

  test("one game at a time, and leaving calls it off", async () => {
    const { t, anna, ben, a, b, duel } = await start();
    const cara = asUser(t, CARA);
    const c = await cara.mutation(api.world.join, {});
    await standAt(t, c.memberId, 0.5, 0.5);
    later(ASK_MS);
    const asked = await cara.mutation(api.world.ask, { to: a.memberId, kind: "rps" });
    if (!asked.ok) throw new Error("ask refused");
    expect(await anna.mutation(api.world.accept, { from: c.memberId, askAt: asked.at })).toMatchObject({ ok: false, reason: /already playing/ });
    await ben.mutation(api.world.leave, {});
    await t.mutation(internal.world.resolveDuel, { duelId: duel._id, round: 1 });
    expect(await anna.query(api.world.duels, { roomId: a.roomId })).toEqual([]);
    expect(b.memberId).toBeDefined();
  });

  test("the sweep clears a duel whose reveal was lost", async () => {
    const { t, anna, a, duel } = await start();
    later(DUEL_FIRST_MS + 61_000);
    await anna.mutation(api.world.heartbeat, {});
    await t.mutation(internal.world.sweep, {});
    expect(await anna.query(api.world.duels, { roomId: a.roomId })).toEqual([]);
    expect(duel).toBeDefined();
  });

  test("anything else isn't something you can ask for", async () => {
    const { anna, b } = await duelPair();
    await expect(anna.mutation(api.world.ask, { to: b.memberId, kind: "arm wrestle" })).rejects.toThrow(/together/);
  });
});

describe("join and leave lines", () => {
  const systemLines = (t: T) =>
    t.run(async (ctx) => (await ctx.db.query("worldChat").collect()).filter((row) => row.kind !== undefined).map((row) => `${row.name} ${row.text}`));

  test("coming in writes one joined line, and another tab doesn't", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    expect(await systemLines(t)).toEqual(["anna joined the World", "ben joined the World"]);
    expect((await ben.query(api.world.chatLog, { roomId: a.roomId }))![1]).toMatchObject({ name: "anna", text: "joined the World", kind: "join", here: true });
  });

  test("leaving writes a left line only when the last visit ends", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.leave, {});
    expect(await systemLines(t)).toEqual(["anna joined the World"]);
    await anna.mutation(api.world.leave, {});
    expect(await systemLines(t)).toEqual(["anna joined the World", "anna left"]);
  });

  test("the sweep writes a left line for someone who went quiet", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    later(PRESENCE_TTL_MS + 1000);
    await t.mutation(internal.world.sweep, {});
    expect(await systemLines(t)).toEqual(["anna joined the World", "anna left"]);
  });

  test("travelling and deleting an account write no line", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.travel, { to: "chapel" });
    await t.run((ctx) => removeFromWorld(ctx, ANNA));
    expect(await systemLines(t)).toEqual(["anna joined the World"]);
  });

  test("they don't use up anyone's lines, aren't reported, and hide with a block", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await cara.mutation(api.world.join, {});
    for (let i = 0; i < BUCKETS.say.burst; i++) {
      expect(await ben.mutation(api.world.say, { text: `line ${i}` })).toMatchObject({ ok: true });
    }
    await anna.mutation(api.world.report, { memberId: b.memberId, reason: "rude" });
    const report = (await t.run((ctx) => ctx.db.query("worldReports").first()))!;
    expect(report.lines.map((line) => line.text).sort()).toEqual(["line 0", "line 1", "line 2"]);
    await anna.mutation(api.world.block, { memberId: b.memberId });
    await ben.mutation(api.world.leave, {});
    const seen = (await anna.query(api.world.chatLog, { roomId: a.roomId }))!.filter((line) => line.kind !== undefined);
    expect(seen.map((line) => line.name)).toEqual(["cara", "anna"]);
  });
});

describe("ping", () => {
  const pingOf = async (t: T, email: string) =>
    t.run(async (ctx) => {
      const member = await ctx.db.query("worldMembers").withIndex("by_email", (q) => q.eq("email", email)).first();
      return member && (await ctx.db.query("worldPings").withIndex("by_memberId", (q) => q.eq("memberId", member._id)).unique())?.bars;
    });

  test("your bars show in the room's pings and to people in other places", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    await ben.mutation(api.world.join, {});
    expect(await ben.query(api.world.pings, { roomId: a.roomId })).toEqual([]);
    expect(await anna.mutation(api.world.ping, { bars: 3 })).toMatchObject({ published: true, serverNow: expect.any(Number) });
    expect(await ben.query(api.world.pings, { roomId: a.roomId })).toEqual([{ memberId: a.memberId, bars: 3 }]);
    await ben.mutation(api.world.travel, { to: "beach" });
    expect(await ben.query(api.world.pings, { roomId: a.roomId })).toBeNull();
    expect(await ben.query(api.world.elsewhere, {})).toMatchObject([{ place: "garden", people: [{ ping: 3 }] }]);
  });

  test("bars live off the member row, so publishing them leaves the roster and state rows alone", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    const memberRow = () => t.run((ctx) => ctx.db.get("worldMembers", a.memberId));
    const before = await memberRow();
    await anna.mutation(api.world.ping, { bars: 2 });
    expect(await memberRow()).toEqual(before);
    expect((await anna.query(api.world.roster, { roomId: a.roomId }))?.members[0]).not.toHaveProperty("ping");
  });

  test("someone blocked either way is left out of the room's pings", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const a = await anna.mutation(api.world.join, {});
    const b = await ben.mutation(api.world.join, {});
    await anna.mutation(api.world.ping, { bars: 4 });
    await ben.mutation(api.world.ping, { bars: 1 });
    await t.run((ctx) => ctx.db.insert("worldBlocks", { email: ANNA, blockedEmail: BEN, blockedName: "ben" }));
    expect(await anna.query(api.world.pings, { roomId: a.roomId })).toEqual([{ memberId: a.memberId, bars: 4 }]);
    expect(await ben.query(api.world.pings, { roomId: b.roomId })).toEqual([{ memberId: b.memberId, bars: 1 }]);
  });

  test("leaving takes your bars with you", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.ping, { bars: 3 });
    await anna.mutation(api.world.leave, {});
    expect(await t.run((ctx) => ctx.db.query("worldPings").collect())).toEqual([]);
  });

  test("the same bars write nothing, and a change waits 30 s after the last write", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await anna.mutation(api.world.ping, { bars: 4 });
    later(PING_PUBLISH_MS * 2);
    expect(await anna.mutation(api.world.ping, { bars: 4 })).toMatchObject({ published: false });
    await anna.mutation(api.world.ping, { bars: 2 });
    expect(await pingOf(t, ANNA)).toBe(2);
    later(PING_PUBLISH_MS - 1000);
    expect(await anna.mutation(api.world.ping, { bars: 1 })).toMatchObject({ published: false });
    expect(await pingOf(t, ANNA)).toBe(2);
    later(1000);
    expect(await anna.mutation(api.world.ping, { bars: 1 })).toMatchObject({ published: true });
    expect(await pingOf(t, ANNA)).toBe(1);
  });

  test("a probe without bars, or from someone not in the world, writes nothing", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    expect(await anna.mutation(api.world.ping, { bars: 3 })).toMatchObject({ published: false });
    await anna.mutation(api.world.join, {});
    expect(await anna.mutation(api.world.ping, {})).toMatchObject({ published: false });
    expect((await pingOf(t, ANNA)) ?? null).toBeNull();
  });

  test("bars outside one to four are refused", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await expect(anna.mutation(api.world.ping, { bars: 7 })).rejects.toThrow(/1 to 4/);
    await expect(anna.mutation(api.world.ping, { bars: 2.5 })).rejects.toThrow(/1 to 4/);
  });
});

describe("chat log pages", () => {
  const seed = (t: T, a: { roomId: Id<"worldRooms">; memberId: Id<"worldMembers"> }, ats: number[]) =>
    t.run(async (ctx) => {
      for (const at of ats) await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: `at ${at}`, at });
    });

  test("lines before and from a split cover the log once, newest first, and a limit takes the newest", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    const now = Date.now();
    await seed(t, a, [now - 5000, now - 4000, now - 3000, now - 2000, now - 1000]);
    const texts = async (args: { limit?: number; after?: number; before?: number }) =>
      said((await anna.query(api.world.chatLog, { roomId: a.roomId, ...args }))!).map((line) => line.text);
    const split = now - 3000;
    expect(await texts({ after: split })).toEqual([`at ${now - 1000}`, `at ${now - 2000}`, `at ${now - 3000}`]);
    expect(await texts({ before: split })).toEqual([`at ${now - 4000}`, `at ${now - 5000}`]);
    expect(await texts({ before: split, limit: 1 })).toEqual([`at ${now - 4000}`]);
    const all = async (limit: number) => (await anna.query(api.world.chatLog, { roomId: a.roomId, limit }))!.map((line) => line.text);
    expect(await all(3)).toEqual([expect.any(String), `at ${now - 1000}`, `at ${now - 2000}`]);
    expect(await all(0)).toHaveLength(1);
    expect(await all(1000)).toHaveLength(6);
  });

  test("a split older than an hour still leaves out lines past the chat TTL", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    const now = Date.now();
    await seed(t, a, [now - 61 * 60_000, now - 1000]);
    const lines = said((await anna.query(api.world.chatLog, { roomId: a.roomId, after: 0 }))!);
    expect(lines.map((line) => line.text)).toEqual([`at ${now - 1000}`]);
  });
});

describe("an hour of chat", () => {
  test("a line from 59 minutes ago is still in the log, and one from 61 minutes ago is not", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: "59 minutes", at: Date.now() - 59 * 60_000 });
      await ctx.db.insert("worldChat", { roomId: a.roomId, memberId: a.memberId, email: ANNA, name: "anna", text: "61 minutes", at: Date.now() - 61 * 60_000 });
    });
    const texts = said((await anna.query(api.world.chatLog, { roomId: a.roomId }))!).map((line) => line.text);
    expect(texts).toContain("59 minutes");
    expect(texts).not.toContain("61 minutes");
    expect(CHAT_TTL_MS).toBe(60 * 60_000);
  });

  test("chatLog honors an optional limit and clamps it", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const a = await anna.mutation(api.world.join, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("worldChat", {
          roomId: a.roomId,
          memberId: a.memberId,
          email: ANNA,
          name: "anna",
          text: `msg ${i}`,
          at: Date.now() + i,
        });
      }
    });
    const capped = (await anna.query(api.world.chatLog, { roomId: a.roomId, limit: 3 }))!;
    expect(capped).toHaveLength(3);
    expect(capped.map((l) => l.text)).toEqual(["msg 9", "msg 8", "msg 7"]);
    const minCapped = (await anna.query(api.world.chatLog, { roomId: a.roomId, limit: 0 }))!;
    expect(minCapped).toHaveLength(1);
    const notANumber = (await anna.query(api.world.chatLog, { roomId: a.roomId, limit: Number.NaN }))!;
    expect(notANumber).toHaveLength(11);
  });
});

describe("the beach ball", () => {
  const toBeach = async (t: T, email: string) => {
    const me = asUser(t, email);
    const joined = await me.mutation(api.world.join, {});
    const there = await me.mutation(api.world.travel, { to: "beach" });
    if (!there.ok) throw new Error("travel refused");
    return { me, roomId: there.roomId, memberId: joined.memberId };
  };
  const walkTo = async (me: ReturnType<typeof asUser>, x: number, z: number) => {
    await me.mutation(api.world.move, { toX: x, toZ: z });
    later(10_000);
  };
  const balls = (t: T) => t.run((ctx) => ctx.db.query("worldBalls").collect());

  test("rests at its spot until someone beside it kicks it, with one write per kick", async () => {
    const t = newConvex();
    const anna = await toBeach(t, ANNA);
    expect(await anna.me.query(api.world.ball, { roomId: anna.roomId })).toBeNull();
    await walkTo(anna.me, BALL_HOME.x, BALL_HOME.z + 1);
    const kicked = await anna.me.mutation(api.world.kickBall, { dirX: 0, dirZ: -2 });
    expect(kicked).toMatchObject({ ok: true, ball: { x: BALL_HOME.x, z: BALL_HOME.z, vx: 0, vz: -KICK_SPEED } });
    expect(await balls(t)).toHaveLength(1);
    const seen = await anna.me.query(api.world.ball, { roomId: anna.roomId });
    expect(seen).toEqual(kicked.ok ? kicked.ball : null);
    later(KICK_GAP_MS);
    await walkTo(anna.me, BALL_HOME.x, BALL_HOME.z - 3);
    const again = await anna.me.mutation(api.world.kickBall, { dirX: 1, dirZ: 0 });
    expect(again.ok).toBe(true);
    expect(await balls(t)).toHaveLength(1);
  });

  test("everyone in the room sees the same ball; someone elsewhere doesn't", async () => {
    const t = newConvex();
    const anna = await toBeach(t, ANNA);
    const ben = await toBeach(t, BEN);
    await walkTo(anna.me, BALL_HOME.x - 1, BALL_HOME.z);
    const kicked = await anna.me.mutation(api.world.kickBall, { dirX: 1, dirZ: 0 });
    expect(await ben.me.query(api.world.ball, { roomId: ben.roomId })).toEqual(kicked.ok ? kicked.ball : null);
    const cara = asUser(t, CARA);
    await cara.mutation(api.world.join, {});
    expect(await cara.query(api.world.ball, { roomId: anna.roomId })).toBeNull();
  });

  test("a kick straight after another is turned away, and one from afar is refused", async () => {
    const t = newConvex();
    const anna = await toBeach(t, ANNA);
    await walkTo(anna.me, BALL_HOME.x, BALL_HOME.z + 1);
    await anna.me.mutation(api.world.kickBall, { dirX: 1, dirZ: 0 });
    later(100);
    expect(await anna.me.mutation(api.world.kickBall, { dirX: 1, dirZ: 0 })).toMatchObject({ ok: false, retryInMs: near(KICK_GAP_MS - 100) });
    later(KICK_GAP_MS);
    await walkTo(anna.me, -3, 6);
    await expect(anna.me.mutation(api.world.kickBall, { dirX: 1, dirZ: 0 })).rejects.toThrow(/Walk up to the ball/);
    expect(await balls(t)).toHaveLength(1);
  });

  test("there's no ball anywhere but the Beach", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.join, {});
    await expect(anna.mutation(api.world.kickBall, { dirX: 1, dirZ: 0 })).rejects.toThrow(/no ball here/);
  });

  test("the ball goes with its room when the last person leaves", async () => {
    const t = newConvex();
    const anna = await toBeach(t, ANNA);
    await walkTo(anna.me, BALL_HOME.x, BALL_HOME.z + 1);
    await anna.me.mutation(api.world.kickBall, { dirX: 0, dirZ: -1 });
    await anna.me.mutation(api.world.leave, {});
    expect(await balls(t)).toEqual([]);
  });

  test("travelling away from an empty Beach takes its ball too", async () => {
    const t = newConvex();
    const anna = await toBeach(t, ANNA);
    await walkTo(anna.me, BALL_HOME.x, BALL_HOME.z + 1);
    await anna.me.mutation(api.world.kickBall, { dirX: 0, dirZ: -1 });
    await anna.me.mutation(api.world.travel, { to: "garden" });
    expect(await balls(t)).toEqual([]);
  });
});

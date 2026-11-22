import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, newConvex, PINNED_NOW, type T } from "../test/convexFixture";
import {
  ASK_MS,
  BUCKETS,
  CHAT_LOG_SIZE,
  CHAT_ROOM_CAP,
  CHAT_TTL_MS,
  clampTarget,
  INTERACT_RADIUS,
  MAX_BLOCKS,
  REPORT_CONTEXT_LINES,
  THROTTLE_KEEP_MS,
  PRESENCE_TOUCH_MS,
  PRESENCE_TTL_MS,
  REPORTS_PER_WINDOW,
  ROOM_CAP,
  spawnFor,
  SWEEP_EVERY_MS,
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
    later(1000); // 1.4 units along
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
    expect(all.chat).toMatchObject([{ email: ANNA, name: "anna", text: "Lunch after service?" }]);
    await anna.mutation(api.world.say, { text: "two" });
    await anna.mutation(api.world.say, { text: "three" });
    expect(await anna.mutation(api.world.say, { text: "four" })).toMatchObject({ ok: false });
    expect((await rows(t)).chat).toHaveLength(3);
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
    expect(seen!.members.find((m) => m.memberId === a.memberId)!.look).toEqual(look);
    // Saving again straight away writes nothing.
    expect(await anna.mutation(api.world.saveLook, { look: { ...look, hat: 0 } })).toEqual({ ok: false });
    later(3100);
    expect(await anna.mutation(api.world.saveLook, { look: { ...look, hat: 0 } })).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.query("worldLooks").collect())).toHaveLength(1);
    await anna.mutation(api.world.leave, {});
    await anna.mutation(api.world.join, {});
    expect((await rows(t)).members.find((m) => m.email === ANNA)!.look).toEqual({ ...look, hat: 0 });
  });

  test("turns away a choice that doesn't exist", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    for (const bad of [{ ...look, skin: 8 }, { ...look, hat: -1 }, { ...look, shirt: 1.5 }, { ...look, accessory: 4 }]) {
      await expect(anna.mutation(api.world.saveLook, { look: bad })).rejects.toThrow(/doesn't exist/);
    }
    await expect(t.mutation(api.world.saveLook, { look })).rejects.toThrow(/signed in/);
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
    expect(await anna.query(api.world.chatLog, { roomId: a.roomId })).toMatchObject([{ name: "ben", text: "hi", isMe: false }]);

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
    expect(await anna.query(api.world.chatLog, { roomId: a.roomId })).toEqual([]);

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
    for (let i = 0; i < 12; i++) {
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
    expect((await rows(t)).chat).toHaveLength(0);

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
    expect(await anna.query(api.world.chatLog, { roomId: a.roomId })).toMatchObject([{ text: "older but fine" }]);
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
        for (let i = 0; i < CHAT_ROOM_CAP; i++) {
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

  test("a player at every rate limit makes an estimated 47 document writes a minute at most, in a room under the chat cap", async () => {
    // Tapping four times a second, an emote and a line every 2 seconds, in a
    // room that stays under CHAT_ROOM_CAP lines (7 minutes of lines).
    const flat = await simulate({ move: 240, act: 30, say: 30 }, 7);
    expect(flat.chatDeletes).toBe(0);
    // 20 moves + 10 emotes + 6 lines (two writes each) + 3 presence marks,
    // plus the first minute's bursts spread over the ten.
    expect(flat.writesPerMinute).toBeLessThanOrEqual(47);
    expect(flat.writesPerMinute).toBeGreaterThan(44);
  }, 120_000);

  test("in a room already at the chat cap, each line also deletes one: at most 53 a minute", async () => {
    const busy = await simulate({ move: 240, act: 30, say: 30 }, 10, true);
    expect(busy.chatDeletes).toBe(busy.chatWrites);
    expect(busy.writesPerMinute).toBeLessThanOrEqual(53);
    expect(busy.writesPerMinute).toBeGreaterThan(50);
  }, 120_000);

  test("a typical player makes an estimated 15 document writes a minute", async () => {
    const typical = await simulate({ move: 8, act: 1, say: 2 }, 10);
    expect(typical.writesPerMinute).toBeLessThanOrEqual(16);
    expect(typical.mutationsPerMinute).toBe(11);
  }, 120_000);
});

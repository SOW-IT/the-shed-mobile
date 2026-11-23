import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import {
  ASK_MS,
  CHAT_LOG_SIZE,
  CHAT_ROOM_CAP,
  CHAT_TTL_MS,
  cleanLine,
  cleanPoke,
  OFFLINE_LIST_SIZE,
  POKE_EVERY_MS,
  POKED_GAP_MS,
  tagName,
  arrivalSpot,
  ELSEWHERE_NAMES,
  seatIn,
  isPlace,
  PLACES,
  type Place,
  clampTarget,
  distance,
  fullBucket,
  INTERACT_RADIUS,
  isEmote,
  isMutual,
  isValidLook,
  LOOK_SAVE_GAP_MS,
  MAX_BLOCKS,
  lookFor,
  posAt,
  PRESENCE_TOUCH_MS,
  PRESENCE_TTL_MS,
  REPORT_CONTEXT_LINES,
  REPORT_OWN_LINES,
  REPORT_WINDOW_MS,
  REPORTS_PER_WINDOW,
  ROOM_CAP,
  spawnFor,
  SWEEP_EVERY_MS,
  takeToken,
  THROTTLE_KEEP_MS,
  WORLD_PLACE,
  type BucketKind,
} from "../shared/world";
import { worldAskValidator, worldLookValidator, worldReplyValidator, worldWalkFields } from "./worldData";
import { Ctx, currentStaffYear, requireEmail, resolveName } from "./model";

// Shed World, the Garden. See docs/context/world.md for the write budget.
// Every mutation writes at most the caller's own state row, plus their
// presence mark at most once every PRESENCE_TOUCH_MS, plus one chat line for
// `say`. An action the rate limit turns away writes nothing.

/** Rooms of one place looked at when picking one with space. */
const ROOM_SCAN = 50;
/** Rows the sweeper deletes of each kind per run. */
const SWEEP_BATCH = 50;

const nameFor = async (ctx: Ctx, email: string): Promise<string> => {
  const resolved = await resolveName(ctx, email, currentStaffYear());
  if (resolved) return resolved;
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return user?.name?.trim() || email.split("@")[0];
};

const savedLook = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldLooks")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

const memberByEmail = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldMembers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

const stateOf = (ctx: Ctx, memberId: Id<"worldMembers">) =>
  ctx.db
    .query("worldState")
    .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
    .unique();

const presenceOf = (ctx: Ctx, memberId: Id<"worldMembers">) =>
  ctx.db
    .query("worldPresence")
    .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
    .unique();

const blocks = async (ctx: Ctx, email: string, other: string) =>
  (await ctx.db
    .query("worldBlocks")
    .withIndex("by_email_and_blockedEmail", (q) => q.eq("email", email).eq("blockedEmail", other))
    .first()) !== null;

/** Whether either of two people has blocked the other. */
const blockedEither = async (ctx: Ctx, a: string, b: string) =>
  a !== b && ((await blocks(ctx, a, b)) || (await blocks(ctx, b, a)));

/** The caller's member and state rows. Throws when they aren't in the world. */
const requireMe = async (ctx: MutationCtx) => {
  const email = await requireEmail(ctx);
  const member = await memberByEmail(ctx, email);
  const state = member && (await stateOf(ctx, member._id));
  if (!member || !state) throw new ConvexError("You've left the garden. Open it again to come back.");
  return { email, member, state };
};

/** Marks a member present, unless they were marked moments ago. */
const touchPresence = async (ctx: MutationCtx, memberId: Id<"worldMembers">, now: number) => {
  const presence = await presenceOf(ctx, memberId);
  if (!presence) await ctx.db.insert("worldPresence", { memberId, lastSeen: now });
  else if (now - presence.lastSeen >= PRESENCE_TOUCH_MS) {
    await ctx.db.patch("worldPresence", presence._id, { lastSeen: now });
  }
};

/**
 * Takes someone out of the Garden for good when their account is deleted:
 * their member, state and presence go, the room count follows, and no rate
 * limits are kept (they'd hold the deleted email).
 */
export const removeFromWorld = async (ctx: MutationCtx, email: string) => {
  const member = await memberByEmail(ctx, email);
  if (member) await removeMember(ctx, member, { keepLimits: false });
};

const visitorOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldVisitors")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

const markSeen = async (ctx: MutationCtx, email: string, name: string, now: number) => {
  const row = await visitorOf(ctx, email);
  if (row) await ctx.db.patch("worldVisitors", row._id, { name, lastSeenAt: now });
  else await ctx.db.insert("worldVisitors", { email, name, lastSeenAt: now });
};

const throttleOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldThrottle")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

/**
 * Takes everything of one member out of the world, and their room if it
 * empties. Their rate limits are kept for a while, so coming straight back
 * doesn't refill them.
 */
const removeMember = async (ctx: MutationCtx, member: Doc<"worldMembers">, { keepLimits = true } = {}) => {
  const state = await stateOf(ctx, member._id);
  if (state && keepLimits) {
    const { moveBucket, actBucket, sayBucket } = state;
    const now = Date.now();
    const kept = await throttleOf(ctx, member.email);
    if (kept) await ctx.db.patch("worldThrottle", kept._id, { moveBucket, actBucket, sayBucket, at: now });
    else {
      await ctx.db.insert("worldThrottle", {
        email: member.email,
        moveBucket,
        actBucket,
        sayBucket,
        joinBucket: fullBucket("join", now),
        at: now,
      });
    }
  }
  if (keepLimits) await markSeen(ctx, member.email, member.name, Date.now());
  if (state) await ctx.db.delete("worldState", state._id);
  const presence = await presenceOf(ctx, member._id);
  if (presence) await ctx.db.delete("worldPresence", presence._id);
  await ctx.db.delete("worldMembers", member._id);
  const room = await ctx.db.get("worldRooms", member.roomId);
  if (!room) return;
  if (room.memberCount <= 1) await ctx.db.delete("worldRooms", room._id);
  else await ctx.db.patch("worldRooms", room._id, { memberCount: room.memberCount - 1 });
};

const sweeperMeta = (ctx: Ctx) =>
  ctx.db
    .query("worldMeta")
    .withIndex("by_key", (q) => q.eq("key", "sweeper"))
    .unique();

/**
 * Makes sure a sweep is coming. The sweeper reschedules itself while anyone
 * is in the world and stops when it's empty, so an empty world costs nothing.
 */
const ensureSweeper = async (ctx: MutationCtx, now: number) => {
  const meta = await sweeperMeta(ctx);
  // A run is due soon, and not overdue enough to have been lost. One booked
  // far ahead (for the last chat lines to expire) is too late for presence.
  if (meta?.sweepAt !== undefined && meta.sweepAt > now - SWEEP_EVERY_MS && meta.sweepAt <= now + SWEEP_EVERY_MS) return;
  const sweepAt = now + SWEEP_EVERY_MS;
  if (meta) await ctx.db.patch("worldMeta", meta._id, { sweepAt });
  else await ctx.db.insert("worldMeta", { key: "sweeper", sweepAt });
  await ctx.scheduler.runAt(sweepAt, internal.world.sweep, {});
};

const placeOf = (member: Doc<"worldMembers">): Place => (isPlace(member.place) ? member.place : WORLD_PLACE);

const roomWithSpace = async (ctx: MutationCtx, place: Place = WORLD_PLACE): Promise<Doc<"worldRooms">> => {
  const rooms = await ctx.db
    .query("worldRooms")
    .withIndex("by_place_and_instance", (q) => q.eq("place", place))
    .take(ROOM_SCAN);
  const open = rooms.find((room) => room.memberCount < ROOM_CAP);
  if (open) return open;
  let instance = 1;
  if (rooms.length < ROOM_SCAN) {
    // Every room was seen: the lowest instance number none is using.
    const used = new Set(rooms.map((room) => room.instance));
    while (used.has(instance)) instance++;
  } else {
    // More rooms than the scan: one past the highest, which is never taken.
    const highest = await ctx.db
      .query("worldRooms")
      .withIndex("by_place_and_instance", (q) => q.eq("place", place))
      .order("desc")
      .first();
    instance = (highest?.instance ?? 0) + 1;
  }
  const roomId = await ctx.db.insert("worldRooms", { place, instance, memberCount: 0 });
  return (await ctx.db.get("worldRooms", roomId))!;
};

/**
 * Enters the garden: the first room with space, or a new one. Someone already
 * in it (another tab, or a phone that lost signal) keeps their place.
 */
export const join = mutation({
  args: {},
  returns: v.object({
    roomId: v.id("worldRooms"),
    memberId: v.id("worldMembers"),
    instance: v.number(),
    place: v.string(),
    serverNow: v.number(),
  }),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    let member = await memberByEmail(ctx, email);
    if (member && !(await stateOf(ctx, member._id))) {
      await removeMember(ctx, member);
      member = null;
    }
    let room = member && (await ctx.db.get("worldRooms", member.roomId));
    if (!member || !room) {
      if (member) await removeMember(ctx, member);
      // Back soon after leaving: the rate limits carry on where they were,
      // and joining itself is limited.
      const kept = await throttleOf(ctx, email);
      let buckets = { moveBucket: fullBucket("move", now), actBucket: fullBucket("act", now), sayBucket: fullBucket("say", now) };
      if (kept) {
        const token = takeToken("join", kept.joinBucket, now);
        if (!token.ok) {
          throw new ConvexError(`You've come and gone a few times. Try again in ${Math.ceil(token.retryInMs / 1000)}s.`);
        }
        await ctx.db.patch("worldThrottle", kept._id, { joinBucket: token.bucket, at: now });
        buckets = { moveBucket: kept.moveBucket, actBucket: kept.actBucket, sayBucket: kept.sayBucket };
      }
      room = await roomWithSpace(ctx);
      const memberId = await ctx.db.insert("worldMembers", {
        roomId: room._id,
        email,
        name: await nameFor(ctx, email),
        look: (await savedLook(ctx, email))?.look ?? lookFor(email),
        joinedAt: now,
      });
      const spawn = spawnFor(email);
      await ctx.db.insert("worldState", {
        memberId,
        fromX: spawn.x,
        fromZ: spawn.z,
        toX: spawn.x,
        toZ: spawn.z,
        startedAt: now,
        ...buckets,
      });
      await ctx.db.patch("worldRooms", room._id, { memberCount: room.memberCount + 1 });
      member = (await ctx.db.get("worldMembers", memberId))!;
      await markSeen(ctx, email, member.name, now);
    } else {
      // Another tab or device joining the same member: count the visit.
      await ctx.db.patch("worldMembers", member._id, { visits: (member.visits ?? 1) + 1 });
    }
    await touchPresence(ctx, member._id, now);
    await ensureSweeper(ctx, now);
    return { roomId: room._id, memberId: member._id, instance: room.instance, place: placeOf(member), serverNow: now };
  },
});

/**
 * Ends one visit. The member goes when their last visit does (another tab
 * may still be open). A phone that can't say goodbye is swept later.
 */
export const leave = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const member = await memberByEmail(ctx, email);
    if (!member) return null;
    const visits = member.visits ?? 1;
    if (visits > 1) await ctx.db.patch("worldMembers", member._id, { visits: visits - 1 });
    else await removeMember(ctx, member);
    return null;
  },
});

const turnedAway = v.object({ ok: v.literal(false), retryInMs: v.number(), serverNow: v.number() });

const spend = (kind: Exclude<BucketKind, "join">, state: Doc<"worldState">, now: number) =>
  takeToken(kind, state[`${kind}Bucket`], now);

/**
 * Walks to a spot: one write per tap. The walk starts where the server says
 * the person is now, so nobody can teleport, and ends inside the courtyard.
 */
export const move = mutation({
  args: { toX: v.number(), toZ: v.number() },
  returns: v.union(v.object({ ok: v.literal(true), ...worldWalkFields, serverNow: v.number() }), turnedAway),
  handler: async (ctx, { toX, toZ }) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const token = spend("move", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const from = posAt(state, now);
    const to = clampTarget(toX, toZ, placeOf(member));
    const walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: now };
    await ctx.db.patch("worldState", state._id, { ...walk, away: undefined, seat: undefined, moveBucket: token.bucket });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, ...walk, serverNow: now };
  },
});

export const sit = mutation({
  args: { seat: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), ...worldWalkFields, serverNow: v.number() }), turnedAway),
  handler: async (ctx, args) => {
    const { member, state } = await requireMe(ctx);
    const seat = seatIn(placeOf(member), args.seat);
    if (!seat) throw new ConvexError("That isn't somewhere you can sit.");
    const now = Date.now();
    const token = spend("move", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const from = posAt(state, now);
    const walk = { fromX: from.x, fromZ: from.z, toX: seat.x, toZ: seat.z, startedAt: now };
    await ctx.db.patch("worldState", state._id, { ...walk, away: undefined, seat: seat.id, moveBucket: token.bucket });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, ...walk, serverNow: now };
  },
});

const done = v.union(v.object({ ok: v.literal(true), serverNow: v.number() }), turnedAway);

export const travel = mutation({
  args: { to: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      roomId: v.id("worldRooms"),
      instance: v.number(),
      place: v.string(),
      ...worldWalkFields,
      serverNow: v.number(),
    }),
    turnedAway
  ),
  handler: async (ctx, { to }) => {
    if (!isPlace(to)) throw new ConvexError("That isn't somewhere you can go.");
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const from = placeOf(member);
    const here = (await ctx.db.get("worldRooms", member.roomId))!;
    if (from === to) {
      const { fromX, fromZ, toX, toZ, startedAt } = state;
      return { ok: true as const, roomId: here._id, instance: here.instance, place: from, fromX, fromZ, toX, toZ, startedAt, serverNow: now };
    }
    const token = spend("act", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const room = await roomWithSpace(ctx, to);
    await ctx.db.patch("worldRooms", room._id, { memberCount: room.memberCount + 1 });
    if (here.memberCount <= 1) await ctx.db.delete("worldRooms", here._id);
    else await ctx.db.patch("worldRooms", here._id, { memberCount: here.memberCount - 1 });
    await ctx.db.patch("worldMembers", member._id, { roomId: room._id, place: to });
    const spot = arrivalSpot(from, to);
    const walk = { fromX: spot.x, fromZ: spot.z, toX: spot.x, toZ: spot.z, startedAt: now };
    await ctx.db.patch("worldState", state._id, {
      ...walk,
      say: undefined,
      ask: undefined,
      reply: undefined,
      answered: undefined,
      away: undefined,
      seat: undefined,
      actBucket: token.bucket,
    });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, roomId: room._id, instance: room.instance, place: to, ...walk, serverNow: now };
  },
});

const BLOCKED_BY_SCAN = 200;

export const elsewhere = query({
  args: {},
  returns: v.array(v.object({ place: v.string(), count: v.number(), names: v.array(v.string()) })),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const me = await memberByEmail(ctx, email);
    const hidden = new Set<string>([email]);
    const mine = await ctx.db
      .query("worldBlocks")
      .withIndex("by_email_and_blockedEmail", (q) => q.eq("email", email))
      .take(MAX_BLOCKS);
    for (const row of mine) hidden.add(row.blockedEmail);
    const ofMe = await ctx.db
      .query("worldBlocks")
      .withIndex("by_blockedEmail", (q) => q.eq("blockedEmail", email))
      .take(BLOCKED_BY_SCAN + 1);
    for (const row of ofMe) hidden.add(row.email);
    const askEach = ofMe.length > BLOCKED_BY_SCAN;
    const found = [];
    for (const place of PLACES) {
      const rooms = await ctx.db
        .query("worldRooms")
        .withIndex("by_place_and_instance", (q) => q.eq("place", place))
        .take(ROOM_SCAN);
      const names: string[] = [];
      let count = 0;
      for (const room of rooms) {
        if (room._id === me?.roomId) continue;
        const members = await ctx.db
          .query("worldMembers")
          .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
          .take(ROOM_CAP);
        for (const member of members) {
          if (hidden.has(member.email)) continue;
          if (askEach && (await blocks(ctx, member.email, email))) continue;
          count++;
          if (names.length < ELSEWHERE_NAMES) names.push(member.name);
        }
      }
      if (count > 0) found.push({ place, count, names });
    }
    return found;
  },
});

export const places = query({
  args: {},
  returns: v.record(v.string(), v.number()),
  handler: async (ctx) => {
    await requireEmail(ctx);
    const counts: Record<string, number> = {};
    for (const place of PLACES) {
      const rooms = await ctx.db
        .query("worldRooms")
        .withIndex("by_place_and_instance", (q) => q.eq("place", place))
        .take(ROOM_SCAN);
      counts[place] = rooms.reduce((total, room) => total + room.memberCount, 0);
    }
    return counts;
  },
});

export const away = mutation({
  args: { at: v.union(v.literal("arcade"), v.null()) },
  returns: done,
  handler: async (ctx, { at }) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    if ((state.away ?? null) === at) return { ok: true as const, serverNow: now };
    if (at === null) await ctx.db.patch("worldState", state._id, { away: undefined });
    else {
      const token = spend("act", state, now);
      if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
      await ctx.db.patch("worldState", state._id, { away: at, actBucket: token.bucket });
    }
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, serverNow: now };
  },
});

/** An emote over your head, played on every phone. */
export const act = mutation({
  args: { emote: v.string() },
  returns: done,
  handler: async (ctx, { emote }) => {
    if (!isEmote(emote)) throw new ConvexError("That emote isn't one of the choices.");
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const token = spend("act", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    await ctx.db.patch("worldState", state._id, { act: { emote, at: now }, actBucket: token.bucket });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, serverNow: now };
  },
});

/** A chat line: the bubble over your head, and a line in the room's log. */
export const say = mutation({
  args: { text: v.string() },
  returns: done,
  handler: async (ctx, args) => {
    const text = cleanLine(args.text);
    if (!text) throw new ConvexError("Write something first.");
    const { email, member, state } = await requireMe(ctx);
    const now = Date.now();
    // The same line again straight after is a double tap, not a new line.
    if (state.say?.text === text && now - state.say.at < 5000) return { ok: true as const, serverNow: now };
    const token = spend("say", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    await ctx.db.patch("worldState", state._id, { say: { text, at: now }, sayBucket: token.bucket });
    await ctx.db.insert("worldChat", { roomId: member.roomId, memberId: member._id, email, name: member.name, text, at: now });
    // Keep the room within CHAT_ROOM_CAP lines as each one arrives.
    const lines = await ctx.db
      .query("worldChat")
      .withIndex("by_roomId_and_at", (q) => q.eq("roomId", member.roomId))
      .order("desc")
      .take(CHAT_ROOM_CAP + 5);
    for (const row of lines.slice(CHAT_ROOM_CAP)) await ctx.db.delete("worldChat", row._id);
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, serverNow: now };
  },
});

const refused = v.object({ ok: v.literal(false), reason: v.string(), serverNow: v.number() });

/**
 * Someone else in the caller's room, close enough for a mutual action, and
 * neither has blocked the other. Returns why not, or both state rows.
 */
type Partner = { reason: string } | { reason?: undefined; other: Doc<"worldMembers">; otherState: Doc<"worldState"> };

const partner = async (
  ctx: MutationCtx,
  me: Awaited<ReturnType<typeof requireMe>>,
  otherId: Id<"worldMembers">,
  now: number
): Promise<Partner> => {
  const other = await ctx.db.get("worldMembers", otherId);
  const otherState = other && (await stateOf(ctx, other._id));
  if (!other || !otherState || other.roomId !== me.member.roomId) return { reason: "They've left the garden." };
  if (other._id === me.member._id) return { reason: "That's you." };
  if (await blockedEither(ctx, me.email, other.email)) return { reason: "They've left the garden." };
  if (otherState.away) return { reason: "They're playing at the arcade." };
  if (distance(posAt(me.state, now), posAt(otherState, now)) > INTERACT_RADIUS) return { reason: "Get a bit closer first." };
  return { other, otherState };
};

/**
 * Asks someone nearby for a mutual action ("High five?"). One write, on the
 * caller's own row, which everyone in the room already receives. It lapses
 * after ASK_MS; declining writes nothing.
 */
export const ask = mutation({
  args: { to: v.id("worldMembers"), kind: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), at: v.number(), serverNow: v.number() }), turnedAway, refused),
  handler: async (ctx, { to, kind }) => {
    if (!isMutual(kind)) throw new ConvexError("That isn't something you can do together.");
    const me = await requireMe(ctx);
    const now = Date.now();
    const found = await partner(ctx, me, to, now);
    if (found.reason !== undefined) return { ok: false as const, reason: found.reason, serverNow: now };
    const token = spend("act", me.state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    await ctx.db.patch("worldState", me.state._id, { ask: { kind, to, at: now }, actBucket: token.bucket });
    await touchPresence(ctx, me.member._id, now);
    return { ok: true as const, at: now, serverNow: now };
  },
});

/**
 * Accepts an ask made of the caller, while it's still open and they're
 * still close. One write, on the caller's own row; every phone plays the
 * action from the ask and this answer together.
 */
export const accept = mutation({
  // `askAt` is the ask the prompt showed, so a tap never accepts a newer one.
  args: { from: v.id("worldMembers"), askAt: v.number() },
  returns: v.union(v.object({ ok: v.literal(true), at: v.number(), serverNow: v.number() }), turnedAway, refused),
  handler: async (ctx, { from, askAt }) => {
    const me = await requireMe(ctx);
    const now = Date.now();
    const found = await partner(ctx, me, from, now);
    if (found.reason !== undefined) return { ok: false as const, reason: found.reason, serverNow: now };
    const asked = found.otherState.ask;
    if (!asked || asked.to !== me.member._id || asked.at !== askAt || now - asked.at >= ASK_MS) {
      return { ok: false as const, reason: "That's gone. Ask them again.", serverNow: now };
    }
    // One answer per ask, however many others came between: accepting it
    // again returns the first answer and spends nothing.
    const open = (me.state.answered ?? []).filter((a) => now - a.askAt < ASK_MS);
    const before = open.find((a) => a.to === from && a.askAt === asked.at);
    if (before) return { ok: true as const, at: before.at, serverNow: now };
    const token = spend("act", me.state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const reply = { kind: asked.kind, to: from, askAt: asked.at, at: now };
    await ctx.db.patch("worldState", me.state._id, { reply, answered: [...open, reply], actBucket: token.bucket });
    await touchPresence(ctx, me.member._id, now);
    return { ok: true as const, at: now, serverNow: now };
  },
});

/**
 * "Still here", sent only after HEARTBEAT_IDLE_MS without another action.
 * `present: false` tells the app it was swept and should join again.
 */
export const heartbeat = mutation({
  args: {},
  returns: v.object({ present: v.boolean(), serverNow: v.number() }),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const member = await memberByEmail(ctx, email);
    if (!member) return { present: false, serverNow: now };
    await touchPresence(ctx, member._id, now);
    return { present: true, serverNow: now };
  },
});

/** The caller's member row, when they're in this room. */
const meIn = async (ctx: Ctx, roomId: Id<"worldRooms">) => {
  const email = await requireEmail(ctx);
  const member = await memberByEmail(ctx, email);
  return member?.roomId === roomId ? member : null;
};

/**
 * Who's in the room, without anyone blocked either way. Changes only when
 * someone joins or leaves. Null when the caller isn't in the room.
 */
export const roster = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(
    v.null(),
    v.object({
      instance: v.number(),
      place: v.string(),
      members: v.array(
        v.object({ memberId: v.id("worldMembers"), name: v.string(), look: worldLookValidator, isMe: v.boolean() })
      ),
    })
  ),
  handler: async (ctx, { roomId }) => {
    const me = await meIn(ctx, roomId);
    const room = me && (await ctx.db.get("worldRooms", roomId));
    if (!me || !room) return null;
    const rows = await ctx.db
      .query("worldMembers")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .take(ROOM_CAP);
    const members = [];
    for (const row of rows) {
      if (await blockedEither(ctx, me.email, row.email)) continue;
      const look = (await savedLook(ctx, row.email))?.look ?? row.look;
      members.push({ memberId: row._id, name: row.name, look, isMe: row._id === me._id });
    }
    return { instance: room.instance, place: room.place, members };
  },
});

/**
 * One member's walk, emote and line. Each phone subscribes once per person,
 * so a tap pushes one small row, not the whole room.
 */
export const state = query({
  args: { memberId: v.id("worldMembers") },
  returns: v.union(
    v.null(),
    v.object({
      ...worldWalkFields,
      act: v.optional(v.object({ emote: v.string(), at: v.number() })),
      say: v.optional(v.object({ text: v.string(), at: v.number() })),
      ask: v.optional(worldAskValidator),
      reply: v.optional(worldReplyValidator),
      // The asks this person accepted that are still open (which ask and
      // when, nothing more), so an asker sees their ask was answered even
      // after the other person accepted someone else's too.
      answered: v.optional(v.array(worldReplyValidator)),
      away: v.optional(v.literal("arcade")),
      seat: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get("worldMembers", memberId);
    const me = member && (await meIn(ctx, member.roomId));
    if (!member || !me || (await blockedEither(ctx, me.email, member.email))) return null;
    const row = await stateOf(ctx, memberId);
    if (!row) return null;
    const { fromX, fromZ, toX, toZ, startedAt, act, say, ask, reply, answered, away: awayAt, seat } = row;
    return { fromX, fromZ, toX, toZ, startedAt, act, say, ask, reply, answered, away: awayAt, seat };
  },
});

/** The room's latest lines, newest first, for the list view. */
export const chatLog = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(
    v.null(),
    v.array(
      v.object({
        id: v.id("worldChat"),
        memberId: v.id("worldMembers"),
        name: v.string(),
        text: v.string(),
        at: v.number(),
        isMe: v.boolean(),
      })
    )
  ),
  handler: async (ctx, { roomId }) => {
    const me = await meIn(ctx, roomId);
    if (!me) return null;
    // Lines past the chat TTL aren't shown, even before the sweeper deletes
    // them. Read the whole room (it holds CHAT_ROOM_CAP at most) and keep the
    // newest CHAT_LOG_SIZE from people nobody has blocked.
    const rows = await ctx.db
      .query("worldChat")
      .withIndex("by_roomId_and_at", (q) => q.eq("roomId", roomId).gt("at", Date.now() - CHAT_TTL_MS))
      .order("desc")
      .take(CHAT_ROOM_CAP);
    const lines = [];
    const hidden = new Map<string, boolean>();
    for (const row of rows) {
      if (lines.length === CHAT_LOG_SIZE) break;
      if (!hidden.has(row.email)) hidden.set(row.email, await blockedEither(ctx, me.email, row.email));
      if (hidden.get(row.email)) continue;
      lines.push({ id: row._id, memberId: row.memberId, name: row.name, text: row.text, at: row.at, isMe: row.email === me.email });
    }
    return lines;
  },
});

/**
 * Saves the caller's look from the character editor: one write, kept across
 * visits. The roster reads it, so everyone in the room sees it at once.
 */
export const saveLook = mutation({
  args: { look: worldLookValidator },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { look }) => {
    const email = await requireEmail(ctx);
    if (!isValidLook(look)) throw new ConvexError("That look has a choice that doesn't exist.");
    const now = Date.now();
    const row = await savedLook(ctx, email);
    if (!row) await ctx.db.insert("worldLooks", { email, look, updatedAt: now });
    else if (now - row.updatedAt < LOOK_SAVE_GAP_MS) return { ok: false };
    else await ctx.db.patch("worldLooks", row._id, { look, updatedAt: now });
    return { ok: true };
  },
});

/** Never see someone in the world again, and they never see you. */
export const block = mutation({
  args: { memberId: v.id("worldMembers") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const email = await requireEmail(ctx);
    const other = await ctx.db.get("worldMembers", memberId);
    if (!other) throw new ConvexError("They've already left the garden.");
    if (other.email === email) throw new ConvexError("You can't block yourself.");
    if (!(await blocks(ctx, email, other.email))) {
      const mine = await ctx.db
        .query("worldBlocks")
        .withIndex("by_email_and_blockedEmail", (q) => q.eq("email", email))
        .take(MAX_BLOCKS);
      if (mine.length >= MAX_BLOCKS) throw new ConvexError(`You've blocked ${MAX_BLOCKS} people. Unblock someone under People here first.`);
      await ctx.db.insert("worldBlocks", { email, blockedEmail: other.email, blockedName: other.name });
    }
    return null;
  },
});

export const unblock = mutation({
  args: { blockId: v.id("worldBlocks") },
  returns: v.null(),
  handler: async (ctx, { blockId }) => {
    const email = await requireEmail(ctx);
    const row = await ctx.db.get("worldBlocks", blockId);
    if (row?.email === email) await ctx.db.delete("worldBlocks", blockId);
    return null;
  },
});

/** The people the caller has blocked. */
export const myBlocks = query({
  args: {},
  returns: v.array(v.object({ id: v.id("worldBlocks"), name: v.string() })),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const rows = await ctx.db
      .query("worldBlocks")
      .withIndex("by_email_and_blockedEmail", (q) => q.eq("email", email))
      .take(MAX_BLOCKS);
    return rows.map((row) => ({ id: row._id, name: row.blockedName }));
  },
});

const OFFLINE_SCAN_MAX = 200;

export const offline = query({
  args: {},
  returns: v.object({
    people: v.array(v.object({ id: v.id("worldVisitors"), name: v.string(), lastSeenAt: v.number() })),
    pokeAgainAt: v.number(),
  }),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const people = [];
    let scanned = 0;
    for await (const row of ctx.db.query("worldVisitors").withIndex("by_lastSeenAt").order("desc")) {
      if (people.length === OFFLINE_LIST_SIZE || scanned === OFFLINE_SCAN_MAX) break;
      scanned++;
      if (row.email === email) continue;
      if (await memberByEmail(ctx, row.email)) continue;
      if (await blockedEither(ctx, email, row.email)) continue;
      people.push({ id: row._id, name: row.name, lastSeenAt: row.lastSeenAt });
    }
    const mine = await visitorOf(ctx, email);
    return { people, pokeAgainAt: mine?.lastPokeAt === undefined ? 0 : mine.lastPokeAt + POKE_EVERY_MS };
  },
});

export const poke = mutation({
  args: { visitorId: v.id("worldVisitors"), message: v.optional(v.string()) },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), retryInMs: v.number() })),
  handler: async (ctx, args) => {
    const me = await requireMe(ctx);
    const now = Date.now();
    const target = await ctx.db.get("worldVisitors", args.visitorId);
    if (!target || target.email === me.email || (await blockedEither(ctx, me.email, target.email))) {
      throw new ConvexError("They can't be poked right now.");
    }
    if (await memberByEmail(ctx, target.email)) throw new ConvexError(`${tagName(target.name)} is already in the garden.`);
    if (target.lastPokedAt !== undefined && now - target.lastPokedAt < POKED_GAP_MS) {
      throw new ConvexError(`${tagName(target.name)} was poked a moment ago. Give them a few minutes.`);
    }
    const mine = await visitorOf(ctx, me.email);
    const waited = now - (mine?.lastPokeAt ?? 0);
    if (waited < POKE_EVERY_MS) return { ok: false as const, retryInMs: POKE_EVERY_MS - waited };
    await markSeen(ctx, me.email, me.member.name, now);
    await ctx.db.patch("worldVisitors", (await visitorOf(ctx, me.email))!._id, { lastPokeAt: now });
    await ctx.db.patch("worldVisitors", target._id, { lastPokedAt: now });
    const title = `${tagName(me.member.name)} poked you`;
    const body = (args.message === undefined ? null : cleanPoke(args.message)) ?? "Come and join me in the Garden.";
    await ctx.db.insert("notifications", { userEmail: target.email, title, body, url: "/world", read: false });
    await ctx.scheduler.runAfter(0, internal.push.send, { to: target.email, title, body, url: "/world" });
    return { ok: true as const };
  },
});

/**
 * Reports someone, copying their recent lines and the room's around them, so
 * the report outlives the 15-minute chat.
 */
export const report = mutation({
  args: { memberId: v.id("worldMembers"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const reason = Array.from(args.reason.trim()).slice(0, 500).join("");
    if (!reason) throw new ConvexError("Say what happened.");
    const other = await ctx.db.get("worldMembers", args.memberId);
    if (!other) throw new ConvexError("They've already left the garden.");
    if (other.email === email) throw new ConvexError("You can't report yourself.");
    const now = Date.now();
    const recent = await ctx.db
      .query("worldReports")
      .withIndex("by_reporterEmail_and_createdAt", (q) =>
        q.eq("reporterEmail", email).gt("createdAt", now - REPORT_WINDOW_MS)
      )
      .take(REPORTS_PER_WINDOW);
    if (recent.length >= REPORTS_PER_WINDOW) {
      throw new ConvexError("You've sent a lot of reports. Try again in a few minutes, or talk to a leader.");
    }
    const room = await ctx.db.get("worldRooms", other.roomId);
    // Their own latest lines, however busy the room has been since, and the
    // room's latest lines around them, in the order they were said.
    const own = await ctx.db
      .query("worldChat")
      .withIndex("by_roomId_and_email_and_at", (q) =>
        q.eq("roomId", other.roomId).eq("email", other.email).gt("at", now - CHAT_TTL_MS)
      )
      .order("desc")
      .take(REPORT_OWN_LINES);
    // Only lines still inside the chat TTL, as the room would see them.
    const context = await ctx.db
      .query("worldChat")
      .withIndex("by_roomId_and_at", (q) => q.eq("roomId", other.roomId).gt("at", now - CHAT_TTL_MS))
      .order("desc")
      .take(REPORT_CONTEXT_LINES);
    const byId = new Map([...own, ...context].map((row) => [row._id, row]));
    const rows = [...byId.values()].sort((a, b) => a.at - b.at);
    await ctx.db.insert("worldReports", {
      reporterEmail: email,
      reportedEmail: other.email,
      reportedName: other.name,
      place: room?.place ?? WORLD_PLACE,
      instance: room?.instance ?? 0,
      reason,
      lines: rows.map((row) => ({ name: row.name, text: row.text, at: row.at, reported: row.email === other.email })),
      createdAt: now,
    });
    return null;
  },
});

/** Chat lines deleted per run; a full batch schedules another run straight away. */
const CHAT_PURGE_BATCH = 200;

/** Deletes chat lines past CHAT_TTL_MS. Says whether more may be left. */
const purgeOldChat = async (ctx: MutationCtx, now: number) => {
  const old = await ctx.db
    .query("worldChat")
    .withIndex("by_at", (q) => q.lt("at", now - CHAT_TTL_MS))
    .take(CHAT_PURGE_BATCH);
  for (const row of old) await ctx.db.delete("worldChat", row._id);
  return old.length === CHAT_PURGE_BATCH;
};

/** Carries on deleting expired chat lines until none are left. */
export const purgeChat = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (await purgeOldChat(ctx, Date.now())) await ctx.scheduler.runAfter(0, internal.world.purgeChat, {});
    return null;
  },
});

/**
 * When the sweeper next needs to run: soon while anyone is in, at the next
 * expiry while only chat lines or kept rate limits are left, or never.
 */
const nextSweep = async (ctx: MutationCtx, now: number): Promise<number | undefined> => {
  if ((await ctx.db.query("worldPresence").first()) !== null) return now + SWEEP_EVERY_MS;
  const chat = await ctx.db.query("worldChat").withIndex("by_at").first();
  const kept = await ctx.db.query("worldThrottle").withIndex("by_at").first();
  const due = [chat && chat.at + CHAT_TTL_MS, kept && kept.at + THROTTLE_KEEP_MS].filter((at): at is number => typeof at === "number");
  if (due.length === 0) return undefined;
  return Math.max(Math.min(...due) + 1000, now + SWEEP_EVERY_MS);
};

/**
 * Removes people who went quiet, old chat lines (from the log and from the
 * bubbles on state rows), kept rate limits and empty rooms. Runs every
 * SWEEP_EVERY_MS while anyone is in the world, then once more when the last
 * lines expire, and once a day as a backstop.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("worldPresence")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", now - PRESENCE_TTL_MS))
      .take(SWEEP_BATCH);
    for (const presence of stale) {
      const member = await ctx.db.get("worldMembers", presence.memberId);
      if (member) await removeMember(ctx, member);
      else await ctx.db.delete("worldPresence", presence._id);
    }
    if (await purgeOldChat(ctx, now)) await ctx.scheduler.runAfter(0, internal.world.purgeChat, {});
    const rooms = await ctx.db.query("worldRooms").take(ROOM_SCAN);
    for (const room of rooms) {
      const lines = await ctx.db
        .query("worldChat")
        .withIndex("by_roomId_and_at", (q) => q.eq("roomId", room._id))
        .order("desc")
        .take(CHAT_ROOM_CAP + SWEEP_BATCH);
      for (const row of lines.slice(CHAT_ROOM_CAP)) await ctx.db.delete("worldChat", row._id);
    }
    // A line someone said long ago stays on their state row until they say
    // another; take it off once it's past the chat TTL.
    const oldSay = await ctx.db
      .query("worldState")
      .withIndex("by_say_at", (q) => q.gt("say.at", 0).lt("say.at", now - CHAT_TTL_MS))
      .take(SWEEP_BATCH);
    for (const row of oldSay) await ctx.db.patch("worldState", row._id, { say: undefined });
    const oldThrottles = await ctx.db
      .query("worldThrottle")
      .withIndex("by_at", (q) => q.lt("at", now - THROTTLE_KEEP_MS))
      .take(SWEEP_BATCH);
    for (const row of oldThrottles) await ctx.db.delete("worldThrottle", row._id);

    const meta = await sweeperMeta(ctx);
    const next = await nextSweep(ctx, now);
    if (next === undefined) {
      if (meta) await ctx.db.patch("worldMeta", meta._id, { sweepAt: undefined });
      return null;
    }
    // The chained run reschedules; the daily backstop only restarts a lost chain.
    if (meta?.sweepAt === undefined || meta.sweepAt <= now + 1000) {
      if (meta) await ctx.db.patch("worldMeta", meta._id, { sweepAt: next });
      else await ctx.db.insert("worldMeta", { key: "sweeper", sweepAt: next });
      await ctx.scheduler.runAt(next, internal.world.sweep, {});
    }
    return null;
  },
});

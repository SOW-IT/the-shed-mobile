import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
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
  arrivalSpot,
  clearSpot,
  coversPadLabel,
  ELSEWHERE_NAMES,
  seatIn,
  isPlace,
  PLACES,
  PLACE_TITLES,
  type Place,
  clampTarget,
  distance,
  fullBucket,
  INTERACT_RADIUS,
  isEmote,
  isAskKind,
  isDuelPick,
  duelWinner,
  DUEL_AGAIN_MS,
  DUEL_FIRST_MS,
  DUEL_MAX_ROUNDS,
  DUEL_PICK_CHANGES,
  DUEL_PICK_ORDER,
  DUEL_REVEAL_MS,
  EMOTE_MS,
  isValidLook,
  LOOK_SAVE_GAP_MS,
  MAX_BLOCKS,
  lookFor,
  withHeight,
  posAt,
  LEAVE_GRACE_MS,
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
  TYPING_REFRESH_MS,
  isPingBars,
  PING_PUBLISH_MS,
  WORLD_PLACE,
  HOME,
  HOME_ARRIVAL,
  ARRIVE_NEAR,
  INVITE_MS,
  POKE_ARRIVAL_MS,
  type StateBucket,
  JOINED_WORLD,
} from "../shared/world";
import { shortName } from "../shared/names";
import { HOME_CAP, homeObstacles } from "../shared/home";
import { BALL_PLACE, ballAt, KICK_GAP_MS, KICK_REACH, kickBall as rollFromKick, kickDirection, restingBall } from "../shared/ball";
import { sanitizePath } from "../shared/worldPath";
import { worldAskValidator, worldLookValidator, worldReplyValidator, worldWalkFields, worldWaypointValidator } from "./worldData";
import { Ctx, currentStaffYear, optionalEmail, requireEmail, resolveName } from "./model";

// Shed World, the Garden. See docs/context/world.md for the write budget.
// Every mutation writes at most the caller's own state row, plus their
// presence mark at most once every PRESENCE_TOUCH_MS, plus one chat line for
// `say`. An action the rate limit turns away writes nothing.

/** Rooms of one place looked at when picking one with space. */
const ROOM_SCAN = 50;
/** Rows the sweeper deletes of each kind per run. */
const SWEEP_BATCH = 50;

export const nameFor = async (ctx: Ctx, email: string): Promise<string> => {
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

export const memberByEmail = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldMembers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

const stateOf = (ctx: Ctx, memberId: Id<"worldMembers">) =>
  ctx.db
    .query("worldState")
    .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
    .unique();

const pingOf = (ctx: Ctx, memberId: Id<"worldMembers">) =>
  ctx.db
    .query("worldPings")
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
export const blockedEither = async (ctx: Ctx, a: string, b: string) =>
  a !== b && ((await blocks(ctx, a, b)) || (await blocks(ctx, b, a)));

/** The caller's member and state rows. Throws when they aren't in the world. */
export const requireMe = async (ctx: MutationCtx) => {
  const email = await requireEmail(ctx);
  const member = await memberByEmail(ctx, email);
  const state = member && (await stateOf(ctx, member._id));
  if (!member || !state) throw new ConvexError("You've left the garden. Open it again to come back.");
  return { email, member, state };
};

/** Marks a member present, unless they were marked moments ago. */
export const touchPresence = async (ctx: MutationCtx, memberId: Id<"worldMembers">, now: number) => {
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
  const now = Date.now();
  for (const home of await ctx.db.query("worldRooms").withIndex("by_owner", (q) => q.eq("owner", email)).take(HOME_CAP)) {
    const guests = await ctx.db
      .query("worldMembers")
      .withIndex("by_roomId", (q) => q.eq("roomId", home._id))
      .take(HOME_CAP);
    for (const guest of guests) {
      const here = await ctx.db.get("worldRooms", home._id);
      const state = await stateOf(ctx, guest._id);
      if (!here || !state) continue;
      const garden = await roomWithSpace(ctx);
      await switchRoom(ctx, guest, here, garden, WORLD_PLACE);
      const { x, z } = await landIn(ctx, garden, spawnFor(guest.email), now, guest._id);
      await ctx.db.patch("worldState", state._id, { fromX: x, fromZ: z, toX: x, toZ: z, startedAt: now, ...FRESH_IN_ROOM });
    }
    if (await ctx.db.get("worldRooms", home._id)) await deleteRoom(ctx, home._id);
  }
};

const visitorOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldVisitors")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

type LeftAt = { lastPlace: Place; lastX: number; lastZ: number };

const markSeen = async (ctx: MutationCtx, email: string, name: string, now: number, leftAt?: LeftAt) => {
  const row = await visitorOf(ctx, email);
  if (row) await ctx.db.patch("worldVisitors", row._id, { name, lastSeenAt: now, ...leftAt });
  else await ctx.db.insert("worldVisitors", { email, name, lastSeenAt: now, ...leftAt });
};

type Arrival = { place: Place; owner?: string; roomId?: Id<"worldRooms">; spot: { x: number; z: number } };

const cameBackTo = (visitor: Doc<"worldVisitors"> | null): Arrival | null => {
  if (!visitor || !isPlace(visitor.lastPlace) || visitor.lastX === undefined || visitor.lastZ === undefined) return null;
  if (visitor.lastPlace === HOME) return { place: HOME, owner: visitor.email, spot: clampTarget(visitor.lastX, visitor.lastZ, HOME) };
  return { place: visitor.lastPlace, spot: clampTarget(visitor.lastX, visitor.lastZ, visitor.lastPlace) };
};

const throttleOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldThrottle")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

type ChatLine = { text: string; kind?: "join" | "leave" };

type Speaker = { memberId: Id<"worldMembers">; roomId: Id<"worldRooms">; place: Place; email: string; name: string };

const speakerOf = (member: Doc<"worldMembers">): Speaker => ({
  memberId: member._id,
  roomId: member.roomId,
  place: placeOf(member),
  email: member.email,
  name: member.name,
});

const addChatLine = async (ctx: MutationCtx, speaker: Speaker, line: ChatLine, now: number) => {
  await ctx.db.insert("worldChat", { ...speaker, at: now, ...line });
  const lines = await ctx.db
    .query("worldChat")
    .withIndex("by_roomId_and_at", (q) => q.eq("roomId", speaker.roomId))
    .order("desc")
    .take(CHAT_ROOM_CAP + 5);
  for (const row of lines.slice(CHAT_ROOM_CAP)) await ctx.db.delete("worldChat", row._id);
};

const joinedLine = (member: Doc<"worldMembers">): ChatLine => ({
  text: placeOf(member) === HOME ? "came in" : JOINED_WORLD,
  kind: "join",
});

const ballOf = (ctx: Ctx, roomId: Id<"worldRooms">) =>
  ctx.db
    .query("worldBalls")
    .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
    .unique();

const deleteRoom = async (ctx: MutationCtx, roomId: Id<"worldRooms">) => {
  const ball = await ballOf(ctx, roomId);
  if (ball) await ctx.db.delete("worldBalls", ball._id);
  await ctx.db.delete("worldRooms", roomId);
};

const LEFT_LINE: ChatLine = { text: "left", kind: "leave" };

const backWithinGrace = (visitor: Doc<"worldVisitors"> | null, now: number) =>
  visitor !== null && now - visitor.lastSeenAt < LEAVE_GRACE_MS;

export const sayLeft = internalMutation({
  args: {
    memberId: v.id("worldMembers"),
    roomId: v.id("worldRooms"),
    place: v.string(),
    email: v.string(),
    name: v.string(),
    leftAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { leftAt, ...speaker }) => {
    if (await memberByEmail(ctx, speaker.email)) return null;
    const visitor = await visitorOf(ctx, speaker.email);
    if (visitor && visitor.lastSeenAt > leftAt) return null;
    const place = isPlace(speaker.place) ? speaker.place : WORLD_PLACE;
    await addChatLine(ctx, { ...speaker, place }, LEFT_LINE, Date.now());
    return null;
  },
});

const leaveWorld = async (ctx: MutationCtx, member: Doc<"worldMembers">) => {
  await removeMember(ctx, member);
  const leftAt = (await visitorOf(ctx, member.email))?.lastSeenAt ?? Date.now();
  await ctx.scheduler.runAfter(LEAVE_GRACE_MS, internal.world.sayLeft, { ...speakerOf(member), leftAt });
};

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
  if (keepLimits) {
    const now = Date.now();
    const spot = state ? posAt(state, now) : null;
    const room = await ctx.db.get("worldRooms", member.roomId);
    const someoneElses = placeOf(member) === HOME && room?.owner !== member.email;
    const leftAt = spot && !someoneElses ? { lastPlace: placeOf(member), lastX: spot.x, lastZ: spot.z } : undefined;
    await markSeen(ctx, member.email, member.name, now, leftAt);
  }
  if (state) await ctx.db.delete("worldState", state._id);
  const presence = await presenceOf(ctx, member._id);
  if (presence) await ctx.db.delete("worldPresence", presence._id);
  const ping = await pingOf(ctx, member._id);
  if (ping) await ctx.db.delete("worldPings", ping._id);
  await ctx.db.delete("worldMembers", member._id);
  const room = await ctx.db.get("worldRooms", member.roomId);
  if (!room) return;
  if (room.memberCount <= 1) await deleteRoom(ctx, room._id);
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

export const placeOf = (member: Doc<"worldMembers">): Place => (isPlace(member.place) ? member.place : WORLD_PLACE);

export const homeOf = async (ctx: Ctx, member: Doc<"worldMembers">): Promise<string | null> => {
  if (placeOf(member) !== HOME) return null;
  return (await ctx.db.get("worldRooms", member.roomId))?.owner ?? null;
};

export const homeRowOf = (ctx: Ctx, owner: string) =>
  ctx.db
    .query("worldHomes")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .unique();

const obstaclesIn = async (ctx: Ctx, member: Doc<"worldMembers">) => {
  const owner = await homeOf(ctx, member);
  return owner ? homeObstacles((await homeRowOf(ctx, owner))?.items ?? []) : [];
};

const liveInvite = async (ctx: Ctx, owner: string, guest: string, now: number) => {
  const row = await ctx.db
    .query("worldInvites")
    .withIndex("by_owner_and_guest", (q) => q.eq("owner", owner).eq("guest", guest))
    .first();
  return row && row.expiresAt > now ? row : null;
};

const mayEnterHome = async (ctx: Ctx, owner: string, email: string, now: number) =>
  owner === email || ((await liveInvite(ctx, owner, email, now)) !== null && !(await blockedEither(ctx, owner, email)));

const homeRoom = async (ctx: MutationCtx, owner: string): Promise<Doc<"worldRooms"> | null> => {
  const found = await ctx.db
    .query("worldRooms")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .first();
  if (found) return found.memberCount < HOME_CAP ? found : null;
  const roomId = await ctx.db.insert("worldRooms", { place: HOME, instance: 1, memberCount: 0, owner });
  return (await ctx.db.get("worldRooms", roomId))!;
};

const roomFor = async (ctx: MutationCtx, place: Place, owner: string | undefined) =>
  place === HOME ? (owner ? await homeRoom(ctx, owner) : null) : await roomWithSpace(ctx, place);

const roomWithSpace = async (ctx: MutationCtx, place: Place = WORLD_PLACE): Promise<Doc<"worldRooms">> => {
  if (place === HOME) return await roomWithSpace(ctx, WORLD_PLACE);
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
const beside = (at: { x: number; z: number }, place: Place, extra: ReturnType<typeof homeObstacles>) =>
  clampTarget(at.x + ARRIVE_NEAR * 0.8, at.z + ARRIVE_NEAR * 0.6, place, extra);

const pokedTo = async (ctx: MutationCtx, email: string, rawId: string, now: number): Promise<Arrival | null> => {
  const pokeId = ctx.db.normalizeId("worldPokes", rawId);
  const poke = pokeId && (await ctx.db.get("worldPokes", pokeId));
  if (!poke || poke.to !== email || now - poke.at > POKE_ARRIVAL_MS || (await blockedEither(ctx, email, poke.from))) return null;
  const poker = await memberByEmail(ctx, poke.from);
  const pokerState = poker && (await stateOf(ctx, poker._id));
  if (poker && pokerState) {
    const place = placeOf(poker);
    const owner = (await homeOf(ctx, poker)) ?? undefined;
    if (!owner || (await mayEnterHome(ctx, owner, email, now))) {
      return { place, owner, roomId: poker.roomId, spot: beside(posAt(pokerState, now), place, await obstaclesIn(ctx, poker)) };
    }
  }
  if (!isPlace(poke.place)) return null;
  if (poke.place === HOME && (!poke.owner || !(await mayEnterHome(ctx, poke.owner, email, now)))) return null;
  const extra = poke.place === HOME && poke.owner ? homeObstacles((await homeRowOf(ctx, poke.owner))?.items ?? []) : [];
  return { place: poke.place, owner: poke.owner, spot: beside({ x: poke.x, z: poke.z }, poke.place, extra) };
};

const invitedTo = async (ctx: MutationCtx, email: string, rawId: string, now: number): Promise<Arrival | null> => {
  const inviteId = ctx.db.normalizeId("worldInvites", rawId);
  const invite = inviteId && (await ctx.db.get("worldInvites", inviteId));
  if (!invite || invite.guest !== email || invite.expiresAt <= now || (await blockedEither(ctx, email, invite.owner))) return null;
  return { place: HOME, owner: invite.owner, spot: { ...HOME_ARRIVAL } };
};

const arrivalRoom = async (ctx: MutationCtx, wanted: Arrival, current?: Doc<"worldRooms">) => {
  const stays = current && current.place === wanted.place && current.owner === wanted.owner;
  if (stays && (wanted.roomId === undefined || wanted.roomId === current._id)) return current;
  const kept = wanted.roomId ? await ctx.db.get("worldRooms", wanted.roomId) : null;
  const cap = wanted.place === HOME ? HOME_CAP : ROOM_CAP;
  if (kept && kept.place === wanted.place && kept.owner === wanted.owner && kept.memberCount < cap) return kept;
  return await roomFor(ctx, wanted.place, wanted.owner);
};

const switchRoom = async (ctx: MutationCtx, member: Doc<"worldMembers">, here: Doc<"worldRooms">, room: Doc<"worldRooms">, place: Place) => {
  await ctx.db.patch("worldRooms", room._id, { memberCount: room.memberCount + 1 });
  if (here.memberCount <= 1) await deleteRoom(ctx, here._id);
  else await ctx.db.patch("worldRooms", here._id, { memberCount: here.memberCount - 1 });
  await ctx.db.patch("worldMembers", member._id, { roomId: room._id, place });
};

const landIn = async (ctx: MutationCtx, room: Doc<"worldRooms">, spot: { x: number; z: number }, now: number, except?: Id<"worldMembers">) => {
  const members = await ctx.db
    .query("worldMembers")
    .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
    .take(ROOM_CAP);
  const taken = [];
  for (const other of members) {
    if (other._id === except) continue;
    const state = await stateOf(ctx, other._id);
    if (state) taken.push(posAt(state, now));
  }
  const place = isPlace(room.place) ? room.place : WORLD_PLACE;
  const extra = room.owner ? homeObstacles((await homeRowOf(ctx, room.owner))?.items ?? []) : [];
  return clearSpot(place, spot, { taken, extra, labels: !coversPadLabel(place, spot) });
};

const FRESH_IN_ROOM = {
  say: undefined,
  ask: undefined,
  reply: undefined,
  answered: undefined,
  away: undefined,
  reading: undefined,
  seat: undefined,
  typing: undefined,
  path: undefined,
};

export const join = mutation({
  args: { poke: v.optional(v.string()), invite: v.optional(v.string()) },
  returns: v.object({
    roomId: v.id("worldRooms"),
    memberId: v.id("worldMembers"),
    instance: v.number(),
    place: v.string(),
    serverNow: v.number(),
  }),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const quietReturn = backWithinGrace(await visitorOf(ctx, email), now);
    let member = await memberByEmail(ctx, email);
    if (member && !(await stateOf(ctx, member._id))) {
      await removeMember(ctx, member);
      member = null;
    }
    let room = member && (await ctx.db.get("worldRooms", member.roomId));
    const askedFor = async () =>
      (args.invite !== undefined ? await invitedTo(ctx, email, args.invite, now) : null) ??
      (args.poke !== undefined ? await pokedTo(ctx, email, args.poke, now) : null);
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
      const wanted = (await askedFor()) ?? cameBackTo(await visitorOf(ctx, email));
      const wantedRoom = wanted && (await arrivalRoom(ctx, wanted));
      const back = wantedRoom ? wanted : null;
      room = wantedRoom ?? (await roomWithSpace(ctx));
      const spawn = await landIn(ctx, room, back?.spot ?? spawnFor(email), now);
      const memberId = await ctx.db.insert("worldMembers", {
        roomId: room._id,
        email,
        name: await nameFor(ctx, email),
        look: withHeight((await savedLook(ctx, email))?.look ?? lookFor(email), email),
        joinedAt: now,
        ...(back && back.place !== WORLD_PLACE ? { place: back.place } : {}),
      });
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
      if (!quietReturn) await addChatLine(ctx, speakerOf(member), joinedLine(member), now);
    } else {
      // Another tab or device joining the same member: count the visit.
      await ctx.db.patch("worldMembers", member._id, { visits: (member.visits ?? 1) + 1 });
      const asked = await askedFor();
      const there = asked && (await arrivalRoom(ctx, asked, room));
      if (asked && there) {
        if (there._id !== room._id) await switchRoom(ctx, member, room, there, asked.place);
        const state = (await stateOf(ctx, member._id))!;
        const { x, z } = await landIn(ctx, there, asked.spot, now, member._id);
        await ctx.db.patch("worldState", state._id, { fromX: x, fromZ: z, toX: x, toZ: z, startedAt: now, ...FRESH_IN_ROOM });
        room = (await ctx.db.get("worldRooms", there._id))!;
        member = (await ctx.db.get("worldMembers", member._id))!;
      }
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
    else {
      await leaveWorld(ctx, member);
    }
    return null;
  },
});

const turnedAway = v.object({ ok: v.literal(false), retryInMs: v.number(), serverNow: v.number() });

const spend = (kind: StateBucket, state: Doc<"worldState">, now: number) =>
  takeToken(kind, state[`${kind}Bucket`], now);

/**
 * Walks to a spot: one write per tap. The walk starts where the server says
 * the person is now, so nobody can teleport, and ends inside the courtyard.
 */
export const move = mutation({
  args: { toX: v.number(), toZ: v.number(), path: v.optional(v.array(worldWaypointValidator)) },
  returns: v.union(v.object({ ok: v.literal(true), ...worldWalkFields, serverNow: v.number() }), turnedAway),
  handler: async (ctx, { toX, toZ, path }) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const token = spend("move", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const from = posAt(state, now);
    const place = placeOf(member);
    const extra = await obstaclesIn(ctx, member);
    const to = clampTarget(toX, toZ, place, extra);
    const cleanPath = sanitizePath(path, place, extra);
    const walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: now, ...(cleanPath ? { path: cleanPath } : {}) };
    await ctx.db.patch("worldState", state._id, {
      fromX: walk.fromX,
      fromZ: walk.fromZ,
      toX: walk.toX,
      toZ: walk.toZ,
      startedAt: walk.startedAt,
      path: cleanPath,
      away: undefined,
      reading: undefined,
      seat: undefined,
      moveBucket: token.bucket,
    });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, ...walk, serverNow: now };
  },
});

export const sit = mutation({
  args: { seat: v.string(), path: v.optional(v.array(worldWaypointValidator)) },
  returns: v.union(v.object({ ok: v.literal(true), ...worldWalkFields, serverNow: v.number() }), turnedAway),
  handler: async (ctx, args) => {
    const { member, state } = await requireMe(ctx);
    const place = placeOf(member);
    const seat = seatIn(place, args.seat);
    if (!seat) throw new ConvexError("That isn't somewhere you can sit.");
    const now = Date.now();
    const token = spend("move", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const from = posAt(state, now);
    const cleanPath = sanitizePath(args.path, place, await obstaclesIn(ctx, member));
    const walk = { fromX: from.x, fromZ: from.z, toX: seat.x, toZ: seat.z, startedAt: now, ...(cleanPath ? { path: cleanPath } : {}) };
    await ctx.db.patch("worldState", state._id, {
      fromX: walk.fromX,
      fromZ: walk.fromZ,
      toX: walk.toX,
      toZ: walk.toZ,
      startedAt: walk.startedAt,
      path: cleanPath,
      away: undefined,
      reading: undefined,
      seat: seat.id,
      moveBucket: token.bucket,
    });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, ...walk, serverNow: now };
  },
});

const done = v.union(v.object({ ok: v.literal(true), serverNow: v.number() }), turnedAway);

export const travel = mutation({
  args: { to: v.string(), toMember: v.optional(v.id("worldMembers")), invite: v.optional(v.string()) },
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
  handler: async (ctx, args) => {
    const { to, toMember } = args;
    if (!isPlace(to)) throw new ConvexError("That isn't somewhere you can go.");
    const { email, member, state } = await requireMe(ctx);
    const now = Date.now();
    const from = placeOf(member);
    const here = (await ctx.db.get("worldRooms", member.roomId))!;
    const target = toMember ? await ctx.db.get("worldMembers", toMember) : null;
    const theirRoom =
      target && target.roomId !== member.roomId && placeOf(target) === to && !(await blockedEither(ctx, email, target.email))
        ? await ctx.db.get("worldRooms", target.roomId)
        : null;
    let owner: string | undefined;
    if (to === HOME) {
      const inviteId = args.invite === undefined ? null : ctx.db.normalizeId("worldInvites", args.invite);
      const invite = inviteId && (await ctx.db.get("worldInvites", inviteId));
      if (args.invite !== undefined && (!invite || invite.guest !== email)) throw new ConvexError("That invite isn't yours.");
      owner = invite ? invite.owner : email;
      if (!(await mayEnterHome(ctx, owner, email, now))) throw new ConvexError("That invite has run out. Ask them for another.");
    }
    const cap = to === HOME ? HOME_CAP : ROOM_CAP;
    const joinable = theirRoom && theirRoom.owner === owner && theirRoom.memberCount < cap ? theirRoom : null;
    if (from === to && here.owner === owner && !joinable) {
      const { fromX, fromZ, toX, toZ, startedAt, path } = state;
      return { ok: true as const, roomId: here._id, instance: here.instance, place: from, fromX, fromZ, toX, toZ, startedAt, ...(path ? { path } : {}), serverNow: now };
    }
    const token = spend("act", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    const room = joinable ?? (await roomFor(ctx, to, owner));
    if (!room) throw new ConvexError("Their home is full. Try again in a bit.");
    await switchRoom(ctx, member, here, room, to);
    const spot = await landIn(ctx, room, from === to ? posAt(state, now) : arrivalSpot(from, to), now, member._id);
    const walk = { fromX: spot.x, fromZ: spot.z, toX: spot.x, toZ: spot.z, startedAt: now };
    await ctx.db.patch("worldState", state._id, { ...walk, ...FRESH_IN_ROOM, actBucket: token.bucket });
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, roomId: room._id, instance: room.instance, place: to, ...walk, serverNow: now };
  },
});

const BLOCKED_BY_SCAN = 200;

const loadBlockFilter = async (ctx: Ctx, email: string) => {
  const hidden = new Set<string>();
  const mine = await ctx.db
    .query("worldBlocks")
    .withIndex("by_email_and_blockedEmail", (q) => q.eq("email", email))
    .take(MAX_BLOCKS + 1);
  for (const row of mine) hidden.add(row.blockedEmail);
  const askMine = mine.length > MAX_BLOCKS;
  const ofMe = await ctx.db
    .query("worldBlocks")
    .withIndex("by_blockedEmail", (q) => q.eq("blockedEmail", email))
    .take(BLOCKED_BY_SCAN + 1);
  for (const row of ofMe) hidden.add(row.email);
  const askOfMe = ofMe.length > BLOCKED_BY_SCAN;
  return async (other: string) =>
    other !== email &&
    (hidden.has(other) ||
      (askMine && (await blocks(ctx, email, other))) ||
      (askOfMe && (await blocks(ctx, other, email))));
};

export const elsewhere = query({
  args: {},
  returns: v.array(
    v.object({
      place: v.string(),
      count: v.number(),
      names: v.array(v.string()),
      people: v.array(v.object({ memberId: v.id("worldMembers"), name: v.string(), look: worldLookValidator, ping: v.optional(v.number()) })),
    })
  ),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const me = await memberByEmail(ctx, email);
    const isBlocked = await loadBlockFilter(ctx, email);
    const found = [];
    for (const place of PLACES) {
      const rooms = await ctx.db
        .query("worldRooms")
        .withIndex("by_place_and_instance", (q) => q.eq("place", place))
        .take(ROOM_SCAN);
      const names: string[] = [];
      const people: { memberId: Id<"worldMembers">; name: string; look: Doc<"worldMembers">["look"]; ping?: number }[] = [];
      let count = 0;
      for (const room of rooms) {
        if (room._id === me?.roomId) continue;
        const members = await ctx.db
          .query("worldMembers")
          .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
          .take(ROOM_CAP);
        for (const member of members) {
          if (member.email === email || (await isBlocked(member.email))) continue;
          count++;
          if (names.length < ELSEWHERE_NAMES) {
            names.push(member.name);
            people.push({ memberId: member._id, name: member.name, look: withHeight(member.look, member.email), ping: (await pingOf(ctx, member._id))?.bars });
          }
        }
      }
      if (count > 0) found.push({ place, count, names, people });
    }
    return found;
  },
});

/** Rooms read when counting everyone online, across every place. */
const ONLINE_ROOM_SCAN = 500;

/**
 * How many people are in the world right now, in every place: the sum of
 * the rooms' member counts, which join, leave, travel and the presence sweep
 * keep in step. One indexed read of the live rooms (empty rooms are deleted),
 * and it reruns only when someone comes, goes or travels, never per step.
 * The sidebar, the Games list and the People button share it. Zero when
 * signed out.
 */
export const onlineCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (!(await optionalEmail(ctx))) return 0;
    const rooms = await ctx.db.query("worldRooms").withIndex("by_place_and_instance").take(ONLINE_ROOM_SCAN);
    return rooms.reduce((total, room) => total + room.memberCount, 0);
  },
});

export const places = query({
  args: {},
  returns: v.record(v.string(), v.number()),
  handler: async (ctx) => {
    await requireEmail(ctx);
    const counts: Record<string, number> = Object.fromEntries(PLACES.map((place) => [place, 0]));
    const rooms = await ctx.db.query("worldRooms").withIndex("by_place_and_instance").take(ONLINE_ROOM_SCAN);
    for (const room of rooms) {
      if (Object.hasOwn(counts, room.place)) counts[room.place] += room.memberCount;
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

export const reading = mutation({
  args: { on: v.boolean() },
  returns: done,
  handler: async (ctx, { on }) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    if (Boolean(state.reading) === on) return { ok: true as const, serverNow: now };
    await ctx.db.patch("worldState", state._id, { reading: on ? true : undefined });
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

const ballFields = { x: v.number(), z: v.number(), vx: v.number(), vz: v.number(), at: v.number() };

export const ball = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(v.null(), v.object(ballFields)),
  handler: async (ctx, { roomId }) => {
    if (!(await meIn(ctx, roomId))) return null;
    const row = await ballOf(ctx, roomId);
    return row ? { x: row.x, z: row.z, vx: row.vx, vz: row.vz, at: row.at } : null;
  },
});

/**
 * Kicks the Beach's ball: one write. The kicker must be beside it, and the
 * ball takes a kick at most every KICK_GAP_MS, whoever kicks it.
 */
export const kickBall = mutation({
  args: { dirX: v.number(), dirZ: v.number() },
  returns: v.union(v.object({ ok: v.literal(true), ball: v.object(ballFields), serverNow: v.number() }), turnedAway),
  handler: async (ctx, { dirX, dirZ }) => {
    const { member, state } = await requireMe(ctx);
    if (placeOf(member) !== BALL_PLACE) throw new ConvexError("There's no ball here.");
    const now = Date.now();
    const row = await ballOf(ctx, member.roomId);
    if (row && now - row.at < KICK_GAP_MS) return { ok: false as const, retryInMs: KICK_GAP_MS - (now - row.at), serverNow: now };
    const before = row ?? restingBall();
    const there = ballAt(before, now);
    const me = posAt(state, now);
    if (distance(me, there) > KICK_REACH) throw new ConvexError("Walk up to the ball to kick it.");
    const next = rollFromKick(before, kickDirection(me, there, { x: dirX, z: dirZ }), now);
    if (row) await ctx.db.patch("worldBalls", row._id, next);
    else await ctx.db.insert("worldBalls", { roomId: member.roomId, ...next });
    return { ok: true as const, ball: next, serverNow: now };
  },
});

/** A chat line: the bubble over your head, and a line in the room's log. */
export const say = mutation({
  args: { text: v.string() },
  returns: done,
  handler: async (ctx, args) => {
    const text = cleanLine(args.text);
    if (!text) throw new ConvexError("Write something first.");
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    // The same line again straight after is a double tap, not a new line.
    if (state.say?.text === text && now - state.say.at < 5000) return { ok: true as const, serverNow: now };
    const token = spend("say", state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    await ctx.db.patch("worldState", state._id, { say: { text, at: now }, typing: undefined, sayBucket: token.bucket });
    // Keep the room within CHAT_ROOM_CAP lines as each one arrives.
    await addChatLine(ctx, speakerOf(member), { text }, now);
    await touchPresence(ctx, member._id, now);
    return { ok: true as const, serverNow: now };
  },
});

export const typing = mutation({
  args: { on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { on }) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const was = state.typing;
    if (on) {
      if (was && now - was.at < TYPING_REFRESH_MS) return null;
      await ctx.db.patch("worldState", state._id, { typing: { at: now, on: true } });
      await touchPresence(ctx, member._id, now);
    } else if (was?.on) {
      await ctx.db.patch("worldState", state._id, { typing: { at: was.at, on: false } });
    }
    return null;
  },
});

export const ping = mutation({
  args: { bars: v.optional(v.number()) },
  returns: v.object({ published: v.boolean(), serverNow: v.number() }),
  handler: async (ctx, { bars }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    if (bars === undefined) return { published: false, serverNow: now };
    if (!isPingBars(bars)) throw new ConvexError("Ping bars go from 1 to 4.");
    const member = await memberByEmail(ctx, email);
    const row = member && (await pingOf(ctx, member._id));
    if (!member || row?.bars === bars) return { published: false, serverNow: now };
    if (row && now - row.at < PING_PUBLISH_MS) return { published: false, serverNow: now };
    if (row) await ctx.db.patch("worldPings", row._id, { bars, at: now });
    else await ctx.db.insert("worldPings", { memberId: member._id, bars, at: now });
    return { published: true, serverNow: now };
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
  if (otherState.reading) return { reason: "They're doing their devotional." };
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
    if (!isAskKind(kind)) throw new ConvexError("That isn't something you can do together.");
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
    if (asked.kind === "rps") {
      if ((await liveDuelOf(ctx, me.member._id)) || (await liveDuelOf(ctx, from))) {
        return { ok: false as const, reason: "One of you is already playing.", serverNow: now };
      }
      const duelId = await ctx.db.insert("worldDuels", {
        roomId: me.member.roomId,
        a: from,
        b: me.member._id,
        round: 1,
        startsAt: now,
        endsAt: now + DUEL_FIRST_MS,
        aChanges: 0,
        bChanges: 0,
      });
      await ctx.scheduler.runAt(now + DUEL_FIRST_MS, internal.world.resolveDuel, { duelId, round: 1 });
    }
    const reply = { kind: asked.kind, to: from, askAt: asked.at, at: now };
    await ctx.db.patch("worldState", me.state._id, { reply, answered: [...open, reply], actBucket: token.bucket });
    await touchPresence(ctx, me.member._id, now);
    return { ok: true as const, at: now, serverNow: now };
  },
});

const liveDuelOf = async (ctx: Ctx, memberId: Id<"worldMembers">) => {
  for (const index of ["by_a", "by_b"] as const) {
    const rows = await ctx.db
      .query("worldDuels")
      .withIndex(index, (q) => q.eq(index === "by_a" ? "a" : "b", memberId))
      .take(5);
    const live = rows.find((row) => row.doneAt === undefined);
    if (live) return live;
  }
  return null;
};

const randomPick = () => DUEL_PICK_ORDER[Math.floor(Math.random() * DUEL_PICK_ORDER.length)];

export const duelPick = mutation({
  args: { duelId: v.id("worldDuels"), round: v.number(), pick: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.string() })),
  handler: async (ctx, { duelId, round, pick }) => {
    if (!isDuelPick(pick)) throw new ConvexError("Pick rock, paper or scissors.");
    const { member } = await requireMe(ctx);
    const duel = await ctx.db.get("worldDuels", duelId);
    const now = Date.now();
    if (!duel || duel.doneAt !== undefined || (duel.a !== member._id && duel.b !== member._id)) {
      return { ok: false as const, reason: "That game's over." };
    }
    if (duel.round !== round || now < duel.startsAt || now >= duel.endsAt) {
      return { ok: false as const, reason: "Too late for this round." };
    }
    const isA = duel.a === member._id;
    const changes = isA ? duel.aChanges : duel.bChanges;
    if (changes >= DUEL_PICK_CHANGES) return { ok: false as const, reason: "Make up your mind!" };
    if ((isA ? duel.aPick : duel.bPick) !== pick) {
      await ctx.db.patch("worldDuels", duel._id, isA ? { aPick: pick, aChanges: changes + 1 } : { bPick: pick, bChanges: changes + 1 });
    }
    return { ok: true as const };
  },
});

export const resolveDuel = internalMutation({
  args: { duelId: v.id("worldDuels"), round: v.number() },
  returns: v.null(),
  handler: async (ctx, { duelId, round }) => {
    const duel = await ctx.db.get("worldDuels", duelId);
    if (!duel || duel.round !== round || duel.doneAt !== undefined) return null;
    const a = await ctx.db.get("worldMembers", duel.a);
    const b = await ctx.db.get("worldMembers", duel.b);
    if (!a || !b || a.roomId !== duel.roomId || b.roomId !== duel.roomId) {
      await ctx.db.delete("worldDuels", duel._id);
      return null;
    }
    const aPick = isDuelPick(duel.aPick) ? duel.aPick : randomPick();
    const bPick = isDuelPick(duel.bPick) ? duel.bPick : randomPick();
    const winner = duelWinner(aPick, bPick);
    const at = Math.max(duel.endsAt, Date.now());
    const shown = { a: aPick, b: bPick, at, winner };
    if (winner === "draw" && round < DUEL_MAX_ROUNDS) {
      const startsAt = at + DUEL_REVEAL_MS;
      const endsAt = startsAt + DUEL_AGAIN_MS;
      await ctx.db.patch("worldDuels", duel._id, {
        shown,
        round: round + 1,
        startsAt,
        endsAt,
        aPick: undefined,
        bPick: undefined,
        aChanges: 0,
        bChanges: 0,
      });
      await ctx.scheduler.runAt(endsAt, internal.world.resolveDuel, { duelId, round: round + 1 });
      return null;
    }
    await ctx.db.patch("worldDuels", duel._id, { shown, doneAt: at });
    await ctx.scheduler.runAt(at + DUEL_REVEAL_MS + EMOTE_MS, internal.world.clearDuel, { duelId });
    return null;
  },
});

export const clearDuel = internalMutation({
  args: { duelId: v.id("worldDuels") },
  returns: v.null(),
  handler: async (ctx, { duelId }) => {
    const duel = await ctx.db.get("worldDuels", duelId);
    if (duel?.doneAt !== undefined) await ctx.db.delete("worldDuels", duelId);
    return null;
  },
});

const DUEL_SCAN = 40;
const DUEL_STALE_MS = 60_000;

export const duels = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(
    v.null(),
    v.array(
      v.object({
        id: v.id("worldDuels"),
        a: v.id("worldMembers"),
        b: v.id("worldMembers"),
        round: v.number(),
        startsAt: v.number(),
        endsAt: v.number(),
        myPick: v.optional(v.string()),
        shown: v.optional(
          v.object({
            a: v.string(),
            b: v.string(),
            at: v.number(),
            winner: v.union(v.literal("a"), v.literal("b"), v.literal("draw")),
          })
        ),
        done: v.boolean(),
      })
    )
  ),
  handler: async (ctx, { roomId }) => {
    const me = await meIn(ctx, roomId);
    if (!me) return null;
    const rows = await ctx.db
      .query("worldDuels")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .take(DUEL_SCAN);
    const isBlocked = rows.length > 0 ? await loadBlockFilter(ctx, me.email) : null;
    const hidden = new Map<Id<"worldMembers">, boolean>();
    const hides = async (memberId: Id<"worldMembers">) => {
      if (memberId === me._id) return false;
      const known = hidden.get(memberId);
      if (known !== undefined) return known;
      const member = await ctx.db.get("worldMembers", memberId);
      const hide = !member || (isBlocked !== null && (await isBlocked(member.email)));
      hidden.set(memberId, hide);
      return hide;
    };
    const visible = [];
    for (const row of rows) if (!(await hides(row.a)) && !(await hides(row.b))) visible.push(row);
    return visible.map((row) => ({
      id: row._id,
      a: row.a,
      b: row.b,
      round: row.round,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      myPick: row.a === me._id ? row.aPick : row.b === me._id ? row.bPick : undefined,
      shown: row.shown,
      done: row.doneAt !== undefined,
    }));
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
        v.object({
          memberId: v.id("worldMembers"),
          name: v.string(),
          look: worldLookValidator,
          isMe: v.boolean(),
        })
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
    const isBlocked = await loadBlockFilter(ctx, me.email);
    const members = [];
    for (const row of rows) {
      if (await isBlocked(row.email)) continue;
      members.push({ memberId: row._id, name: row.name, look: withHeight(row.look, row.email), isMe: row._id === me._id });
    }
    return { instance: room.instance, place: room.place, members };
  },
});

export const pings = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(v.null(), v.array(v.object({ memberId: v.id("worldMembers"), bars: v.number() }))),
  handler: async (ctx, { roomId }) => {
    const me = await meIn(ctx, roomId);
    if (!me) return null;
    const rows = await ctx.db
      .query("worldMembers")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .take(ROOM_CAP);
    const isBlocked = await loadBlockFilter(ctx, me.email);
    const found = [];
    for (const row of rows) {
      if (await isBlocked(row.email)) continue;
      const ping = await pingOf(ctx, row._id);
      if (ping) found.push({ memberId: row._id, bars: ping.bars });
    }
    return found;
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
      reading: v.optional(v.boolean()),
      seat: v.optional(v.string()),
      typing: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get("worldMembers", memberId);
    const me = member && (await meIn(ctx, member.roomId));
    if (!member || !me || (member._id !== me._id && (await blockedEither(ctx, me.email, member.email)))) return null;
    const row = await stateOf(ctx, memberId);
    if (!row) return null;
    const { fromX, fromZ, toX, toZ, startedAt, path, act, say, ask, reply, answered, away: awayAt, reading: readingFlag, seat } = row;
    const typingAt = row.typing?.on ? row.typing.at : undefined;
    return { fromX, fromZ, toX, toZ, startedAt, path, act, say, ask, reply, answered, away: awayAt, reading: readingFlag, seat, typing: typingAt };
  },
});

/** The room's latest lines, newest first, for the list view. */
const CHAT_SCAN = 2000;

export const chatLog = query({
  args: { roomId: v.id("worldRooms"), limit: v.optional(v.number()), after: v.optional(v.number()), before: v.optional(v.number()) },
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
        place: v.optional(v.string()),
        here: v.boolean(),
        kind: v.optional(v.union(v.literal("join"), v.literal("leave"))),
      })
    )
  ),
  handler: async (ctx, { roomId, limit, after, before }) => {
    const me = await meIn(ctx, roomId);
    if (!me) return null;
    const cap = limit === undefined || !Number.isFinite(limit) ? CHAT_LOG_SIZE : Math.min(CHAT_LOG_SIZE, Math.max(1, Math.floor(limit)));
    const isBlocked = await loadBlockFilter(ctx, me.email);
    const oldest = Date.now() - CHAT_TTL_MS;
    const rows = ctx.db
      .query("worldChat")
      .withIndex("by_at", (q) => {
        const from = after !== undefined && after > oldest ? q.gte("at", after) : q.gt("at", oldest);
        return before === undefined ? from : from.lt("at", before);
      })
      .order("desc");
    const lines = [];
    const hidden = new Map<string, boolean>();
    let scanned = 0;
    for await (const row of rows) {
      if (lines.length === cap || scanned++ === CHAT_SCAN) break;
      if (row.place === HOME && row.roomId !== roomId) continue;
      if (!hidden.has(row.email)) hidden.set(row.email, await isBlocked(row.email));
      if (hidden.get(row.email)) continue;
      lines.push({
        id: row._id,
        memberId: row.memberId,
        name: row.name,
        text: row.text,
        at: row.at,
        isMe: row.email === me.email,
        place: row.place,
        here: row.place === undefined || row.place === HOME ? row.roomId === roomId : row.place === placeOf(me),
        kind: row.kind,
      });
    }
    return lines;
  },
});

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
    const member = await memberByEmail(ctx, email);
    if (member) await ctx.db.patch("worldMembers", member._id, { look });
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
/** The most staff profiles one page of the offline list reads. */
const OFFLINE_PAGE_MAX = 50;

export const offline = query({
  args: {},
  returns: v.object({
    people: v.array(v.object({ id: v.id("worldVisitors"), name: v.string(), lastSeenAt: v.number() })),
    pokeAgainAt: v.number(),
  }),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const isBlocked = await loadBlockFilter(ctx, email);
    const people = [];
    let scanned = 0;
    for await (const row of ctx.db.query("worldVisitors").withIndex("by_lastSeenAt").order("desc")) {
      if (people.length === OFFLINE_LIST_SIZE || scanned === OFFLINE_SCAN_MAX) break;
      scanned++;
      if (row.email === email) continue;
      if (await memberByEmail(ctx, row.email)) continue;
      if (await isBlocked(row.email)) continue;
      people.push({ id: row._id, name: row.name, lastSeenAt: row.lastSeenAt });
    }
    const mine = await visitorOf(ctx, email);
    return { people, pokeAgainAt: mine?.lastPokeAt === undefined ? 0 : mine.lastPokeAt + POKE_EVERY_MS };
  },
});

const pokedOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("worldPoked")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

/**
 * Sends one poke from someone in the garden to someone who isn't, within
 * the limits: one poke an hour each, and nobody poked twice in
 * POKED_GAP_MS. The two pokes (by visitor or by staff profile) share it.
 */
const placeWords = (place: Place) => (place === HOME ? "my home" : PLACE_TITLES[place].replace(/^The /, "the "));

const upsertInvite = async (ctx: MutationCtx, me: { email: string; member: Doc<"worldMembers"> }, guest: string, now: number) => {
  const found = await ctx.db
    .query("worldInvites")
    .withIndex("by_owner_and_guest", (q) => q.eq("owner", me.email).eq("guest", guest))
    .first();
  const fields = { ownerName: me.member.name, at: now, expiresAt: now + INVITE_MS };
  if (found) {
    await ctx.db.patch("worldInvites", found._id, fields);
    return found._id;
  }
  return await ctx.db.insert("worldInvites", { owner: me.email, guest, ...fields });
};

const sendPoke = async (
  ctx: MutationCtx,
  target: { email: string; name: string },
  message: string | undefined,
  kind: "poke" | "invite" = "poke"
) => {
  const me = await requireMe(ctx);
  const now = Date.now();
  if (target.email === me.email || (await blockedEither(ctx, me.email, target.email))) {
    throw new ConvexError("They can't be poked right now.");
  }
  if (await memberByEmail(ctx, target.email)) throw new ConvexError(`${shortName(target.name)} is already in the garden.`);
  const visitor = await visitorOf(ctx, target.email);
  const poked = await pokedOf(ctx, target.email);
  const lastPokedAt = Math.max(visitor?.lastPokedAt ?? -Infinity, poked?.lastPokedAt ?? -Infinity);
  if (now - lastPokedAt < POKED_GAP_MS) {
    throw new ConvexError(`${shortName(target.name)} was poked a moment ago. Give them a few minutes.`);
  }
  const mine = await visitorOf(ctx, me.email);
  const waited = now - (mine?.lastPokeAt ?? 0);
  if (waited < POKE_EVERY_MS) return { ok: false as const, retryInMs: POKE_EVERY_MS - waited };
  await markSeen(ctx, me.email, me.member.name, now);
  await ctx.db.patch("worldVisitors", (await visitorOf(ctx, me.email))!._id, { lastPokeAt: now });
  if (visitor) await ctx.db.patch("worldVisitors", visitor._id, { lastPokedAt: now });
  else if (poked) await ctx.db.patch("worldPoked", poked._id, { lastPokedAt: now });
  else await ctx.db.insert("worldPoked", { email: target.email, lastPokedAt: now });
  const place = placeOf(me.member);
  const owner = (await homeOf(ctx, me.member)) ?? undefined;
  let url: string;
  let title: string;
  let fallback: string;
  if (kind === "invite") {
    url = `/world?invite=${await upsertInvite(ctx, me, target.email, now)}`;
    title = `${shortName(me.member.name)} invited you home`;
    fallback = "Come over to my home.";
  } else {
    const spot = posAt(me.state, now);
    if (owner === me.email) await upsertInvite(ctx, me, target.email, now);
    const pokeId = await ctx.db.insert("worldPokes", { from: me.email, to: target.email, place, owner, x: spot.x, z: spot.z, at: now });
    url = `/world?poke=${pokeId}`;
    title = `${shortName(me.member.name)} poked you`;
    fallback = `Come and join me in ${placeWords(place)}.`;
  }
  const body = (message === undefined ? null : cleanPoke(message)) ?? fallback;
  await ctx.db.insert("notifications", { userEmail: target.email, title, body, url, read: false });
  await ctx.scheduler.runAfter(0, internal.push.send, { to: target.email, title, body, url });
  return { ok: true as const };
};

const pokeReply = v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), retryInMs: v.number() }));

export const inviteStaff = mutation({
  args: { profileId: v.id("staffProfiles"), message: v.optional(v.string()) },
  returns: pokeReply,
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("staffProfiles", args.profileId);
    if (!profile) throw new ConvexError("They can't be invited right now.");
    return await sendPoke(ctx, { email: profile.email, name: profileName(profile) }, args.message, "invite");
  },
});

export const invite = mutation({
  args: { memberId: v.id("worldMembers") },
  returns: v.union(v.object({ ok: v.literal(true), serverNow: v.number() }), turnedAway, refused),
  handler: async (ctx, { memberId }) => {
    const me = await requireMe(ctx);
    const now = Date.now();
    const other = await ctx.db.get("worldMembers", memberId);
    if (!other || (await blockedEither(ctx, me.email, other.email))) return { ok: false as const, reason: "They've left the World.", serverNow: now };
    if (other.email === me.email) return { ok: false as const, reason: "That's you.", serverNow: now };
    const token = spend("act", me.state, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs, serverNow: now };
    await ctx.db.patch("worldState", me.state._id, { actBucket: token.bucket });
    await upsertInvite(ctx, me, other.email, now);
    return { ok: true as const, serverNow: now };
  },
});

export const invites = query({
  args: {},
  returns: v.array(
    v.object({ id: v.id("worldInvites"), ownerName: v.string(), look: worldLookValidator, at: v.number(), expiresAt: v.number() })
  ),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const rows = await ctx.db
      .query("worldInvites")
      .withIndex("by_guest_and_at", (q) => q.eq("guest", email))
      .order("desc")
      .take(INVITES_SHOWN);
    const isBlocked = rows.length > 0 ? await loadBlockFilter(ctx, email) : null;
    const out = [];
    for (const row of rows) {
      if (isBlocked !== null && (await isBlocked(row.owner))) continue;
      const look = (await savedLook(ctx, row.owner))?.look ?? lookFor(row.owner);
      out.push({ id: row._id, ownerName: row.ownerName, look, at: row.at, expiresAt: row.expiresAt });
    }
    return out;
  },
});

const INVITES_SHOWN = 5;

/** Pokes someone who has been in the garden before (older apps' list). */
export const poke = mutation({
  args: { visitorId: v.id("worldVisitors"), message: v.optional(v.string()) },
  returns: pokeReply,
  handler: async (ctx, args) => {
    const target = await ctx.db.get("worldVisitors", args.visitorId);
    if (!target) throw new ConvexError("They can't be poked right now.");
    return await sendPoke(ctx, target, args.message);
  },
});

/** Pokes anyone with a staff profile, whether or not they've been in the garden. */
export const pokeStaff = mutation({
  args: { profileId: v.id("staffProfiles"), message: v.optional(v.string()) },
  returns: pokeReply,
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("staffProfiles", args.profileId);
    if (!profile) throw new ConvexError("They can't be poked right now.");
    return await sendPoke(ctx, { email: profile.email, name: profileName(profile) }, args.message);
  },
});

const profileName = (profile: Doc<"staffProfiles">) => profile.name?.trim() || profile.email.split("@")[0];

/**
 * Everyone with a staff profile this year who isn't in the garden, by name,
 * a page at a time: not you, not anyone online, nobody blocked either way. A
 * page can come back shorter than asked when it skipped people; keep loading
 * until it's done.
 */
export const offlineStaff = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ id: v.id("staffProfiles"), name: v.string(), lastSeenAt: v.union(v.number(), v.null()) })
  ),
  handler: async (ctx, { paginationOpts }) => {
    const email = await requireEmail(ctx);
    const isBlocked = await loadBlockFilter(ctx, email);
    const result = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year_and_name", (q) => q.eq("year", currentStaffYear()))
      .paginate({ ...paginationOpts, numItems: Math.min(OFFLINE_PAGE_MAX, Math.max(1, paginationOpts.numItems)) });
    const page = [];
    for (const row of result.page) {
      if (row.email === email) continue;
      if (await memberByEmail(ctx, row.email)) continue;
      if (await isBlocked(row.email)) continue;
      const visitor = await visitorOf(ctx, row.email);
      page.push({ id: row._id, name: profileName(row), lastSeenAt: visitor?.lastSeenAt ?? null });
    }
    return { ...result, page };
  },
});

/** When the caller can poke again (0 when they can now). */
export const pokeWait = query({
  args: {},
  returns: v.object({ pokeAgainAt: v.number() }),
  handler: async (ctx) => {
    const mine = await visitorOf(ctx, await requireEmail(ctx));
    return { pokeAgainAt: mine?.lastPokeAt === undefined ? 0 : mine.lastPokeAt + POKE_EVERY_MS };
  },
});

const saidLines = async (rows: AsyncIterable<Doc<"worldChat">>, count: number) => {
  const said: Doc<"worldChat">[] = [];
  if (count <= 0) return said;
  for await (const row of rows) {
    if (row.kind !== undefined) continue;
    said.push(row);
    if (said.length === count) break;
  }
  return said;
};

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
    const own = await saidLines(
      ctx.db
        .query("worldChat")
        .withIndex("by_roomId_and_email_and_at", (q) =>
          q.eq("roomId", other.roomId).eq("email", other.email).gt("at", now - CHAT_TTL_MS)
        )
        .order("desc"),
      REPORT_OWN_LINES
    );
    // Only lines still inside the chat TTL, as the room would see them.
    const context = await saidLines(
      ctx.db
        .query("worldChat")
        .withIndex("by_roomId_and_at", (q) => q.eq("roomId", other.roomId).gt("at", now - CHAT_TTL_MS))
        .order("desc"),
      REPORT_CONTEXT_LINES
    );
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
      if (member) {
        await leaveWorld(ctx, member);
      } else await ctx.db.delete("worldPresence", presence._id);
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
    const staleDuels = await ctx.db
      .query("worldDuels")
      .withIndex("by_endsAt", (q) => q.lt("endsAt", now - DUEL_STALE_MS))
      .take(SWEEP_BATCH);
    for (const row of staleDuels) await ctx.db.delete("worldDuels", row._id);
    const oldPokes = await ctx.db
      .query("worldPokes")
      .withIndex("by_at", (q) => q.lt("at", now - POKE_ARRIVAL_MS))
      .take(SWEEP_BATCH);
    for (const row of oldPokes) await ctx.db.delete("worldPokes", row._id);
    const oldInvites = await ctx.db
      .query("worldInvites")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(SWEEP_BATCH);
    for (const row of oldInvites) await ctx.db.delete("worldInvites", row._id);

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

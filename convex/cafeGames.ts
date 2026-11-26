import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import {
  applyMove,
  CAFE_AWAY_GRACE_MS,
  CAFE_CHALLENGE_MS,
  CAFE_KEEP_MS,
  CAFE_PLACE,
  CAFE_QUIET_MS,
  CAFE_TABLES,
  CAFE_TURN_MS,
  CAFE_WATCH_TTL_MS,
  CAFE_WATCH_WRITE_MS,
  cafeTableOf,
  isCafeGameKind,
  newBoard,
  otherSide,
  pairKey,
  type CafeGameKind,
  type Side,
  timeOut,
  type Winner,
} from "../shared/cafeGames";
import { DUEL_LOSER_EMOTE, DUEL_WINNER_EMOTE, ROOM_CAP, takeToken, type EmoteId } from "../shared/world";
import { cafeBoardValidator, cafeResultValidator, cafeSideValidator } from "./cafeGamesData";
import { Ctx, optionalEmail, requireEmail } from "./model";
import { blockedEither, memberByEmail, placeOf, requireMe } from "./world";

type Game = Doc<"cafeGames">;
type Why = NonNullable<Game["result"]>["why"];

const GAMES_SCAN = 10;
const WATCHERS_SCAN = 100;
const WATCH_SWEEP_BATCH = 50;
const TIMER_SLACK_MS = 500;
const CHALLENGES_SCAN = 10;

const gamesOf = async (ctx: Ctx, email: string) => {
  const asA = await ctx.db
    .query("cafeGames")
    .withIndex("by_a", (q) => q.eq("a", email))
    .take(GAMES_SCAN);
  const asB = await ctx.db
    .query("cafeGames")
    .withIndex("by_b", (q) => q.eq("b", email))
    .take(GAMES_SCAN);
  return [...asA, ...asB];
};

const liveGameOf = async (ctx: Ctx, email: string) => (await gamesOf(ctx, email)).find((game) => game.endedAt === undefined) ?? null;

const sideOf = (game: Game, email: string): Side | null => (game.a === email ? "a" : game.b === email ? "b" : null);

const boardOf = (ctx: Ctx, gameId: Id<"cafeGames">) =>
  ctx.db
    .query("cafeBoards")
    .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
    .unique();

const watchersOf = (ctx: Ctx, gameId: Id<"cafeGames">) =>
  ctx.db
    .query("cafeWatchers")
    .withIndex("by_gameId_and_email", (q) => q.eq("gameId", gameId))
    .take(WATCHERS_SCAN);

const VISITS_SCAN = 10;

const myWatches = (ctx: Ctx, gameId: Id<"cafeGames">, email: string) =>
  ctx.db
    .query("cafeWatchers")
    .withIndex("by_gameId_and_email", (q) => q.eq("gameId", gameId).eq("email", email))
    .take(VISITS_SCAN);

const watcherCount = async (ctx: Ctx, gameId: Id<"cafeGames">) => new Set((await watchersOf(ctx, gameId)).map((row) => row.email)).size;

export const dropWatchesOf = async (ctx: MutationCtx, email: string) => {
  const rows = await ctx.db
    .query("cafeWatchers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(WATCH_SWEEP_BATCH);
  for (const row of rows) await ctx.db.delete("cafeWatchers", row._id);
};

export const dropStaleWatches = async (ctx: MutationCtx, now: number) => {
  const stale = await ctx.db
    .query("cafeWatchers")
    .withIndex("by_at", (q) => q.lt("at", now - CAFE_WATCH_TTL_MS))
    .take(WATCH_SWEEP_BATCH);
  for (const row of stale) await ctx.db.delete("cafeWatchers", row._id);
};

const challengesOf = async (ctx: Ctx, email: string) => {
  const sent = await ctx.db
    .query("cafeChallenges")
    .withIndex("by_from", (q) => q.eq("from", email))
    .take(CHALLENGES_SCAN);
  const got = await ctx.db
    .query("cafeChallenges")
    .withIndex("by_to", (q) => q.eq("to", email))
    .take(CHALLENGES_SCAN);
  return [...sent, ...got];
};

const dropChallengesOf = async (ctx: MutationCtx, email: string) => {
  for (const row of await challengesOf(ctx, email)) await ctx.db.delete("cafeChallenges", row._id);
};

const quietOf = (ctx: Ctx, pair: string) =>
  ctx.db
    .query("cafeQuiet")
    .withIndex("by_pair", (q) => q.eq("pair", pair))
    .unique();

const hushPair = async (ctx: MutationCtx, a: string, b: string, now: number) => {
  const pair = pairKey(a, b);
  const row = await quietOf(ctx, pair);
  if (row) await ctx.db.patch("cafeQuiet", row._id, { at: now });
  else await ctx.db.insert("cafeQuiet", { pair, at: now });
  await ctx.scheduler.runAt(now + CAFE_QUIET_MS, internal.cafeGames.forget, { pair });
};

const stateOf = (ctx: Ctx, memberId: Id<"worldMembers">) =>
  ctx.db
    .query("worldState")
    .withIndex("by_memberId", (q) => q.eq("memberId", memberId))
    .unique();

const inCafeWith = (me: Doc<"worldMembers">, other: Doc<"worldMembers"> | null): other is Doc<"worldMembers"> =>
  other !== null && other._id !== me._id && other.roomId === me.roomId && placeOf(me) === CAFE_PLACE;

const ask = async (
  ctx: MutationCtx,
  fields: { roomId: Id<"worldRooms">; from: Doc<"worldMembers">; to: Doc<"worldMembers">; kind?: CafeGameKind; table?: string },
  now: number
) => {
  const { roomId, from, to, kind, table } = fields;
  const expiresAt = now + CAFE_CHALLENGE_MS;
  const challengeId = await ctx.db.insert("cafeChallenges", {
    roomId,
    from: from.email,
    fromName: from.name,
    to: to.email,
    toName: to.name,
    ...(kind ? { kind, pickedBy: from.email } : {}),
    ...(table ? { table } : {}),
    at: now,
    expiresAt,
  });
  await ctx.scheduler.runAt(expiresAt, internal.cafeGames.expire, { challengeId });
};

const promptTable = async (ctx: MutationCtx, me: Doc<"worldMembers">, other: Doc<"worldMembers">, table: string, now: number) => {
  if (await blockedEither(ctx, me.email, other.email)) return;
  const quiet = await quietOf(ctx, pairKey(me.email, other.email));
  if (quiet && now - quiet.at < CAFE_QUIET_MS) return;
  if ((await liveGameOf(ctx, me.email)) || (await liveGameOf(ctx, other.email))) return;
  if ((await challengesOf(ctx, me.email)).some((row) => row.from === other.email || row.to === other.email)) return;
  await hushPair(ctx, me.email, other.email, now);
  await ask(ctx, { roomId: me.roomId, from: me, to: other, table }, now);
};

export const cafeSat = async (ctx: MutationCtx, member: Doc<"worldMembers">, seat: string, now: number) => {
  const table = cafeTableOf(seat);
  if (!table || placeOf(member) !== CAFE_PLACE) return;
  const stools = CAFE_TABLES[table].filter((id) => id !== seat);
  const roommates = await ctx.db
    .query("worldMembers")
    .withIndex("by_roomId", (q) => q.eq("roomId", member.roomId))
    .take(ROOM_CAP);
  for (const other of roommates) {
    if (other._id === member._id) continue;
    const state = await stateOf(ctx, other._id);
    if (state?.seat !== undefined && stools.includes(state.seat)) return await promptTable(ctx, member, other, table, now);
  }
};

export const endLiveGameOf = async (ctx: MutationCtx, email: string, now: number) => {
  const game = await liveGameOf(ctx, email);
  const side = game && sideOf(game, email);
  if (game && side) await endGame(ctx, game, otherSide(side), "left", now);
};

export const cafeMoved = async (ctx: MutationCtx, email: string, roomId: Id<"worldRooms"> | null, now: number) => {
  for (const ended of await gamesOf(ctx, email)) {
    if (ended.endedAt === undefined || ended.next !== undefined || roomId === ended.roomId) continue;
    const side = sideOf(ended, email);
    if (!side) continue;
    const field = side === "a" ? "closedA" : "closedB";
    if (ended[field] !== true) {
      await ctx.db.patch("cafeGames", ended._id, { [field]: true, ...(ended.rematch === side ? { rematch: undefined } : {}) });
    }
  }
  const game = await liveGameOf(ctx, email);
  if (!game) return;
  const field = sideOf(game, email) === "a" ? "awayA" : "awayB";
  if (roomId === game.roomId) {
    if (game[field] !== undefined) await ctx.db.patch("cafeGames", game._id, { [field]: undefined });
    return;
  }
  if (game[field] !== undefined) return;
  await ctx.db.patch("cafeGames", game._id, { [field]: now });
  await ctx.scheduler.runAt(now + CAFE_AWAY_GRACE_MS, internal.cafeGames.checkAway, { gameId: game._id });
};

const bumpRecord = async (ctx: MutationCtx, email: string, kind: string, change: "wins" | "losses" | "draws") => {
  const row = await ctx.db
    .query("cafeRecords")
    .withIndex("by_email_and_kind", (q) => q.eq("email", email).eq("kind", kind))
    .unique();
  if (row) await ctx.db.patch("cafeRecords", row._id, { [change]: row[change] + 1 });
  else await ctx.db.insert("cafeRecords", { email, kind, wins: 0, losses: 0, draws: 0, [change]: 1 });
};

const versusOf = (ctx: Ctx, a: string, b: string) => {
  const [first, second] = a < b ? [a, b] : [b, a];
  return ctx.db
    .query("cafeVersus")
    .withIndex("by_a_and_b", (q) => q.eq("a", first).eq("b", second))
    .unique();
};

const bumpVersus = async (ctx: MutationCtx, game: Game, winner: Winner) => {
  const winnerEmail = winner === "a" ? game.a : winner === "b" ? game.b : null;
  const row = await versusOf(ctx, game.a, game.b);
  const [a, b] = game.a < game.b ? [game.a, game.b] : [game.b, game.a];
  const change = winnerEmail === null ? "draws" : winnerEmail === a ? "aWins" : "bWins";
  if (row) await ctx.db.patch("cafeVersus", row._id, { [change]: row[change] + 1 });
  else await ctx.db.insert("cafeVersus", { a, b, aWins: 0, bWins: 0, draws: 0, [change]: 1 });
};

const emote = async (ctx: MutationCtx, email: string, roomId: Id<"worldRooms">, id: EmoteId, now: number) => {
  const member = await memberByEmail(ctx, email);
  const state = member?.roomId === roomId ? await stateOf(ctx, member._id) : null;
  if (state) await ctx.db.patch("worldState", state._id, { act: { emote: id, at: now } });
};

const endGame = async (ctx: MutationCtx, game: Game, winner: Winner, why: Why, now: number) => {
  await ctx.db.patch("cafeGames", game._id, { endedAt: now, result: { winner, why }, awayA: undefined, awayB: undefined });
  if (winner !== "draw") {
    await emote(ctx, winner === "a" ? game.a : game.b, game.roomId, DUEL_WINNER_EMOTE, now);
    await emote(ctx, winner === "a" ? game.b : game.a, game.roomId, DUEL_LOSER_EMOTE, now);
  }
  if (why !== "abandoned") {
    await bumpRecord(ctx, game.a, game.kind, winner === "draw" ? "draws" : winner === "a" ? "wins" : "losses");
    await bumpRecord(ctx, game.b, game.kind, winner === "draw" ? "draws" : winner === "b" ? "wins" : "losses");
    await bumpVersus(ctx, game, winner);
  }
  await ctx.scheduler.runAt(now + CAFE_KEEP_MS, internal.cafeGames.clear, { gameId: game._id });
};

const startGame = async (ctx: MutationCtx, roomId: Id<"worldRooms">, kind: CafeGameKind, a: Doc<"worldMembers">, b: Doc<"worldMembers">, now: number) => {
  await dropChallengesOf(ctx, a.email);
  await dropChallengesOf(ctx, b.email);
  const gameId = await ctx.db.insert("cafeGames", { roomId, kind, a: a.email, b: b.email, aName: a.name, bName: b.name, startedAt: now });
  const turnEndsAt = now + CAFE_TURN_MS;
  await ctx.db.insert("cafeBoards", { gameId, board: newBoard(kind), moves: 0, turnEndsAt });
  await ctx.scheduler.runAt(turnEndsAt, internal.cafeGames.timeout, { gameId, moves: 0 });
  return gameId;
};

const opponentLeft = async (ctx: Ctx, game: Game, side: Side) => {
  if (game[side === "a" ? "closedB" : "closedA"] === true) return true;
  const them = await memberByEmail(ctx, side === "a" ? game.b : game.a);
  return them?.roomId !== game.roomId || placeOf(them) !== CAFE_PLACE;
};

const okReply = v.object({ ok: v.literal(true) });
const refusedReply = v.object({ ok: v.literal(false), reason: v.string() });
const refuse = (reason: string) => ({ ok: false as const, reason });
const done = { ok: true as const };

export const challenge = mutation({
  args: { to: v.id("worldMembers"), kind: v.string() },
  returns: v.union(okReply, refusedReply, v.object({ ok: v.literal(false), retryInMs: v.number() })),
  handler: async (ctx, { to, kind }) => {
    if (!isCafeGameKind(kind)) throw new ConvexError("Pick a game.");
    const me = await requireMe(ctx);
    const now = Date.now();
    const other = await ctx.db.get("worldMembers", to);
    if (placeOf(me.member) !== CAFE_PLACE) return refuse("Games are played in the Café.");
    if (other?._id === me.member._id) return refuse("That's you.");
    if (!inCafeWith(me.member, other) || (await blockedEither(ctx, me.email, other.email))) return refuse("They've left the Café.");
    if (await liveGameOf(ctx, me.email)) return refuse("Finish your game first.");
    if (await liveGameOf(ctx, other.email)) return refuse("They're playing a game already.");
    const token = takeToken("act", me.state.actBucket, now);
    if (!token.ok) return { ok: false as const, retryInMs: token.retryInMs };
    await ctx.db.patch("worldState", me.state._id, { actBucket: token.bucket });
    for (const row of await challengesOf(ctx, me.email)) {
      if (row.from === me.email || row.from === other.email) await ctx.db.delete("cafeChallenges", row._id);
    }
    await ask(ctx, { roomId: me.member.roomId, from: me.member, to: other, kind }, now);
    return done;
  },
});

const theirChallenge = async (ctx: MutationCtx, challengeId: Id<"cafeChallenges">, email: string, now: number) => {
  const row = await ctx.db.get("cafeChallenges", challengeId);
  return row && (row.from === email || row.to === email) && row.expiresAt > now ? row : null;
};

export const pick = mutation({
  args: { challengeId: v.id("cafeChallenges"), kind: v.string() },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { challengeId, kind }) => {
    if (!isCafeGameKind(kind)) throw new ConvexError("Pick a game.");
    const email = await requireEmail(ctx);
    const now = Date.now();
    const row = await theirChallenge(ctx, challengeId, email, now);
    if (!row) return refuse("That's gone.");
    if (row.pickedBy !== undefined && row.pickedBy !== email) return refuse("They've picked one already.");
    const expiresAt = now + CAFE_CHALLENGE_MS;
    await ctx.db.patch("cafeChallenges", row._id, { kind, pickedBy: email, at: now, expiresAt });
    await ctx.scheduler.runAt(expiresAt, internal.cafeGames.expire, { challengeId });
    return done;
  },
});

export const respond = mutation({
  args: { challengeId: v.id("cafeChallenges"), accept: v.boolean() },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { challengeId, accept }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const row = await theirChallenge(ctx, challengeId, email, now);
    if (!row) return refuse("That's gone. Ask them again.");
    if (!accept) {
      await ctx.db.delete("cafeChallenges", row._id);
      await hushPair(ctx, row.from, row.to, now);
      return done;
    }
    if (row.pickedBy === undefined || !isCafeGameKind(row.kind)) return refuse("Pick a game first.");
    if (row.pickedBy === email) return refuse("Waiting for them to answer.");
    const me = await requireMe(ctx);
    const picker = await memberByEmail(ctx, row.pickedBy);
    if (!inCafeWith(me.member, picker) || (await blockedEither(ctx, email, picker.email))) return refuse("They've left the Café.");
    if ((await liveGameOf(ctx, email)) || (await liveGameOf(ctx, picker.email))) return refuse("One of you is already playing.");
    await startGame(ctx, me.member.roomId, row.kind, picker, me.member, now);
    return done;
  },
});

export const move = mutation({
  args: { gameId: v.id("cafeGames"), move: v.number() },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { gameId, move }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const game = await ctx.db.get("cafeGames", gameId);
    const side = game && sideOf(game, email);
    if (!game || !side) return refuse("That isn't your game.");
    const row = await boardOf(ctx, gameId);
    if (game.endedAt !== undefined || !row || !isCafeGameKind(game.kind)) return refuse("That game's over.");
    const result = applyMove(game.kind, row.board, side, move);
    if (!result.ok) return refuse(result.reason);
    const moves = row.moves + 1;
    const turnEndsAt = now + CAFE_TURN_MS;
    await ctx.db.patch("cafeBoards", row._id, { board: result.board, moves, turnEndsAt });
    if (result.winner !== undefined) await endGame(ctx, game, result.winner, "played", now);
    else await ctx.scheduler.runAt(turnEndsAt, internal.cafeGames.timeout, { gameId, moves });
    return done;
  },
});

export const giveUp = mutation({
  args: { gameId: v.id("cafeGames") },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { gameId }) => {
    const email = await requireEmail(ctx);
    const game = await ctx.db.get("cafeGames", gameId);
    const side = game && sideOf(game, email);
    if (!game || !side || game.endedAt !== undefined) return refuse("That game's over.");
    await endGame(ctx, game, otherSide(side), "gaveUp", Date.now());
    return done;
  },
});

export const rematch = mutation({
  args: { gameId: v.id("cafeGames") },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { gameId }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const game = await ctx.db.get("cafeGames", gameId);
    const side = game && sideOf(game, email);
    if (!game || !side || game.endedAt === undefined || game.result?.why === "abandoned") return refuse("That game's gone.");
    if (game.next !== undefined || game.rematch === side) return done;
    if (await opponentLeft(ctx, game, side)) return refuse(`${side === "a" ? game.bName : game.aName} left.`);
    if (game.rematch === undefined) {
      await ctx.db.patch("cafeGames", game._id, { rematch: side });
      return done;
    }
    const me = await requireMe(ctx);
    const them = await memberByEmail(ctx, side === "a" ? game.b : game.a);
    if (!inCafeWith(me.member, them) || !isCafeGameKind(game.kind)) return refuse("They've left the Café.");
    if ((await liveGameOf(ctx, email)) || (await liveGameOf(ctx, them.email))) return refuse("One of you is already playing.");
    const next = await startGame(ctx, me.member.roomId, game.kind, side === "a" ? them : me.member, side === "a" ? me.member : them, now);
    await ctx.db.patch("cafeGames", game._id, { next, rematch: undefined });
    return done;
  },
});

export const close = mutation({
  args: { gameId: v.id("cafeGames") },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { gameId }) => {
    const email = await requireEmail(ctx);
    const game = await ctx.db.get("cafeGames", gameId);
    if (!game) return done;
    const side = sideOf(game, email);
    if (!side) return refuse("That isn't your game.");
    if (game.endedAt === undefined) return refuse("Finish your game first.");
    const field = side === "a" ? "closedA" : "closedB";
    if (game[field] !== true) await ctx.db.patch("cafeGames", game._id, { [field]: true, ...(game.rematch === side ? { rematch: undefined } : {}) });
    return done;
  },
});

export const timeout = internalMutation({
  args: { gameId: v.id("cafeGames"), moves: v.number() },
  returns: v.null(),
  handler: async (ctx, { gameId, moves }) => {
    const game = await ctx.db.get("cafeGames", gameId);
    const row = await boardOf(ctx, gameId);
    if (!game || !row || game.endedAt !== undefined || row.moves !== moves || !isCafeGameKind(game.kind)) return null;
    const now = Date.now();
    const timed = timeOut(game.kind, row.board);
    if (timed.winner !== undefined) {
      await ctx.db.patch("cafeBoards", row._id, { board: timed.board, moves: moves + 1 });
      await endGame(ctx, game, timed.winner, timed.why, now);
      return null;
    }
    const turnEndsAt = now + CAFE_TURN_MS;
    await ctx.db.patch("cafeBoards", row._id, { board: timed.board, moves: moves + 1, turnEndsAt });
    await ctx.scheduler.runAt(turnEndsAt, internal.cafeGames.timeout, { gameId, moves: moves + 1 });
    return null;
  },
});

export const checkAway = internalMutation({
  args: { gameId: v.id("cafeGames") },
  returns: v.null(),
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("cafeGames", gameId);
    if (!game || game.endedAt !== undefined) return null;
    const now = Date.now();
    const gone = (at: number | undefined) => at !== undefined && now - at >= CAFE_AWAY_GRACE_MS - TIMER_SLACK_MS;
    const aGone = gone(game.awayA);
    const bGone = gone(game.awayB);
    if (aGone && bGone) await endGame(ctx, game, "draw", "abandoned", now);
    else if (aGone) await endGame(ctx, game, "b", "left", now);
    else if (bGone) await endGame(ctx, game, "a", "left", now);
    return null;
  },
});

export const expire = internalMutation({
  args: { challengeId: v.id("cafeChallenges") },
  returns: v.null(),
  handler: async (ctx, { challengeId }) => {
    const row = await ctx.db.get("cafeChallenges", challengeId);
    if (row && row.expiresAt <= Date.now()) await ctx.db.delete("cafeChallenges", row._id);
    return null;
  },
});

export const forget = internalMutation({
  args: { pair: v.string() },
  returns: v.null(),
  handler: async (ctx, { pair }) => {
    const row = await quietOf(ctx, pair);
    if (row && Date.now() - row.at >= CAFE_QUIET_MS) await ctx.db.delete("cafeQuiet", row._id);
    return null;
  },
});

export const clear = internalMutation({
  args: { gameId: v.id("cafeGames") },
  returns: v.null(),
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("cafeGames", gameId);
    if (!game || game.endedAt === undefined) return null;
    const row = await boardOf(ctx, gameId);
    if (row) await ctx.db.delete("cafeBoards", row._id);
    for (const watcher of await watchersOf(ctx, gameId)) await ctx.db.delete("cafeWatchers", watcher._id);
    await ctx.db.delete("cafeGames", gameId);
    return null;
  },
});

const memberIn = async (ctx: Ctx, email: string, roomId: Id<"worldRooms">) => {
  const member = await memberByEmail(ctx, email);
  return member?.roomId === roomId ? member._id : null;
};

export const mine = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      challenges: v.array(
        v.object({
          id: v.id("cafeChallenges"),
          kind: v.optional(v.string()),
          other: v.union(v.null(), v.id("worldMembers")),
          otherName: v.string(),
          picked: v.union(v.literal("me"), v.literal("them"), v.literal("nobody")),
          table: v.optional(v.string()),
          expiresAt: v.number(),
        })
      ),
      game: v.union(
        v.null(),
        v.object({
          id: v.id("cafeGames"),
          kind: v.string(),
          side: cafeSideValidator,
          opponent: v.union(v.null(), v.id("worldMembers")),
          opponentName: v.string(),
          result: v.optional(cafeResultValidator),
          rematch: v.optional(cafeSideValidator),
          left: v.boolean(),
          away: v.boolean(),
          board: cafeBoardValidator,
          turnEndsAt: v.number(),
          watchers: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    const member = email ? await memberByEmail(ctx, email) : null;
    if (!email || !member) return null;
    const challenges = [];
    for (const row of await challengesOf(ctx, email)) {
      const mineSent = row.from === email;
      const otherEmail = mineSent ? row.to : row.from;
      challenges.push({
        id: row._id,
        kind: row.kind,
        other: await memberIn(ctx, otherEmail, member.roomId),
        otherName: mineSent ? row.toName : row.fromName,
        picked: row.pickedBy === undefined ? ("nobody" as const) : row.pickedBy === email ? ("me" as const) : ("them" as const),
        table: row.table,
        expiresAt: row.expiresAt,
      });
    }
    const games = (await gamesOf(ctx, email)).sort((p, q) => Number(p.endedAt !== undefined) - Number(q.endedAt !== undefined) || q.startedAt - p.startedAt);
    const latest = games.find((row) => row.next === undefined) ?? null;
    const closed = latest !== null && latest.endedAt !== undefined && latest[sideOf(latest, email) === "a" ? "closedA" : "closedB"] === true;
    const game = closed ? null : latest;
    const row = game && (await boardOf(ctx, game._id));
    if (!game || !row) return { challenges, game: null };
    const side = sideOf(game, email)!;
    const opponentEmail = side === "a" ? game.b : game.a;
    return {
      challenges,
      game: {
        id: game._id,
        kind: game.kind,
        side,
        opponent: await memberIn(ctx, opponentEmail, game.roomId),
        opponentName: side === "a" ? game.bName : game.aName,
        result: game.result,
        rematch: game.rematch,
        left: game.endedAt !== undefined && (await opponentLeft(ctx, game, side)),
        away: (side === "a" ? game.awayA : game.awayB) !== undefined,
        board: row.board,
        turnEndsAt: row.turnEndsAt,
        watchers: await watcherCount(ctx, game._id),
      },
    };
  },
});

export const playing = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(v.null(), v.array(v.object({ id: v.id("cafeGames"), a: v.id("worldMembers"), b: v.id("worldMembers"), kind: v.string() }))),
  handler: async (ctx, { roomId }) => {
    const email = await optionalEmail(ctx);
    const me = email ? await memberByEmail(ctx, email) : null;
    if (!email || me?.roomId !== roomId) return null;
    const games = await ctx.db
      .query("cafeGames")
      .withIndex("by_roomId_and_endedAt", (q) => q.eq("roomId", roomId).eq("endedAt", undefined))
      .take(ROOM_CAP);
    const found = [];
    for (const game of games) {
      const a = await memberIn(ctx, game.a, roomId);
      const b = await memberIn(ctx, game.b, roomId);
      if (!a || !b || (await blockedEither(ctx, email, game.a)) || (await blockedEither(ctx, email, game.b))) continue;
      found.push({ id: game._id, a, b, kind: game.kind });
    }
    return found;
  },
});

const canWatch = async (ctx: Ctx, game: Game, email: string, member: Doc<"worldMembers"> | null) =>
  member !== null && member.roomId === game.roomId && sideOf(game, email) === null && !(await blockedEither(ctx, email, game.a)) && !(await blockedEither(ctx, email, game.b));

export const watch = mutation({
  args: { gameId: v.id("cafeGames"), visit: v.string() },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { gameId, visit }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const game = await ctx.db.get("cafeGames", gameId);
    if (!game) return refuse("That game's over.");
    if (sideOf(game, email)) return refuse("That's your game.");
    if (!(await canWatch(ctx, game, email, await memberByEmail(ctx, email)))) return refuse("That game isn't here.");
    const mine = await myWatches(ctx, gameId, email);
    const row = mine.find((watch) => watch.visit === visit);
    if (row) {
      if (now - row.at >= CAFE_WATCH_WRITE_MS) await ctx.db.patch("cafeWatchers", row._id, { at: now });
      return done;
    }
    if (game.endedAt !== undefined && mine.length === 0) return refuse("That game's over.");
    if (mine.length >= VISITS_SCAN) return refuse("You're watching from too many places.");
    await ctx.db.insert("cafeWatchers", { gameId, email, visit, at: now });
    return done;
  },
});

export const unwatch = mutation({
  args: { gameId: v.id("cafeGames"), visit: v.string() },
  returns: v.null(),
  handler: async (ctx, { gameId, visit }) => {
    const email = await requireEmail(ctx);
    for (const row of await myWatches(ctx, gameId, email)) {
      if (row.visit === visit || row.visit === undefined) await ctx.db.delete("cafeWatchers", row._id);
    }
    return null;
  },
});

const seatValidator = v.object({ member: v.union(v.null(), v.id("worldMembers")), name: v.string() });

export const watching = query({
  args: { gameId: v.id("cafeGames") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("cafeGames"),
      kind: v.string(),
      a: seatValidator,
      b: seatValidator,
      result: v.optional(cafeResultValidator),
      board: cafeBoardValidator,
      turnEndsAt: v.number(),
    })
  ),
  handler: async (ctx, { gameId }) => {
    const email = await optionalEmail(ctx);
    const game = await ctx.db.get("cafeGames", gameId);
    if (!email || !game || !(await canWatch(ctx, game, email, await memberByEmail(ctx, email)))) return null;
    if (game.endedAt !== undefined && (await myWatches(ctx, gameId, email)).length === 0) return null;
    const row = await boardOf(ctx, gameId);
    if (!row) return null;
    return {
      id: game._id,
      kind: game.kind,
      a: { member: await memberIn(ctx, game.a, game.roomId), name: game.aName },
      b: { member: await memberIn(ctx, game.b, game.roomId), name: game.bName },
      result: game.result,
      board: row.board,
      turnEndsAt: row.turnEndsAt,
    };
  },
});

export const versus = query({
  args: { memberId: v.id("worldMembers") },
  returns: v.union(v.null(), v.object({ mine: v.number(), theirs: v.number(), draws: v.number() })),
  handler: async (ctx, { memberId }) => {
    const email = await optionalEmail(ctx);
    const member = await ctx.db.get("worldMembers", memberId);
    if (!email || !member || member.email === email || (await blockedEither(ctx, email, member.email))) return null;
    const row = await versusOf(ctx, email, member.email);
    if (!row) return null;
    const mineFirst = row.a === email;
    return { mine: mineFirst ? row.aWins : row.bWins, theirs: mineFirst ? row.bWins : row.aWins, draws: row.draws };
  },
});

export const record = query({
  args: { memberId: v.id("worldMembers") },
  returns: v.array(v.object({ kind: v.string(), wins: v.number(), losses: v.number(), draws: v.number() })),
  handler: async (ctx, { memberId }) => {
    const email = await optionalEmail(ctx);
    const member = await ctx.db.get("worldMembers", memberId);
    if (!email || !member || (await blockedEither(ctx, email, member.email))) return [];
    const rows = await ctx.db
      .query("cafeRecords")
      .withIndex("by_email_and_kind", (q) => q.eq("email", member.email))
      .take(GAMES_SCAN);
    return rows.map(({ kind, wins, losses, draws }) => ({ kind, wins, losses, draws }));
  },
});

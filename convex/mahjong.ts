import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { CAFE_PLACE } from "../shared/cafeGames";
import { coinDay } from "../shared/coins";
import { bankLeftToday, settle } from "../shared/mahjong/coins";
import { actors, begin, deadlineOf, newHand, nextDealer, timeOut, type Hand, type Result } from "../shared/mahjong/game";
import { applyMove, playBots, type Move } from "../shared/mahjong/play";
import { viewHand } from "../shared/mahjong/view";
import {
  allReady,
  botControlled,
  botName,
  everyoneAway,
  DEFAULT_SETTINGS,
  validSettings,
  EMPTY_SEAT,
  emptySeats,
  humanSeats,
  isMahjongTable,
  MAHJONG_TABLES,
  mahjongSeatOf,
  nextHost,
  seatOfEmail,
  tableFull,
  type MahjongTableId,
  type TableSeat,
} from "../shared/mahjong/table";
import { clampTarget, DUEL_WINNER_EMOTE, seatIn } from "../shared/world";
import { ensureWallet } from "./coins";
import { mahjongHandViewValidator, mahjongMoveValidator, mahjongPhaseValidator, mahjongSettingsValidator, mahjongSettledValidator } from "./mahjongData";
import { Ctx, optionalEmail, requireEmail } from "./model";
import { memberByEmail, placeOf, requireMe } from "./world";

type Table = Doc<"mahjongTables">;

const LEAVE_STEP = 0.75;

const okReply = v.object({ ok: v.literal(true) });
const refusedReply = v.object({ ok: v.literal(false), reason: v.string() });
const refuse = (reason: string) => ({ ok: false as const, reason });
const done = { ok: true as const };

const tableIn = (ctx: Ctx, roomId: Id<"worldRooms">, table: MahjongTableId) =>
  ctx.db
    .query("mahjongTables")
    .withIndex("by_roomId_and_table", (q) => q.eq("roomId", roomId).eq("table", table))
    .unique();

const playerOf = (ctx: Ctx, email: string) =>
  ctx.db
    .query("mahjongPlayers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

/** The table someone holds a seat at, and which seat. */
export const heldSeatOf = async (ctx: Ctx, email: string) => {
  const player = await playerOf(ctx, email);
  const table = player && (await ctx.db.get("mahjongTables", player.tableId));
  if (!player || !table || table.seats[player.seat]?.kind !== "human") return null;
  return { table, seat: player.seat };
};

const putPlayer = async (ctx: MutationCtx, email: string, tableId: Id<"mahjongTables">, seat: number) => {
  const row = await playerOf(ctx, email);
  if (row) await ctx.db.patch("mahjongPlayers", row._id, { tableId, seat });
  else await ctx.db.insert("mahjongPlayers", { email, tableId, seat });
};

const dropPlayer = async (ctx: MutationCtx, email: string) => {
  const row = await playerOf(ctx, email);
  if (row) await ctx.db.delete("mahjongPlayers", row._id);
};

const deleteTable = async (ctx: MutationCtx, table: Table) => {
  const players = await ctx.db
    .query("mahjongPlayers")
    .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
    .take(8);
  for (const row of players) await ctx.db.delete("mahjongPlayers", row._id);
  const hands = await ctx.db
    .query("mahjongHands")
    .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
    .take(4);
  for (const row of hands) await ctx.db.delete("mahjongHands", row._id);
  await ctx.db.delete("mahjongTables", table._id);
};

/** Puts seats back, handing the host on when theirs empties, and clears a table nobody's at. */
const saveSeats = async (ctx: MutationCtx, table: Table, seats: TableSeat[], fields: Partial<Table> = {}) => {
  if (humanSeats(seats).length === 0) return await deleteTable(ctx, table);
  const hostSeat = table.host === undefined ? -1 : seatOfEmail(seats, table.host);
  const host = hostSeat >= 0 ? table.host : nextHost(seats, Math.max(0, seatOfEmail(table.seats, table.host ?? "")));
  await ctx.db.patch("mahjongTables", table._id, { seats, host, ...fields });
};

/** A seat empties: in the lobby, or after a hand, it's free for anyone (or a bot). */
const freeSeat = async (ctx: MutationCtx, table: Table, seat: number) => {
  const left = table.seats[seat];
  const seats = table.seats.map((s, i) => (i === seat ? EMPTY_SEAT : s));
  if (left.kind === "human") await dropPlayer(ctx, left.email);
  await saveSeats(ctx, table, seats);
};

/** Someone walked away from their seat: before or after a hand it frees; during one a bot plays it. */
const leaveSeat = async (ctx: MutationCtx, table: Table, seat: number, now: number) => {
  const s = table.seats[seat];
  if (s.kind !== "human") return;
  if (table.phase !== "playing") return await freeSeat(ctx, table, seat);
  if (s.away !== undefined) return;
  const seats = table.seats.map((x, i) => (i === seat && x.kind === "human" ? { ...x, away: now, ready: undefined } : x));
  await ctx.db.patch("mahjongTables", table._id, { seats });
  await controlChanged(ctx, table._id, now);
};

/** Who plays a seat changed mid-hand (a bot took over, or a person came back): the hand picks it up. */
const controlChanged = async (ctx: MutationCtx, tableId: Id<"mahjongTables">, now: number) => {
  const table = await ctx.db.get("mahjongTables", tableId);
  const row = table && table.phase === "playing" ? await handRowOf(ctx, tableId) : null;
  if (!table || !row || row.state.stage.kind === "over") return;
  const allAwayAt = everyoneAway(table.seats) ? (table.allAwayAt ?? now) : undefined;
  if (allAwayAt !== table.allAwayAt) await ctx.db.patch("mahjongTables", table._id, { allAwayAt });
  await saveHand(ctx, { ...table, allAwayAt }, row, row.state, now);
};

// ── The hand ────────────────────────────────────────────────────────────

/** How long a bot takes to act, so people can follow the table. */
export const BOT_MS = 900;
/** How long a hand waits when everyone at the table has walked away, before it's given up (no coins move). */
export const ABANDON_MS = 2 * 60_000;
const TICK_SLACK_MS = 250;

type HandRow = Doc<"mahjongHands">;

const handRowOf = (ctx: Ctx, tableId: Id<"mahjongTables">) =>
  ctx.db
    .query("mahjongHands")
    .withIndex("by_tableId", (q) => q.eq("tableId", tableId))
    .first();

/** When the hand next needs the server: a bot's move, the clock running out, or giving up on an empty table. */
const nextTickAt = (table: Table, hand: Hand, now: number) => {
  if (everyoneAway(table.seats)) return (table.allAwayAt ?? now) + ABANDON_MS;
  if (hand.stage.kind === "intro") return hand.stage.until;
  const bots = botControlled(table.seats);
  if (actors(hand).some((seat) => bots[seat])) return now + BOT_MS;
  return deadlineOf(hand) ?? now;
};

/** Saves a hand that moved on: settles it when it's over, otherwise schedules what comes next. */
const saveHand = async (ctx: MutationCtx, table: Table, row: HandRow, hand: Hand, now: number) => {
  const beat = row.beat + 1;
  if (hand.stage.kind === "over") {
    await ctx.db.patch("mahjongHands", row._id, { state: hand, beat });
    return await finishHand(ctx, table, { ...row, state: hand, beat }, hand.stage.result, now);
  }
  await ctx.db.patch("mahjongHands", row._id, { state: hand, beat });
  await ctx.scheduler.runAt(nextTickAt(table, hand, now), internal.mahjong.tick, { tableId: table._id, beat });
};

const startHand = async (ctx: MutationCtx, table: Table, now: number) => {
  for (const old of await ctx.db
    .query("mahjongHands")
    .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
    .take(4))
    await ctx.db.delete("mahjongHands", old._id);
  const first = table.handNo === 0 || table.dealer === undefined;
  const hand = newHand({ settings: table.settings, dealer: first ? null : table.dealer!, roundWind: first ? 0 : table.roundWind, random: Math.random, now });
  const handNo = table.handNo + 1;
  const seats = table.seats.map((s) => (s.kind === "human" ? { ...s, ready: undefined } : s));
  await ctx.db.patch("mahjongTables", table._id, {
    phase: "playing",
    handNo,
    seats,
    dealer: hand.dealer,
    roundWind: hand.roundWind,
    allAwayAt: undefined,
    ...(first ? { firstDealer: hand.dealer, net: [0, 0, 0, 0] } : {}),
  });
  const id = await ctx.db.insert("mahjongHands", { tableId: table._id, handNo, beat: 0, state: hand });
  await ctx.scheduler.runAt(nextTickAt({ ...table, seats }, hand, now), internal.mahjong.tick, { tableId: table._id, beat: 0 });
  return id;
};

const cheer = async (ctx: MutationCtx, email: string, roomId: Id<"worldRooms">, now: number) => {
  const member = await memberByEmail(ctx, email);
  const state =
    member?.roomId === roomId
      ? await ctx.db
          .query("worldState")
          .withIndex("by_memberId", (q) => q.eq("memberId", member._id))
          .unique()
      : null;
  if (state) await ctx.db.patch("worldState", state._id, { act: { emote: DUEL_WINNER_EMOTE, at: now } });
};

/**
 * The hand is over: coins move (one transaction, worked out here, never
 * sent by a phone), the dealer moves on or stays, and seats kept for
 * people who never came back are freed.
 */
const finishHand = async (ctx: MutationCtx, table: Table, row: HandRow, result: Result, now: number) => {
  const day = coinDay(now);
  const humans = table.seats.map((s) => (s.kind === "human" ? s : null));
  const wallets = [];
  for (const h of humans) wallets.push(h ? await ensureWallet(ctx, h.email, now) : null);
  const settled =
    result.kind === "win"
      ? settle(
          result.pays,
          table.settings.stake,
          wallets.map((w) => ({ human: w !== null, balance: w?.balance ?? 0, bankLeft: w ? bankLeftToday(w.mahjongBankDay, w.mahjongBankToday, day) : 0 }))
        )
      : { deltas: [0, 0, 0, 0], fromBank: [0, 0, 0, 0] };
  for (const [seat, wallet] of wallets.entries()) {
    const delta = settled.deltas[seat];
    if (!wallet || delta === 0) continue;
    const bank = settled.fromBank[seat];
    const bankToday = (wallet.mahjongBankDay === day ? (wallet.mahjongBankToday ?? 0) : 0) + bank;
    await ctx.db.patch("worldWallets", wallet._id, { balance: wallet.balance + delta, ...(bank > 0 ? { mahjongBankDay: day, mahjongBankToday: bankToday } : {}) });
    await ctx.db.insert("coinLedger", { email: wallet.email, delta, kind: "mahjong", runId: `mahjong:${row._id}`, game: "mahjong", at: now });
  }
  await ctx.db.patch("mahjongHands", row._id, { settled });
  const next = nextDealer(table.dealer ?? row.state.dealer, result, table.firstDealer ?? row.state.dealer, table.roundWind);
  const net = table.net.map((n, i) => n + settled.deltas[i]);
  const gone = table.seats.flatMap((s, i) => (s.kind === "human" && s.away !== undefined ? [i] : []));
  for (const i of gone) {
    const s = table.seats[i];
    if (s.kind === "human") await dropPlayer(ctx, s.email);
  }
  const seats = table.seats.map((s, i) => (gone.includes(i) ? EMPTY_SEAT : s.kind === "human" ? { ...s, ready: undefined } : s));
  await saveSeats(ctx, table, seats, { phase: "ended", dealer: next.dealer, roundWind: next.roundWind, net, allAwayAt: undefined });
  if (result.kind === "win") {
    const winner = table.seats[result.winner];
    if (winner.kind === "human") await cheer(ctx, winner.email, table.roomId, now);
  }
};

export const tick = internalMutation({
  args: { tableId: v.id("mahjongTables"), beat: v.number() },
  returns: v.null(),
  handler: async (ctx, { tableId, beat }) => {
    const table = await ctx.db.get("mahjongTables", tableId);
    const row = table ? await handRowOf(ctx, tableId) : null;
    if (!table || !row || row.beat !== beat || table.phase !== "playing" || row.state.stage.kind === "over") return null;
    const now = Date.now();
    let hand = row.state;
    if (everyoneAway(table.seats)) {
      if (now < (table.allAwayAt ?? now) + ABANDON_MS - TICK_SLACK_MS) return null;
      // Nobody came back: the hand is given up and the table cleared.
      await ctx.db.delete("mahjongHands", row._id);
      for (const s of table.seats) if (s.kind === "human") await dropPlayer(ctx, s.email);
      await deleteTable(ctx, table);
      return null;
    }
    if (hand.stage.kind === "intro") {
      const started = begin(hand, now);
      if (started.ok) hand = started.hand;
    } else {
      const bots = botControlled(table.seats);
      const played = actors(hand).some((seat) => bots[seat]) ? playBots(hand, bots, now) : hand;
      if (played !== hand) hand = played;
      else {
        const deadline = deadlineOf(hand) ?? now;
        if (now < deadline - TICK_SLACK_MS) {
          await ctx.scheduler.runAt(deadline, internal.mahjong.tick, { tableId, beat });
          return null;
        }
        const timed = timeOut(hand, now);
        if (timed.ok) hand = timed.hand;
      }
    }
    await saveHand(ctx, table, row, hand, now);
    return null;
  },
});

/** A move at the table from the person in that seat: a discard, a win, a kong, or an answer to a claim. */
export const play = mutation({
  args: { move: mahjongMoveValidator },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { move }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const held = await heldSeatOf(ctx, email);
    if (!held || held.table.phase !== "playing") return refuse("There's no hand being played.");
    const seat = held.table.seats[held.seat];
    if (seat.kind === "human" && seat.away !== undefined) return refuse("Sit back down to play.");
    const row = await handRowOf(ctx, held.table._id);
    if (!row) return refuse("There's no hand being played.");
    const step = applyMove(row.state, held.seat, move as Move, now);
    if (!step.ok) return refuse(step.reason);
    await saveHand(ctx, held.table, row, step.hand, now);
    return done;
  },
});

/**
 * After a hand: "Play another round". It starts once every person at the
 * table has asked (bots always want to). With a seat empty, the table goes
 * back to the lobby to fill it.
 */
export const again = mutation({
  args: {},
  returns: v.union(okReply, refusedReply),
  handler: async (ctx) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const held = await heldSeatOf(ctx, email);
    if (!held || held.table.phase !== "ended") return refuse("That round's gone.");
    const { table } = held;
    if (!tableFull(table.seats)) {
      await ctx.db.patch("mahjongTables", table._id, { phase: "lobby" });
      return done;
    }
    const seats = table.seats.map((s, i) => (i === held.seat && s.kind === "human" ? { ...s, ready: true } : s));
    if (allReady(seats)) await startHand(ctx, { ...table, seats }, now);
    else await ctx.db.patch("mahjongTables", table._id, { seats });
    return done;
  },
});

/**
 * Called by `world.sit` before the sit is written: takes a seat at a
 * mahjong table, or refuses. Leaving another mahjong seat counts as
 * walking away from it. During a hand a bot's seat can be sat in (to take
 * over the bot, which the phone asks about); a seat held for a human
 * who walked away is theirs alone.
 */
export const mahjongSit = async (ctx: MutationCtx, member: Doc<"worldMembers">, from: string | undefined, to: string, now: number) => {
  const target = mahjongSeatOf(to);
  if (from !== to && mahjongSeatOf(from)) await mahjongStood(ctx, member.email, now);
  if (!target || placeOf(member) !== CAFE_PLACE) return;
  const table = await tableIn(ctx, member.roomId, target.table);
  if (!table) {
    const seats = emptySeats();
    seats[target.seat] = { kind: "human", email: member.email, name: member.name };
    const tableId = await ctx.db.insert("mahjongTables", {
      roomId: member.roomId,
      table: target.table,
      phase: "lobby",
      host: member.email,
      seats,
      net: [0, 0, 0, 0],
      settings: DEFAULT_SETTINGS,
      handNo: 0,
      roundWind: 0,
    });
    await putPlayer(ctx, member.email, tableId, target.seat);
    return;
  }
  const seat = table.seats[target.seat];
  if (seat.kind === "human" && seat.email === member.email) {
    if (seat.away !== undefined) {
      const seats = table.seats.map((s, i) => (i === target.seat && s.kind === "human" ? { ...s, away: undefined } : s));
      await ctx.db.patch("mahjongTables", table._id, { seats, allAwayAt: undefined });
      await controlChanged(ctx, table._id, now);
    }
    return;
  }
  if (seat.kind === "human") throw new ConvexError(seat.away !== undefined ? `That seat's kept for ${seat.name}.` : `${seat.name} is sitting there.`);
  if (seat.kind === "bot") {
    if (table.phase === "lobby") throw new ConvexError("A bot has that seat. The host can take it off.");
    return;
  }
  const seats = table.seats.map((s, i) => (i === target.seat ? { kind: "human" as const, email: member.email, name: member.name } : s));
  await saveSeats(ctx, table, seats);
  await putPlayer(ctx, member.email, table._id, target.seat);
};

/** Called when someone stands up, or leaves the Café room their table is in. */
export const mahjongStood = async (ctx: MutationCtx, email: string, now: number) => {
  const held = await heldSeatOf(ctx, email);
  if (!held) return await dropPlayer(ctx, email);
  const s = held.table.seats[held.seat];
  if (s.kind === "human" && s.email === email) await leaveSeat(ctx, held.table, held.seat, now);
  else await dropPlayer(ctx, email);
};

/** Called on every room change (as `cafeMoved` is): leaving the table's room is walking away. */
export const mahjongMoved = async (ctx: MutationCtx, email: string, roomId: Id<"worldRooms"> | null, now: number) => {
  const held = await heldSeatOf(ctx, email);
  if (held && held.table.roomId !== roomId) await mahjongStood(ctx, email, now);
};

/** The Café room someone's table is in, to put them back there when they come back mid-hand. */
export const heldRoomOf = async (ctx: Ctx, email: string) => {
  const held = await heldSeatOf(ctx, email);
  return held && held.table.phase !== "lobby" ? held.table.roomId : null;
};


/** The caller's table when they host it and it's waiting to start. */
const hostedLobby = async (ctx: MutationCtx, email: string): Promise<{ table: Table; problem?: undefined } | { table?: undefined; problem: string }> => {
  const held = await heldSeatOf(ctx, email);
  if (!held) return { problem: "Sit at a table first." };
  if (held.table.host !== email) return { problem: "Only the host can do that." };
  if (held.table.phase !== "lobby") return { problem: "The game's started." };
  return { table: held.table };
};

const seatArg = v.number();
const validSeat = (seat: number) => Number.isInteger(seat) && seat >= 0 && seat < 4;

export const addBot = mutation({
  args: { seat: seatArg },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { seat }) => {
    if (!validSeat(seat)) throw new ConvexError("That isn't a seat.");
    const { table, problem } = await hostedLobby(ctx, await requireEmail(ctx));
    if (!table) return refuse(problem);
    if (table.seats[seat].kind !== "empty") return refuse("That seat's taken.");
    await ctx.db.patch("mahjongTables", table._id, { seats: table.seats.map((s, i) => (i === seat ? { kind: "bot" as const, name: botName(seat) } : s)) });
    return done;
  },
});

export const removeBot = mutation({
  args: { seat: seatArg },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { seat }) => {
    if (!validSeat(seat)) throw new ConvexError("That isn't a seat.");
    const { table, problem } = await hostedLobby(ctx, await requireEmail(ctx));
    if (!table) return refuse(problem);
    if (table.seats[seat].kind !== "bot") return refuse("There's no bot there.");
    await ctx.db.patch("mahjongTables", table._id, { seats: table.seats.map((s, i) => (i === seat ? EMPTY_SEAT : s)) });
    return done;
  },
});

export const setSettings = mutation({
  args: { settings: mahjongSettingsValidator },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { settings }) => {
    if (!validSettings(settings)) throw new ConvexError("Those settings don't work.");
    const { table, problem } = await hostedLobby(ctx, await requireEmail(ctx));
    if (!table) return refuse(problem);
    await ctx.db.patch("mahjongTables", table._id, { settings });
    return done;
  },
});

/** The host starts the game once every seat has a person or a bot. */
export const start = mutation({
  args: {},
  returns: v.union(okReply, refusedReply),
  handler: async (ctx) => {
    const { table, problem } = await hostedLobby(ctx, await requireEmail(ctx));
    if (!table) return refuse(problem);
    if (!tableFull(table.seats)) return refuse("Fill every seat first.");
    await startHand(ctx, table, Date.now());
    return done;
  },
});

/**
 * Takes over a bot's seat mid-hand, from that seat in the World: the seat
 * keeps its tiles, melds, flowers, score and place in the turn order, so
 * whoever takes it plays on from exactly where the bot was.
 */
export const replaceBot = mutation({
  args: { tableId: v.id("mahjongTables"), seat: seatArg },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { tableId, seat }) => {
    if (!validSeat(seat)) throw new ConvexError("That isn't a seat.");
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const table = await ctx.db.get("mahjongTables", tableId);
    if (!table || table.roomId !== member.roomId || !isMahjongTable(table.table)) return refuse("That table's gone.");
    if (state.seat !== `${table.table}-${seat}`) return refuse("Sit in that seat first.");
    if (table.seats[seat].kind !== "bot") return refuse("A bot isn't playing that seat.");
    if (table.phase === "lobby") return refuse("The game hasn't started.");
    if (seatOfEmail(table.seats, member.email) >= 0) return refuse("You're playing already.");
    const seats = table.seats.map((s, i) => (i === seat ? { kind: "human" as const, email: member.email, name: member.name } : s));
    await ctx.db.patch("mahjongTables", table._id, { seats, allAwayAt: undefined, ...(table.host === undefined ? { host: member.email } : {}) });
    await putPlayer(ctx, member.email, table._id, seat);
    await controlChanged(ctx, table._id, now);
    return done;
  },
});

/** Gets up from the table: walks a step back from the stool, which frees the seat (or, mid-hand, hands it to a bot). */
export const leave = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const at = mahjongSeatOf(state.seat);
    const seat = at && seatIn(placeOf(member), state.seat);
    if (seat && at) {
      const table = PLACE_TABLE_CENTRE(at.table);
      const dx = seat.x - table.x;
      const dz = seat.z - table.z;
      const length = Math.hypot(dx, dz) || 1;
      const to = clampTarget(seat.x + (dx / length) * LEAVE_STEP, seat.z + (dz / length) * LEAVE_STEP, placeOf(member));
      await ctx.db.patch("worldState", state._id, { fromX: seat.x, fromZ: seat.z, toX: to.x, toZ: to.z, startedAt: now, path: undefined, heading: undefined, seat: undefined });
    }
    await mahjongStood(ctx, member.email, now);
    return null;
  },
});

const PLACE_TABLE_CENTRE = (table: MahjongTableId) => {
  const seats = [0, 1, 2, 3].map((i) => seatIn(CAFE_PLACE, `${table}-${i}`)!);
  return { x: seats.reduce((sum, s) => sum + s.x, 0) / 4, z: seats.reduce((sum, s) => sum + s.z, 0) / 4 };
};

const seatView = v.object({
  kind: v.union(v.literal("empty"), v.literal("human"), v.literal("bot")),
  name: v.string(),
  member: v.union(v.null(), v.id("worldMembers")),
  isMe: v.boolean(),
  away: v.boolean(),
  ready: v.boolean(),
  net: v.number(),
});

const viewSeats = async (ctx: Ctx, table: Table, email: string) => {
  const out = [];
  for (const [i, s] of table.seats.entries()) {
    const member = s.kind === "human" ? await memberByEmail(ctx, s.email) : null;
    out.push({
      kind: s.kind,
      name: s.kind === "empty" ? "" : s.name,
      member: member && member.roomId === table.roomId ? member._id : null,
      isMe: s.kind === "human" && s.email === email,
      away: s.kind === "human" && s.away !== undefined,
      ready: s.kind === "human" && s.ready === true,
      net: table.net[i] ?? 0,
    });
  }
  return out;
};

export const tableViewFields = {
  id: v.id("mahjongTables"),
  table: v.string(),
  phase: mahjongPhaseValidator,
  hostSeat: v.number(),
  seats: v.array(seatView),
  settings: mahjongSettingsValidator,
  handNo: v.number(),
  roundWind: v.number(),
  full: v.boolean(),
};

export const tableView = async (ctx: Ctx, table: Table, email: string) => ({
  id: table._id,
  table: table.table,
  phase: table.phase,
  hostSeat: table.host === undefined ? -1 : seatOfEmail(table.seats, table.host),
  seats: await viewSeats(ctx, table, email),
  settings: table.settings,
  handNo: table.handNo,
  roundWind: table.roundWind,
  full: tableFull(table.seats),
});

const handFields = {
  hand: v.union(v.null(), mahjongHandViewValidator),
  settled: v.union(v.null(), mahjongSettledValidator),
};

/** A hand as one seat sees it (or a watcher, with seat null): never the wall, and only that seat's own tiles. */
const handFor = async (ctx: Ctx, table: Table, seat: number | null) => {
  const row = table.phase === "lobby" ? null : await handRowOf(ctx, table._id);
  return { hand: row ? viewHand(row.state, seat) : null, settled: row?.settled ?? null };
};

/** The caller's table, when they hold a seat at one, with their view of the hand. */
export const mine = query({
  args: {},
  returns: v.union(v.null(), v.object({ ...tableViewFields, mySeat: v.number(), isHost: v.boolean(), ...handFields })),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    const held = email ? await heldSeatOf(ctx, email) : null;
    if (!email || !held) return null;
    return { ...(await tableView(ctx, held.table, email)), mySeat: held.seat, isHost: held.table.host === email, ...(await handFor(ctx, held.table, held.seat)) };
  },
});

/**
 * A table to watch, for someone in its Café room: all four players, their
 * melds, flowers and discards, and nobody's concealed tiles. Null once
 * there's nothing on (or they've left the room).
 */
export const watching = query({
  args: { tableId: v.id("mahjongTables") },
  returns: v.union(v.null(), v.object({ ...tableViewFields, ...handFields })),
  handler: async (ctx, { tableId }) => {
    const email = await optionalEmail(ctx);
    const me = email ? await memberByEmail(ctx, email) : null;
    const table = await ctx.db.get("mahjongTables", tableId);
    if (!email || !me || !table || me.roomId !== table.roomId || placeOf(me) !== CAFE_PLACE || table.phase === "lobby") return null;
    return { ...(await tableView(ctx, table, email)), ...(await handFor(ctx, table, null)) };
  },
});

const mahjongSeatSummary = v.object({ kind: v.union(v.literal("empty"), v.literal("human"), v.literal("bot")), name: v.string(), away: v.boolean(), member: v.union(v.null(), v.id("worldMembers")) });

/** The tables in a Café room, for the World: who sits where and whether a hand is on. */
export const tables = query({
  args: { roomId: v.id("worldRooms") },
  returns: v.union(v.null(), v.array(v.object({ id: v.id("mahjongTables"), table: v.string(), phase: mahjongPhaseValidator, seats: v.array(mahjongSeatSummary) }))),
  handler: async (ctx, { roomId }) => {
    const email = await optionalEmail(ctx);
    const me = email ? await memberByEmail(ctx, email) : null;
    if (!email || me?.roomId !== roomId) return null;
    const out = [];
    for (const id of MAHJONG_TABLES) {
      const table = await tableIn(ctx, roomId, id);
      if (!table || !isMahjongTable(table.table)) continue;
      out.push({
        id: table._id,
        table: table.table,
        phase: table.phase,
        seats: await Promise.all(
          table.seats.map(async (s) => {
            const member = s.kind === "human" ? await memberByEmail(ctx, s.email) : null;
            return { kind: s.kind, name: s.kind === "empty" ? "" : s.name, away: s.kind === "human" && s.away !== undefined, member: member?.roomId === roomId ? member._id : null };
          })
        ),
      });
    }
    return out;
  },
});


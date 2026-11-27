import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { CAFE_PLACE } from "../shared/cafeGames";
import { START_COINS } from "../shared/coins";
import { coinsToSit, giveUpCoins, pointsOnly, settle, splitAmong } from "../shared/mahjong/coins";
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
  forCoins,
  humanSeats,
  isMahjongTable,
  MAHJONG_TABLE_NAMES,
  MAHJONG_TABLES,
  mahjongSeatId,
  mahjongSeatOf,
  nextHost,
  notReadySeats,
  seatOfEmail,
  START_COUNTDOWN_MS,
  tableFull,
  type MahjongTableId,
  claimMsOf,
  turnMsOf,
  type Settings,
  type TableSeat,
} from "../shared/mahjong/table";
import { clampTarget, DUEL_WINNER_EMOTE, seatIn } from "../shared/world";
import { ensureWallet, walletOf } from "./coins";
import { mahjongHandViewValidator, mahjongMoveValidator, mahjongPhaseValidator, mahjongSettingsValidator, mahjongSettledValidator } from "./mahjongData";
import { Ctx, optionalEmail, requireEmail } from "./model";
import { dropRoomIfEmpty, memberByEmail, placeOf, requireMe } from "./world";

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
  const seat = player && table ? table.seats[player.seat] : undefined;
  if (!player || !table || seat?.kind !== "human" || seat.email !== email) return null;
  return { table, seat: player.seat };
};

const shortOf = async (ctx: MutationCtx, email: string, settings: Settings, now: number) => {
  const need = coinsToSit(settings);
  if (need === 0) return null;
  const { balance } = await ensureWallet(ctx, email, now);
  return balance < need ? { need, balance } : null;
};

const shortWords = ({ need, balance }: { need: number; balance: number }) =>
  `This table plays for SOW coins: you need ${need} coins to sit (the most one hand can cost), and you have ${balance}.`;

const chargeGiveUp = async (ctx: MutationCtx, table: Table, from: number, present: readonly boolean[], runId: string, now: number) => {
  const deltas = [0, 0, 0, 0];
  const leaver = table.seats[from];
  const receivers = table.seats.flatMap((s, i) => (s.kind === "human" && present[i] && i !== from ? [{ seat: i, email: s.email }] : []));
  if (leaver.kind !== "human" || receivers.length === 0) return deltas;
  const wallet = await ensureWallet(ctx, leaver.email, now);
  const amount = Math.max(0, Math.min(giveUpCoins(table.settings), wallet.balance));
  if (amount === 0) return deltas;
  await ctx.db.patch("worldWallets", wallet._id, { balance: wallet.balance - amount });
  await ctx.db.insert("coinLedger", { email: leaver.email, delta: -amount, kind: "mahjong", runId, game: "mahjong", at: now });
  deltas[from] = -amount;
  for (const [i, share] of splitAmong(amount, receivers.length).entries()) {
    if (share === 0) continue;
    const to = receivers[i];
    const theirs = await ensureWallet(ctx, to.email, now);
    await ctx.db.patch("worldWallets", theirs._id, { balance: theirs.balance + share });
    await ctx.db.insert("coinLedger", { email: to.email, delta: share, kind: "mahjong", runId, game: "mahjong", at: now });
    deltas[to.seat] += share;
  }
  return deltas;
};

const giveUpCharge = async (ctx: MutationCtx, table: Table, from: number, now: number) => {
  const leaver = table.seats[from];
  const present = presentSeats(table.seats);
  const receivers = table.seats.filter((s, i) => s.kind === "human" && present[i] && i !== from).length;
  if (leaver.kind !== "human" || receivers === 0) return 0;
  const { balance } = await ensureWallet(ctx, leaver.email, now);
  return Math.max(0, Math.min(giveUpCoins(table.settings), balance));
};

const presentSeats = (seats: readonly TableSeat[]) => seats.map((s) => s.kind === "human" && s.away === undefined);

const putPlayer = async (ctx: MutationCtx, email: string, tableId: Id<"mahjongTables">, seat: number) => {
  const row = await playerOf(ctx, email);
  if (row) await ctx.db.patch("mahjongPlayers", row._id, { tableId, seat });
  else await ctx.db.insert("mahjongPlayers", { email, tableId, seat });
};

const dropPlayer = async (ctx: MutationCtx, email: string, tableId?: Id<"mahjongTables">) => {
  const row = await playerOf(ctx, email);
  if (row && (tableId === undefined || row.tableId === tableId)) await ctx.db.delete("mahjongPlayers", row._id);
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
  if (left.kind === "human") await dropPlayer(ctx, left.email, table._id);
  // A seat emptying stops the host's countdown: the table isn't full any more.
  await saveSeats(ctx, table, seats, { net: table.net.map((n, i) => (i === seat ? 0 : n)), startsAt: undefined });
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
const controlChanged = async (ctx: MutationCtx, tableId: Id<"mahjongTables">, now: number, regained?: number) => {
  const table = await ctx.db.get("mahjongTables", tableId);
  const row = table && table.phase === "playing" ? await handRowOf(ctx, tableId) : null;
  if (!table || !row || row.state.stage.kind === "over") return;
  const allAwayAt = everyoneAway(table.seats) ? (table.allAwayAt ?? now) : undefined;
  if (allAwayAt !== table.allAwayAt) await ctx.db.patch("mahjongTables", table._id, { allAwayAt });
  // Back in your seat on your own turn: a fresh clock, so the tile isn't thrown for you the moment you sit.
  const stage = row.state.stage;
  const bots = botControlled(table.seats);
  const turnMs = turnMsOf(row.state.settings);
  const claimMs = claimMsOf(row.state.settings);
  const back = stage.kind === "turn" && stage.seat === regained && !bots[stage.seat] && stage.deadline < now + turnMs / 2;
  const claimBack = stage.kind === "claim" && regained !== undefined && !bots[regained] && actors(row.state).includes(regained) && stage.deadline < now + claimMs / 2;
  const hand = back || claimBack ? { ...row.state, stage: { ...stage, deadline: now + (back ? turnMs : claimMs) } } : row.state;
  await saveHand(ctx, { ...table, allAwayAt }, row, hand, now);
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
  await ctx.scheduler.runAt(nextTickAt(table, hand, now), internal.mahjong.tick, { tableId: table._id, beat, handNo: row.handNo });
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
    startsAt: undefined,
    ...(first ? { firstDealer: hand.dealer, net: [0, 0, 0, 0] } : {}),
  });
  const id = await ctx.db.insert("mahjongHands", { tableId: table._id, handNo, beat: 0, state: hand });
  await ctx.scheduler.runAt(nextTickAt({ ...table, seats }, hand, now), internal.mahjong.tick, { tableId: table._id, beat: 0, handNo });
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
  const present = presentSeats(table.seats);
  const runId = `mahjong:${row._id}`;
  const settled = { deltas: [0, 0, 0, 0], fromBank: [0, 0, 0, 0] };
  if (!forCoins(table.settings)) {
    if (result.kind === "win") settled.deltas = pointsOnly(result.pays).deltas;
  } else {
    const liable = present.map((here, i) => here || (result.kind === "win" && result.from === i && table.seats[i].kind === "human"));
    for (const [i, s] of table.seats.entries()) {
      if (s.kind !== "human" || liable[i]) continue;
      const charged = await chargeGiveUp(ctx, table, i, present, `${runId}:gave-up`, now);
      settled.deltas = settled.deltas.map((d, j) => d + charged[j]);
    }
    if (result.kind === "win") {
      const wallets = [];
      for (const [i, s] of table.seats.entries()) wallets.push(s.kind === "human" && liable[i] ? await ensureWallet(ctx, s.email, now) : null);
      const won = settle(result.pays, table.settings.stake, wallets.map((w) => ({ human: w !== null, balance: w?.balance ?? 0 })));
      for (const [seat, wallet] of wallets.entries()) {
        const delta = won.deltas[seat];
        if (!wallet || delta === 0) continue;
        await ctx.db.patch("worldWallets", wallet._id, { balance: wallet.balance + delta });
        await ctx.db.insert("coinLedger", { email: wallet.email, delta, kind: "mahjong", runId, game: "mahjong", at: now });
      }
      settled.deltas = settled.deltas.map((d, j) => d + won.deltas[j]);
    }
  }
  await ctx.db.patch("mahjongHands", row._id, { settled });
  const next = nextDealer(table.dealer ?? row.state.dealer, result, table.firstDealer ?? row.state.dealer, table.roundWind);
  const gone = table.seats.flatMap((s, i) => (s.kind === "human" && s.away !== undefined ? [i] : []));
  const net = table.net.map((n, i) => (gone.includes(i) ? 0 : n + settled.deltas[i]));
  for (const i of gone) {
    const s = table.seats[i];
    if (s.kind === "human") await dropPlayer(ctx, s.email, table._id);
  }
  const seats = table.seats.map((s, i) => (gone.includes(i) ? EMPTY_SEAT : s.kind === "human" ? { ...s, ready: undefined } : s));
  await saveSeats(ctx, table, seats, { phase: "ended", dealer: next.dealer, roundWind: next.roundWind, net, allAwayAt: undefined });
  if (result.kind === "win") {
    const winner = table.seats[result.winner];
    if (winner.kind === "human") await cheer(ctx, winner.email, table.roomId, now);
  }
};

export const tick = internalMutation({
  args: { tableId: v.id("mahjongTables"), beat: v.number(), handNo: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { tableId, beat, handNo }) => {
    const table = await ctx.db.get("mahjongTables", tableId);
    const row = table ? await handRowOf(ctx, tableId) : null;
    if (!table || !row || row.beat !== beat || (handNo !== undefined && row.handNo !== handNo) || table.phase !== "playing" || row.state.stage.kind === "over") return null;
    const now = Date.now();
    const again = (at: number) => ctx.scheduler.runAt(at, internal.mahjong.tick, { tableId, beat, handNo: row.handNo });
    let hand = row.state;
    if (everyoneAway(table.seats)) {
      const abandonAt = (table.allAwayAt ?? now) + ABANDON_MS;
      if (now < abandonAt - TICK_SLACK_MS) {
        await again(abandonAt);
        return null;
      }
      // Nobody came back: the hand is given up and the table cleared.
      await ctx.db.delete("mahjongHands", row._id);
      for (const s of table.seats) if (s.kind === "human") await dropPlayer(ctx, s.email, table._id);
      await deleteTable(ctx, table);
      await dropRoomIfEmpty(ctx, table.roomId);
      return null;
    }
    if (hand.stage.kind === "intro") {
      if (now < hand.stage.until - TICK_SLACK_MS) {
        await again(hand.stage.until);
        return null;
      }
      const started = begin(hand, now);
      if (started.ok) hand = started.hand;
    } else {
      const bots = botControlled(table.seats);
      const closed = hand.stage.kind === "claim" && now >= hand.stage.deadline;
      const played = !closed && actors(hand).some((seat) => bots[seat]) ? playBots(hand, bots, now) : hand;
      if (played !== hand) hand = played;
      else {
        const deadline = deadlineOf(hand) ?? now;
        if (now < deadline - (hand.stage.kind === "claim" ? 0 : TICK_SLACK_MS)) {
          await again(deadline);
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
    const deadline = deadlineOf(row.state);
    if (deadline !== null && now > deadline) return refuse("Time's up.");
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
    if (allReady(seats)) {
      const short = await firstShort(ctx, table, now);
      if (short) {
        await ctx.db.patch("mahjongTables", table._id, { phase: "lobby", seats: seats.map((s) => (s.kind === "human" ? { ...s, ready: undefined } : s)) });
        return refuse(`${short.name} hasn't the ${short.need} coins another hand for coins needs. The host can turn coins off.`);
      }
      await startHand(ctx, { ...table, seats }, now);
    }
    else await ctx.db.patch("mahjongTables", table._id, { seats });
    return done;
  },
});

const firstShort = async (ctx: MutationCtx, table: Table, now: number) => {
  for (const s of table.seats) {
    if (s.kind !== "human") continue;
    const short = await shortOf(ctx, s.email, table.settings, now);
    if (short) return { name: s.name, ...short };
  }
  return null;
};

/**
 * Called by `world.sit` before the sit is written: takes a seat at a
 * mahjong table, or refuses. Leaving another mahjong seat counts as
 * walking away from it. During a hand a bot's seat can be sat in (to take
 * over the bot, which the phone asks about); a seat held for a human
 * who walked away is theirs alone.
 */
export const mahjongSit = async (ctx: MutationCtx, member: Doc<"worldMembers">, from: string | undefined, to: string, now: number) => {
  const target = mahjongSeatOf(to);
  const held = await heldSeatOf(ctx, member.email);
  const backInHeld = held !== null && held.table.roomId === member.roomId && mahjongSeatId(held.table.table as MahjongTableId, held.seat) === to;
  if (held && !backInHeld && target && held.table.phase === "playing") {
    const there = isMahjongTable(held.table.table) ? MAHJONG_TABLE_NAMES[held.table.table] : "the other table";
    throw new ConvexError(`Your seat at ${there} is still in a hand. Sit back down there, or ${forCoins(held.table.settings) ? "give it up first" : "wait for that hand to end"}.`);
  }
  if (held ? !backInHeld : from !== to && mahjongSeatOf(from)) await mahjongStood(ctx, member.email, now);
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
      settings: await savedSettings(ctx, member.email),
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
      await putPlayer(ctx, member.email, table._id, target.seat);
      await controlChanged(ctx, table._id, now, target.seat);
    }
    return;
  }
  if (seat.kind === "human") throw new ConvexError(seat.away !== undefined ? `That seat's kept for ${seat.name}.` : `${seat.name} is sitting there.`);
  if (seat.kind === "bot") {
    if (table.phase === "lobby") throw new ConvexError("A bot has that seat. The host can take it off.");
    return;
  }
  const short = await shortOf(ctx, member.email, table.settings, now);
  if (short) throw new ConvexError(shortWords(short));
  const seats = table.seats.map((s, i) => (i === target.seat ? { kind: "human" as const, email: member.email, name: member.name } : s));
  await saveSeats(ctx, table, seats);
  await putPlayer(ctx, member.email, table._id, target.seat);
};

/** Called when someone stands up, or leaves the Café room their table is in. */
export const mahjongStood = async (ctx: MutationCtx, email: string, now: number) => {
  const held = await heldSeatOf(ctx, email);
  if (held) await leaveSeat(ctx, held.table, held.seat, now);
  else await dropPlayer(ctx, email);
};

/** Called on every room change (as `cafeMoved` is): leaving the table's room is walking away. */
export const mahjongMoved = async (ctx: MutationCtx, email: string, roomId: Id<"worldRooms"> | null, now: number) => {
  const held = await heldSeatOf(ctx, email);
  if (held && held.table.roomId !== roomId) await mahjongStood(ctx, email, now);
};

export const handOnIn = async (ctx: Ctx, roomId: Id<"worldRooms">) => {
  const rows = await ctx.db
    .query("mahjongTables")
    .withIndex("by_roomId_and_table", (q) => q.eq("roomId", roomId))
    .take(MAHJONG_TABLES.length);
  return rows.some((row) => row.phase === "playing");
};

/** The Café room someone's table is in, to put them back there when they come back mid-hand. */
export const heldRoomOf = async (ctx: Ctx, email: string) => {
  const held = await heldSeatOf(ctx, email);
  return held && held.table.phase !== "lobby" ? held.table.roomId : null;
};


/** The caller's table when they host it and it's waiting to start (and, unless `counting`, not counting down to the deal). */
const hostedLobby = async (ctx: MutationCtx, email: string, counting = false): Promise<{ table: Table; problem?: undefined } | { table?: undefined; problem: string }> => {
  const held = await heldSeatOf(ctx, email);
  if (!held) return { problem: "Sit at a table first." };
  if (held.table.host !== email) return { problem: "Only the host can do that." };
  if (held.table.phase !== "lobby") return { problem: "The game's started." };
  if (held.table.startsAt !== undefined && !counting) return { problem: "The game's about to start. Cancel the countdown first." };
  return { table: held.table };
};

/** The rules someone last set as a host, for a table they open; the defaults when they never have. */
const savedSettings = async (ctx: Ctx, email: string): Promise<Settings> => {
  const saved = (await walletOf(ctx, email))?.mahjongSettings;
  return saved && validSettings(saved) ? saved : DEFAULT_SETTINGS;
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
    await ctx.db.patch("mahjongTables", table._id, { seats: table.seats.map((s, i) => (i === seat ? EMPTY_SEAT : s)), net: table.net.map((n, i) => (i === seat ? 0 : n)) });
    return done;
  },
});

export const setSettings = mutation({
  args: { settings: mahjongSettingsValidator },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { settings }) => {
    if (!validSettings(settings)) throw new ConvexError("Those settings don't work.");
    const email = await requireEmail(ctx);
    const { table, problem } = await hostedLobby(ctx, email);
    if (!table) return refuse(problem);
    const modeChanged = forCoins(settings) !== forCoins(table.settings);
    await ctx.db.patch("mahjongTables", table._id, { settings, ...(modeChanged ? { net: [0, 0, 0, 0] } : {}) });
    const wallet = await ensureWallet(ctx, email, Date.now());
    await ctx.db.patch("worldWallets", wallet._id, { mahjongSettings: settings });
    return done;
  },
});

/**
 * The host starts the game once every seat has a person or a bot: everyone
 * seated sees a countdown, then the first hand deals. When someone hasn't
 * said they're ready the host has to start `anyway`, and the countdown is
 * longer so they can get set.
 */
export const start = mutation({
  args: { anyway: v.optional(v.boolean()) },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { anyway }) => {
    const { table, problem } = await hostedLobby(ctx, await requireEmail(ctx));
    if (!table) return refuse(problem);
    if (!tableFull(table.seats)) return refuse("Fill every seat first.");
    const now = Date.now();
    const short = await firstShort(ctx, table, now);
    if (short) return refuse(`${short.name} needs ${short.need} coins to play for coins, and has ${short.balance}.`);
    const waiting = notReadySeats(table.seats, table.host);
    if (waiting.length > 0 && anyway !== true) {
      const names = waiting.map((i) => table.seats[i]).flatMap((s) => (s.kind === "human" ? [s.name] : []));
      return refuse(`${names.join(" and ")} ${names.length === 1 ? "isn't" : "aren't"} ready yet.`);
    }
    const startsAt = now + (waiting.length > 0 ? START_COUNTDOWN_MS.anyway : START_COUNTDOWN_MS.ready);
    await ctx.db.patch("mahjongTables", table._id, { startsAt });
    await ctx.scheduler.runAt(startsAt, internal.mahjong.countdownDone, { tableId: table._id, startsAt });
    return done;
  },
});

/** The host stops the countdown before the deal. */
export const cancelStart = mutation({
  args: {},
  returns: v.union(okReply, refusedReply),
  handler: async (ctx) => {
    const { table, problem } = await hostedLobby(ctx, await requireEmail(ctx), true);
    if (!table) return refuse(problem);
    await ctx.db.patch("mahjongTables", table._id, { startsAt: undefined });
    return done;
  },
});

/** The countdown ran out: deal, unless it was stopped, a seat emptied, or someone can't cover the coins any more. */
export const countdownDone = internalMutation({
  args: { tableId: v.id("mahjongTables"), startsAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { tableId, startsAt }) => {
    const table = await ctx.db.get("mahjongTables", tableId);
    if (!table || table.phase !== "lobby" || table.startsAt !== startsAt) return null;
    const now = Date.now();
    if (!tableFull(table.seats) || (await firstShort(ctx, table, now))) {
      await ctx.db.patch("mahjongTables", table._id, { startsAt: undefined });
      return null;
    }
    await startHand(ctx, table, now);
    return null;
  },
});

/** Someone seated in the lobby tells the host they're ready (or not, any more). */
export const setReady = mutation({
  args: { ready: v.boolean() },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { ready }) => {
    const email = await requireEmail(ctx);
    const held = await heldSeatOf(ctx, email);
    if (!held || held.table.phase !== "lobby") return refuse("Sit at a table first.");
    const seats = held.table.seats.map((s, i) => (i === held.seat && s.kind === "human" ? { ...s, ready: ready || undefined } : s));
    await ctx.db.patch("mahjongTables", held.table._id, { seats });
    return done;
  },
});

/** The host takes someone off their seat before the game: the seat frees and they get up from the stool. */
export const removePlayer = mutation({
  args: { seat: seatArg },
  returns: v.union(okReply, refusedReply),
  handler: async (ctx, { seat }) => {
    if (!validSeat(seat)) throw new ConvexError("That isn't a seat.");
    const email = await requireEmail(ctx);
    const { table, problem } = await hostedLobby(ctx, email);
    if (!table) return refuse(problem);
    const s = table.seats[seat];
    if (s.kind !== "human") return refuse("Nobody's sitting there.");
    if (s.email === email) return refuse("That's you. Leave the table instead.");
    await freeSeat(ctx, table, seat);
    const member = await memberByEmail(ctx, s.email);
    const state = member
      ? await ctx.db
          .query("worldState")
          .withIndex("by_memberId", (q) => q.eq("memberId", member._id))
          .unique()
      : null;
    if (member && state && state.seat === mahjongSeatId(table.table as MahjongTableId, seat)) await stepBack(ctx, member, state, Date.now());
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
    const open = (await handRowOf(ctx, table._id))?.state.stage;
    if (open?.kind === "claim" && open.from === seat) return refuse("Wait for the claim on the bot's discard to settle.");
    if (seatOfEmail(table.seats, member.email) >= 0) return refuse("You're playing already.");
    const held = await heldSeatOf(ctx, member.email);
    if (held && held.table._id !== table._id && held.table.phase === "playing") return refuse(`Your other seat is still in a hand. Sit back down there, or ${forCoins(held.table.settings) ? "give it up first" : "wait for that hand to end"}.`);
    const short = await shortOf(ctx, member.email, table.settings, now);
    if (short) return refuse(shortWords(short));
    const seats = table.seats.map((s, i) => (i === seat ? { kind: "human" as const, email: member.email, name: member.name } : s));
    await ctx.db.patch("mahjongTables", table._id, { seats, allAwayAt: undefined, ...(table.host === undefined ? { host: member.email } : {}) });
    await putPlayer(ctx, member.email, table._id, seat);
    await controlChanged(ctx, table._id, now, seat);
    return done;
  },
});

/** Gets up from the table: walks a step back from the stool, which frees the seat (or, mid-hand, hands it to a bot). */
export const leave = mutation({
  args: { cost: v.optional(v.number()) },
  returns: v.union(v.null(), refusedReply),
  handler: async (ctx, { cost }) => {
    const { member, state } = await requireMe(ctx);
    const now = Date.now();
    const held = await heldSeatOf(ctx, member.email);
    const row = held && held.table.phase === "playing" ? await handRowOf(ctx, held.table._id) : null;
    const stage = row?.state.stage;
    if (held && forCoins(held.table.settings) && stage?.kind === "claim" && stage.from === held.seat) return refuse("Wait for the others to answer your discard first.");
    await stepBack(ctx, member, state, now);
    if (held && held.table.phase === "playing" && forCoins(held.table.settings) && held.table.seats[held.seat].kind === "human") {
      const charge = await giveUpCharge(ctx, held.table, held.seat, now);
      if (cost !== undefined && charge > cost) return refuse(`Giving up now costs ${charge} SOW coin${charge === 1 ? "" : "s"}. Try again if you still want to.`);
      await giveUp(ctx, held.table, held.seat, now);
      return null;
    }
    await mahjongStood(ctx, member.email, now);
    return null;
  },
});

/** Gets someone up off a mahjong stool: a step back from the table, standing. */
const stepBack = async (ctx: MutationCtx, member: Doc<"worldMembers">, state: Doc<"worldState">, now: number) => {
  const at = mahjongSeatOf(state.seat);
  const seat = at && seatIn(placeOf(member), state.seat);
  if (!seat || !at) return;
  const table = PLACE_TABLE_CENTRE(at.table);
  const dx = seat.x - table.x;
  const dz = seat.z - table.z;
  const length = Math.hypot(dx, dz) || 1;
  const to = clampTarget(seat.x + (dx / length) * LEAVE_STEP, seat.z + (dz / length) * LEAVE_STEP, placeOf(member));
  await ctx.db.patch("worldState", state._id, { fromX: seat.x, fromZ: seat.z, toX: to.x, toZ: to.z, startedAt: now, path: undefined, heading: undefined, seat: undefined });
};

const giveUp = async (ctx: MutationCtx, table: Table, seat: number, now: number) => {
  const s = table.seats[seat];
  if (s.kind !== "human") return;
  const row = await handRowOf(ctx, table._id);
  const present = presentSeats(table.seats);
  const charged = row ? await chargeGiveUp(ctx, table, seat, present, `mahjong:${row._id}:gave-up`, now) : [0, 0, 0, 0];
  await dropPlayer(ctx, s.email, table._id);
  const seats = table.seats.map((x, i) => (i === seat ? { kind: "bot" as const, name: botName(i) } : x));
  const net = table.net.map((n, i) => (i === seat ? 0 : n + charged[i]));
  await saveSeats(ctx, table, seats, { net });
  await controlChanged(ctx, table._id, now);
};

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
  short: v.boolean(),
  // The bot playing an away person's seat, whose name the table shows while they're gone.
  standIn: v.union(v.null(), v.string()),
});

const viewSeats = async (ctx: Ctx, table: Table, email: string) => {
  const out = [];
  const need = coinsToSit(table.settings);
  for (const [i, s] of table.seats.entries()) {
    const member = s.kind === "human" ? await memberByEmail(ctx, s.email) : null;
    const balance = s.kind === "human" && need > 0 ? ((await walletOf(ctx, s.email))?.balance ?? START_COINS) : need;
    out.push({
      kind: s.kind,
      name: s.kind === "empty" ? "" : s.name,
      member: member && member.roomId === table.roomId ? member._id : null,
      isMe: s.kind === "human" && s.email === email,
      away: s.kind === "human" && s.away !== undefined,
      ready: s.kind === "human" && s.ready === true,
      net: table.net[i] ?? 0,
      short: balance < need,
      standIn: s.kind === "human" && s.away !== undefined ? botName(i) : null,
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
  coinsToSit: v.number(),
  startsAt: v.union(v.null(), v.number()),
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
  coinsToSit: coinsToSit(table.settings),
  startsAt: table.phase === "lobby" ? (table.startsAt ?? null) : null,
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
  returns: v.union(v.null(), v.object({ ...tableViewFields, mySeat: v.number(), isHost: v.boolean(), giveUpCost: v.number(), ...handFields })),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    const held = email ? await heldSeatOf(ctx, email) : null;
    if (!email || !held) return null;
    const others = presentSeats(held.table.seats).filter((here, i) => here && i !== held.seat).length;
    const balance = (await walletOf(ctx, email))?.balance ?? START_COINS;
    const giveUpCost = held.table.phase === "playing" && others > 0 ? Math.min(giveUpCoins(held.table.settings), balance) : 0;
    return { ...(await tableView(ctx, held.table, email)), mySeat: held.seat, isHost: held.table.host === email, giveUpCost, ...(await handFor(ctx, held.table, held.seat)) };
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


import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { CAFE_PLACE } from "../shared/cafeGames";
import {
  botName,
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
import { clampTarget, seatIn } from "../shared/world";
import { mahjongPhaseValidator, mahjongSettingsValidator } from "./mahjongData";
import { Ctx, optionalEmail, requireEmail } from "./model";
import { memberByEmail, placeOf, requireMe } from "./world";

type Table = Doc<"mahjongTables">;

const LEAVE_STEP = 0.75;

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
  // A hand that's over goes back to the lobby when someone's seat empties.
  await saveSeats(ctx, table, seats, table.phase === "ended" ? { phase: "lobby" } : {});
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
const controlChanged = async (_ctx: MutationCtx, _tableId: Id<"mahjongTables">, _now: number) => {};

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

const okReply = v.object({ ok: v.literal(true) });
const refusedReply = v.object({ ok: v.literal(false), reason: v.string() });
const refuse = (reason: string) => ({ ok: false as const, reason });
const done = { ok: true as const };

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
    await ctx.db.patch("mahjongTables", table._id, { phase: "playing", handNo: table.handNo + 1 });
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

/** The caller's table, when they hold a seat at one. */
export const mine = query({
  args: {},
  returns: v.union(v.null(), v.object({ ...tableViewFields, mySeat: v.number(), isHost: v.boolean() })),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    const held = email ? await heldSeatOf(ctx, email) : null;
    if (!email || !held) return null;
    return { ...(await tableView(ctx, held.table, email)), mySeat: held.seat, isHost: held.table.host === email };
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


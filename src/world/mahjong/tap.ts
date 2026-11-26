import { mahjongSeatId, mahjongSeatOf, type MahjongTableId } from "@shared/mahjong/table";

type SeatSummary = { kind: "empty" | "human" | "bot"; name: string; away: boolean; member: string | null };
export type TableSummary = { id: string; table: string; phase: "lobby" | "playing" | "ended"; seats: readonly SeatSummary[] };

export type MahjongTap<Id extends string = string> = { kind: "sit"; seat: string } | { kind: "watch"; tableId: Id } | { kind: "taken" };

const live = (t: TableSummary) => t.phase !== "lobby";

/**
 * What tapping a mahjong seat does. Before a hand: sit in it, or the
 * nearest free seat at that table. During one: a bot's seat (which looks
 * free in the World, since bots aren't drawn) is sat in, so you can take it
 * over; anyone else's opens the game to watch. Your own seat is always
 * yours to sit back in. Null when it isn't a mahjong seat.
 */
export const mahjongTap = <T extends TableSummary>(seatId: string, tables: readonly T[], me: string | null): MahjongTap<T["id"]> | null => {
  const at = mahjongSeatOf(seatId);
  if (!at) return null;
  const table = tables.find((t) => t.table === at.table);
  if (!table) return { kind: "sit", seat: seatId };
  const mine = me === null ? -1 : table.seats.findIndex((s) => s.kind === "human" && s.member === me);
  if (mine >= 0) return { kind: "sit", seat: mahjongSeatId(at.table, mine) };
  const seat = table.seats[at.seat];
  if (live(table)) return seat.kind === "bot" ? { kind: "sit", seat: seatId } : { kind: "watch", tableId: table.id };
  if (seat.kind === "empty") return { kind: "sit", seat: seatId };
  const free = [1, 3, 2].map((d) => (at.seat + d) % 4).find((i) => table.seats[i].kind === "empty");
  return free === undefined ? { kind: "taken" } : { kind: "sit", seat: mahjongSeatId(at.table, free) };
};

/** The game to watch when tapping someone: the table they're playing at, if a hand is on. */
export const tableToWatch = <T extends TableSummary>(tables: readonly T[], memberId: string | undefined): T["id"] | null =>
  memberId === undefined ? null : (tables.find((t) => live(t) && t.seats.some((s) => s.kind === "human" && s.member === memberId))?.id ?? null);

/** The bot seat you're sitting in during a hand, which you could take over. */
export const botSeatUnder = <T extends TableSummary>(tables: readonly T[], seatId: string | undefined): { tableId: T["id"]; table: MahjongTableId; seat: number; name: string } | null => {
  const at = mahjongSeatOf(seatId);
  const table = at && tables.find((t) => t.table === at.table);
  if (!at || !table || !live(table) || table.seats[at.seat].kind !== "bot") return null;
  return { tableId: table.id, table: at.table, seat: at.seat, name: table.seats[at.seat].name };
};

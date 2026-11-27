import { mahjongSeatId, mahjongSeatOf, type MahjongTableId } from "../../../shared/mahjong/table";

type SeatSummary = { kind: "empty" | "human" | "bot"; name: string; away: boolean; member: string | null };
export type TableSummary = { id: string; table: string; phase: "lobby" | "playing" | "ended"; seats: readonly SeatSummary[] };

type MahjongTap<Id extends string = string> = { kind: "sit"; seat: string } | { kind: "watch"; tableId: Id } | { kind: "taken" };

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

/** Every stool a bot is playing during a hand: a tap there should sit you down to take it over, whoever is drawn over it. */
export const takeoverSeats = (tables: readonly TableSummary[]) =>
  new Set(tables.flatMap((t) => (live(t) ? t.seats.flatMap((s, i) => (s.kind === "bot" ? [mahjongSeatId(t.table as MahjongTableId, i)] : [])) : [])));

/** The bot seat you're sitting in during a hand, which you could take over. */
export const botSeatUnder = <T extends TableSummary>(tables: readonly T[], seatId: string | undefined): { tableId: T["id"]; table: MahjongTableId; seat: number; name: string } | null => {
  const at = mahjongSeatOf(seatId);
  const table = at && tables.find((t) => t.table === at.table);
  if (!at || !table || !live(table) || table.seats[at.seat].kind !== "bot") return null;
  return { tableId: table.id, table: at.table, seat: at.seat, name: table.seats[at.seat].name };
};

/**
 * The tag over each person playing a hand, in the World, like the 1v1
 * games' "vs" tag: "🀄 Mahjong", or just 🀄 when someone else at the table
 * sits beside them (`with`).
 */
export const mahjongTags = (tables: readonly TableSummary[]) => {
  const tags = new Map<string, { tag: string; icon: string; with: string }>();
  for (const table of tables) {
    if (!live(table)) continue;
    const players = table.seats.flatMap((s) => (s.kind === "human" && s.member !== null && !s.away ? [s.member] : []));
    for (const member of players) tags.set(member, { tag: "🀄 Mahjong", icon: "🀄", with: players.find((other) => other !== member) ?? "" });
  }
  return tags;
};

const SLIDE_TO_DISCARD = 40;

export const isSlideUp = (dx: number, dy: number) => dy <= -SLIDE_TO_DISCARD && Math.abs(dy) > Math.abs(dx) * 1.5;

/** A tile being dragged up or down: either way the drag is the tile's, so it never also counts as a tap (which could discard). */
export const startsSlide = (dx: number, dy: number) => Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.5;

/** A drag along the hand (sideways), which picks whichever tile is under the finger as it goes. */
export const startsScrub = (dx: number, dy: number) => Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2;

export type TileRect = { tile: number; x: number; y: number; width: number; height: number };

/**
 * The tile under a point of the hand, scrubbing: the row nearest the point
 * (so a finger a little above or below the tiles still counts), then the
 * tile across it, gaps going to the nearer tile. Null when the point is
 * well off the hand.
 */
export const tileUnder = (rects: readonly TileRect[], x: number, y: number): number | null => {
  if (rects.length === 0) return null;
  const rowOf = (r: TileRect) => r.y + r.height / 2;
  const height = Math.max(...rects.map((r) => r.height));
  const nearestRow = rects.reduce((best, r) => (Math.abs(rowOf(r) - y) < Math.abs(rowOf(best) - y) ? r : best));
  if (Math.abs(rowOf(nearestRow) - y) > height * 1.5) return null;
  const row = rects.filter((r) => Math.abs(rowOf(r) - rowOf(nearestRow)) < height / 2);
  const left = Math.min(...row.map((r) => r.x));
  const right = Math.max(...row.map((r) => r.x + r.width));
  if (x < left - height / 2 || x > right + height / 2) return null;
  return row.reduce((best, r) => (Math.abs(r.x + r.width / 2 - x) < Math.abs(best.x + best.width / 2 - x) ? r : best)).tile;
};

/**
 * A slide down puts a picked tile back. Any slide down the tile took (see
 * startsSlide) counts, however short: on iOS the release can report much less
 * of the drag than the finger moved (a 60 point flick ended at 34), and
 * putting a tile back is harmless.
 */
export const isSlideDown = (dx: number, dy: number) => startsSlide(dx, dy) && dy > 0;

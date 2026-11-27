import { WIND_NAMES } from "./tiles";

/**
 * The two mahjong tables in the online Café, and who sits where. A table's
 * World seats are `mahjong-a-0` … `mahjong-a-3`: seat 0 is East's place at
 * the table, then South, West and North in turn order.
 */

export const MAHJONG_TABLES = ["mahjong-a", "mahjong-b"] as const;
export type MahjongTableId = (typeof MAHJONG_TABLES)[number];
export const isMahjongTable = (value: unknown): value is MahjongTableId => typeof value === "string" && (MAHJONG_TABLES as readonly string[]).includes(value);
export const MAHJONG_TABLE_NAMES: Record<MahjongTableId, string> = { "mahjong-a": "Table 1", "mahjong-b": "Table 2" };

export const mahjongSeatId = (table: MahjongTableId, seat: number) => `${table}-${seat}`;

/** The table and seat a World seat is, or null when it isn't at a mahjong table. */
export const mahjongSeatOf = (seatId: string | undefined): { table: MahjongTableId; seat: number } | null => {
  const found = seatId === undefined ? null : /^(mahjong-[a-z])-([0-3])$/.exec(seatId);
  if (!found || !isMahjongTable(found[1])) return null;
  return { table: found[1], seat: Number(found[2]) };
};

/** The seat's place at the table, as the lobby names it. */
export const seatPlace = (seat: number) => WIND_NAMES[seat];

export type TableSeat =
  | { kind: "empty" }
  | { kind: "human"; email: string; name: string; away?: number; ready?: boolean }
  | { kind: "bot"; name: string };

/** A table's rules, which the host sets in the lobby: 3 to 10 faan, flowers, 1 coin a point. */
export type Settings = { minFaan: number; maxFaan: number; stake: number; coins?: boolean; turnSeconds?: number; claimSeconds?: number };
export const TURN_SECONDS = { choices: [10, 15, 20, 30, 45, 60], fallback: 30, min: 10, max: 60 } as const;
export const CLAIM_SECONDS = { choices: [3, 5, 8, 10, 15], fallback: 5, min: 3, max: 15 } as const;
export const DEFAULT_SETTINGS: Settings = { minFaan: 0, maxFaan: 10, stake: 1, coins: false, turnSeconds: TURN_SECONDS.fallback, claimSeconds: CLAIM_SECONDS.fallback };
export const turnMsOf = (s: Settings) => (s.turnSeconds ?? TURN_SECONDS.fallback) * 1000;
export const claimMsOf = (s: Settings) => (s.claimSeconds ?? CLAIM_SECONDS.fallback) * 1000;
const wholeIn = (value: number | undefined, range: { min: number; max: number }) => value === undefined || (Number.isInteger(value) && value >= range.min && value <= range.max);
export const FAAN_LIMITS = { min: 0, max: 13 } as const;
export const MIN_FAAN_CHOICES = [0, 1, 3] as const;
const STAKES = [1, 2, 5] as const;

export const forCoins = (s: Settings) => s.coins === true;

export const validSettings = (s: Settings) =>
  Number.isInteger(s.minFaan) &&
  Number.isInteger(s.maxFaan) &&
  s.minFaan >= FAAN_LIMITS.min &&
  s.maxFaan <= FAAN_LIMITS.max &&
  s.minFaan <= s.maxFaan &&
  (STAKES as readonly number[]).includes(s.stake) &&
  wholeIn(s.turnSeconds, TURN_SECONDS) &&
  wholeIn(s.claimSeconds, CLAIM_SECONDS);

export const EMPTY_SEAT: TableSeat = { kind: "empty" };
export const emptySeats = (): TableSeat[] => [EMPTY_SEAT, EMPTY_SEAT, EMPTY_SEAT, EMPTY_SEAT];

const BOT_NAMES = ["Lucky Bot", "Bamboo Bot", "Dragon Bot", "Lotus Bot"] as const;

/** A bot's name: one per seat, so two bots at a table never share one. */
export const botName = (seat: number) => BOT_NAMES[seat % BOT_NAMES.length];

export const seatOfEmail = (seats: readonly TableSeat[], email: string) => seats.findIndex((s) => s.kind === "human" && s.email === email);

export const humanSeats = (seats: readonly TableSeat[]) => seats.flatMap((s, i) => (s.kind === "human" ? [i] : []));

/** Who hosts once the host has gone: the next seated human after their seat, in turn order. */
export const nextHost = (seats: readonly TableSeat[], from: number): string | undefined => {
  for (let d = 1; d <= seats.length; d++) {
    const s = seats[(from + d) % seats.length];
    if (s.kind === "human") return s.email;
  }
  return undefined;
};

export const tableFull = (seats: readonly TableSeat[]) => seats.every((s) => s.kind !== "empty");

/** Which seats a bot plays this hand: the bots, and anyone who's walked away. */
export const botControlled = (seats: readonly TableSeat[]) => seats.map((s) => s.kind === "bot" || (s.kind === "human" && s.away !== undefined));

/** Whether every human at the table has walked away (so the hand waits for them). */
export const everyoneAway = (seats: readonly TableSeat[]) => {
  const humans = seats.filter((s) => s.kind === "human");
  return humans.length > 0 && humans.every((s) => s.away !== undefined);
};

/** Whether the next round can start: everyone seated is here and has asked for it. */
export const allReady = (seats: readonly TableSeat[]) => {
  const humans = seats.filter((s) => s.kind === "human");
  return tableFull(seats) && humans.length > 0 && humans.every((s) => s.away === undefined && s.ready === true);
};

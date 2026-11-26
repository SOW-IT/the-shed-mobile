import { sydneyYmd } from "./flow";
import { SCORES_RESET_AT, type GameId, type GameVersion } from "./games";

export const START_COINS = 50;

/** What 1st, 2nd and 3rd on a game's leaderboard pay. No other place pays. */
export const PLACE_COINS = [50, 25, 10] as const;

/** What a place on a leaderboard is worth: nothing below 3rd. */
export const PAYOUT_MIN_ENTRIES = 10;

export const payoutMinEntries = (version: GameVersion): number => (version === 1 ? 0 : PAYOUT_MIN_ENTRIES);

export const coinsForPlace = (place: number): number => PLACE_COINS[place - 1] ?? 0;

/**
 * Which leaderboard a payout belongs to. A game has one board for everyone,
 * kept until its scores are wiped, so the reset time names the board: after
 * a wipe the places can be won, and paid, again.
 */
export const boardOf = (game: GameId, version: GameVersion = 1): string =>
  `${game}:${version === 1 ? "" : `v${version}:`}${SCORES_RESET_AT[game] ?? 0}`;

/**
 * What a run that leaves you at `place` pays, given what this board has
 * already paid you. Climbing pays the difference, and a place you've been
 * paid for (or bettered) pays nothing again, so a board pays a person at most
 * 1st place's coins in all.
 */
export const placePayout = (place: number, paidOnBoard: number): number => Math.max(0, coinsForPlace(place) - paidOnBoard);

export const ordinal = (place: number): string => {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] ?? "th"}`;
};

export const coinDay = (ms: number): string => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

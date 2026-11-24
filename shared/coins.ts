import { sydneyYmd } from "./flow";
import type { GameId } from "./games";

export const START_COINS = 50;
export const DAILY_COIN_CAP = 200;

export const COIN_TIERS: Record<GameId, readonly { over: number; coins: number }[]> = {
  flappy: [
    { over: 500, coins: 10 },
    { over: 750, coins: 20 },
  ],
  runner: [
    { over: 12_000, coins: 10 },
    { over: 15_000, coins: 20 },
  ],
  shooter: [
    { over: 10_000, coins: 10 },
    { over: 12_000, coins: 20 },
  ],
};

export const coinsForRun = (game: GameId, score: number): number => {
  let coins = 0;
  for (const tier of COIN_TIERS[game] ?? []) if (score > tier.over) coins = Math.max(coins, tier.coins);
  return coins;
};

export const coinDay = (ms: number): string => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const cappedAward = (coins: number, earnedToday: number): number =>
  Math.max(0, Math.min(coins, DAILY_COIN_CAP - earnedToday));

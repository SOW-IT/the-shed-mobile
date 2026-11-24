import { describe, expect, test } from "vitest";
import { cappedAward, coinDay, coinsForRun, DAILY_COIN_CAP } from "./coins";

describe("coins for a run", () => {
  test.each([
    ["flappy", 500, 0],
    ["flappy", 501, 10],
    ["flappy", 751, 20],
    ["runner", 12_001, 10],
    ["runner", 15_001, 20],
    ["shooter", 10_001, 10],
    ["shooter", 12_001, 20],
    ["shooter", 0, 0],
    ["glider", 8_000, 0],
    ["glider", 8_001, 10],
    ["glider", 12_001, 20],
  ] as const)("%s at %i pays %i", (game, score, coins) => {
    expect(coinsForRun(game, score)).toBe(coins);
  });

  test("the daily cap trims the last award", () => {
    expect(cappedAward(20, 0)).toBe(20);
    expect(cappedAward(20, DAILY_COIN_CAP - 10)).toBe(10);
    expect(cappedAward(20, DAILY_COIN_CAP)).toBe(0);
  });

  test("days are Sydney days", () => {
    expect(coinDay(Date.UTC(2026, 10, 24, 12, 59))).toBe("2026-11-24");
    expect(coinDay(Date.UTC(2026, 10, 24, 13, 1))).toBe("2026-11-25");
  });
});

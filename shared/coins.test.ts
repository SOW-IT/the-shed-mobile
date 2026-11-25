import { describe, expect, test } from "vitest";
import { boardOf, coinDay, coinsForPlace, ordinal, PLACE_COINS, placePayout } from "./coins";
import { SCORES_RESET_AT } from "./games";

describe("coins for a place", () => {
  test.each([
    [1, 50],
    [2, 25],
    [3, 10],
    [4, 0],
    [500, 0],
  ])("place %i pays %i", (place, coins) => {
    expect(coinsForPlace(place)).toBe(coins);
  });

  test("climbing pays the difference, and a place pays once", () => {
    expect(placePayout(3, 0)).toBe(10);
    expect(placePayout(1, 10)).toBe(40);
    expect(placePayout(2, 10)).toBe(15);
    expect(placePayout(1, 25)).toBe(25);
    expect(placePayout(3, 10)).toBe(0);
    expect(placePayout(2, 50)).toBe(0);
    expect(placePayout(1, 50)).toBe(0);
    expect(placePayout(4, 0)).toBe(0);
  });

  test("a board never pays more than 1st place's coins in all", () => {
    let paid = 0;
    for (const place of [3, 2, 3, 1, 2, 1]) paid += placePayout(place, paid);
    expect(paid).toBe(PLACE_COINS[0]);
  });

  test("a game's board is named by its last reset", () => {
    expect(boardOf("flappy")).toBe("flappy:0");
    expect(boardOf("runner")).toBe(`runner:${SCORES_RESET_AT.runner}`);
    expect(boardOf("flappy", 1)).toBe("flappy:0");
    expect(boardOf("flappy", 2)).toBe("flappy:v2:0");
    expect(boardOf("runner", 2)).toBe(`runner:v2:${SCORES_RESET_AT.runner}`);
  });

  test.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [21, "21st"],
  ])("place %i is %s", (place, text) => {
    expect(ordinal(place)).toBe(text);
  });

  test("days are Sydney days", () => {
    expect(coinDay(Date.UTC(2026, 10, 24, 12, 59))).toBe("2026-11-24");
    expect(coinDay(Date.UTC(2026, 10, 24, 13, 1))).toBe("2026-11-25");
  });
});

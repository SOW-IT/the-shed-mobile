import { describe, expect, it } from "vitest";
import { coinsFor, coinsToSit, giveUpCoins, pointsOnly, settle, splitAmong } from "./coins";
import { paysFor } from "./game";
import { DEFAULT_SETTINGS } from "./table";

const human = (balance = 100) => ({ human: true, balance });
const bot = { human: false, balance: 0 };
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe("turning points into SOW coins", () => {
  it("is 8 points to a coin, rounded to the nearest coin, a half rounding up", () => {
    expect([0, 3, 4, 5, 8, 11, 12, 16, 24, 32, 128].map((p) => coinsFor(p))).toEqual([0, 0, 1, 1, 1, 1, 2, 2, 3, 4, 16]);
    expect(coinsFor(16, 2)).toBe(4);
  });
});

describe("settling a hand in coins", () => {
  it("converts each payment on its own, so the winner gets exactly what the payers pay", () => {
    expect(settle(paysFor(1, 0, 8), 2, [human(), human(), human(), human()]).deltas).toEqual([-2, 2, 0, 0]);
    const self = settle(paysFor(0, null, 48), 1, [human(), human(), human(), human()]);
    expect(self.deltas).toEqual([9, -3, -3, -3]);
    expect(sum(self.deltas)).toBe(0);
    const odd = settle(paysFor(0, null, 24), 1, [human(), human(), human(), human()]);
    expect(odd.deltas).toEqual([6, -2, -2, -2]);
    expect(sum(odd.deltas)).toBe(0);
  });

  it("moves nothing for a payment that rounds to no coins", () => {
    expect(settle(paysFor(1, 0, 2), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
  });

  it("takes at most what a person has", () => {
    expect(settle(paysFor(1, 0, 64), 1, [human(5), human(), bot, bot]).deltas).toEqual([-5, 5, 0, 0]);
    expect(settle(paysFor(1, 0, 64), 1, [human(0), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
  });

  it("moves coins only between people: a bot never pays or collects", () => {
    expect(settle(paysFor(0, 2, 64), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
    expect(settle(paysFor(2, 0, 16), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
    expect(settle(paysFor(0, null, 48), 1, [human(), human(), bot, bot]).deltas).toEqual([3, -3, 0, 0]);
    expect(settle(paysFor(2, null, 48), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
  });
});

describe("points, and what a table costs", () => {
  it("scores a hand played for points in full, adding up to nothing", () => {
    expect(pointsOnly(paysFor(2, null, 48)).deltas).toEqual([-24, -24, 72, -24]);
    expect(pointsOnly(paysFor(1, 3, 16)).deltas).toEqual([0, 16, 0, -16]);
  });

  it("needs the most one hand can cost, in coins, to sit, and nothing for points", () => {
    expect(coinsToSit(DEFAULT_SETTINGS)).toBe(0);
    expect(coinsToSit({ ...DEFAULT_SETTINGS, coins: true })).toBe(16);
    expect(coinsToSit({ ...DEFAULT_SETTINGS, coins: true, maxFaan: 6, stake: 2 })).toBe(8);
  });

  it("charges giving up what an ordinary minimum win off your discard costs, in coins", () => {
    expect(giveUpCoins(DEFAULT_SETTINGS)).toBe(0);
    expect(giveUpCoins({ ...DEFAULT_SETTINGS, coins: true })).toBe(0);
    expect(giveUpCoins({ ...DEFAULT_SETTINGS, coins: true, minFaan: 3 })).toBe(1);
    expect(giveUpCoins({ ...DEFAULT_SETTINGS, coins: true, minFaan: 5 })).toBe(3);
  });

  it("splits a charge so the shares add up to it", () => {
    expect(splitAmong(8, 3)).toEqual([3, 3, 2]);
    expect(splitAmong(8, 1)).toEqual([8]);
    expect(sum(splitAmong(7, 2))).toBe(7);
  });
});

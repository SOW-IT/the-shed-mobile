import { describe, expect, it } from "vitest";
import { coinsToSit, giveUpCoins, pointsOnly, settle, splitAmong } from "./coins";
import { paysFor } from "./game";
import { DEFAULT_SETTINGS } from "./table";

const human = (balance = 100) => ({ human: true, balance });
const bot = { human: false, balance: 0 };
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe("settling a hand in coins", () => {
  it("moves coins between people, times the stake, and always adds up", () => {
    const out = settle(paysFor(1, 0, 8), 2, [human(), human(), human(), human()]);
    expect(out).toEqual({ deltas: [-16, 16, 0, 0], fromBank: [0, 0, 0, 0] });
    const self = settle(paysFor(0, null, 48), 1, [human(), human(), human(), human()]);
    expect(self.deltas).toEqual([72, -24, -24, -24]);
    expect(sum(self.deltas)).toBe(0);
  });

  it("takes at most what a person has", () => {
    expect(settle(paysFor(1, 0, 64), 1, [human(10), human(), bot, bot]).deltas).toEqual([-10, 10, 0, 0]);
    expect(settle(paysFor(1, 0, 64), 1, [human(0), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
  });

  it("moves coins only between people: a bot never pays or collects", () => {
    expect(settle(paysFor(0, 2, 64), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
    expect(settle(paysFor(2, 0, 16), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
    expect(settle(paysFor(0, null, 48), 1, [human(), human(), bot, bot]).deltas).toEqual([24, -24, 0, 0]);
    expect(settle(paysFor(2, null, 48), 1, [human(), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
  });
});

describe("points, and what a table costs", () => {
  it("scores a hand played for points in full, adding up to nothing", () => {
    expect(pointsOnly(paysFor(2, null, 48)).deltas).toEqual([-24, -24, 72, -24]);
    expect(pointsOnly(paysFor(1, 3, 16)).deltas).toEqual([0, 16, 0, -16]);
  });

  it("needs the most one hand can cost to sit, and nothing for points", () => {
    expect(coinsToSit(DEFAULT_SETTINGS)).toBe(0);
    expect(coinsToSit({ ...DEFAULT_SETTINGS, coins: true })).toBe(128);
    expect(coinsToSit({ ...DEFAULT_SETTINGS, coins: true, maxFaan: 6, stake: 2 })).toBe(64);
  });

  it("charges giving up what an ordinary minimum win off your discard costs", () => {
    expect(giveUpCoins(DEFAULT_SETTINGS)).toBe(0);
    expect(giveUpCoins({ ...DEFAULT_SETTINGS, coins: true })).toBe(8);
    expect(giveUpCoins({ ...DEFAULT_SETTINGS, coins: true, minFaan: 1, stake: 5 })).toBe(10);
  });

  it("splits a charge so the shares add up to it", () => {
    expect(splitAmong(8, 3)).toEqual([3, 3, 2]);
    expect(splitAmong(8, 1)).toEqual([8]);
    expect(sum(splitAmong(7, 2))).toBe(7);
  });
});

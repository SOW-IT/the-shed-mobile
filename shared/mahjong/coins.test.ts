import { describe, expect, it } from "vitest";
import { bankLeftToday, MAHJONG_BANK_DAILY_CAP, settle } from "./coins";
import { paysFor } from "./game";

const human = (balance = 100, bankLeft = MAHJONG_BANK_DAILY_CAP) => ({ human: true, balance, bankLeft });
const bot = { human: false, balance: 0, bankLeft: 0 };

describe("settling a hand in coins", () => {
  it("moves coins between people, times the stake, and always adds up", () => {
    const out = settle(paysFor(1, 0, 8), 2, [human(), human(), human(), human()]);
    expect(out).toEqual({ deltas: [-16, 16, 0, 0], fromBank: [0, 0, 0, 0] });
    const self = settle(paysFor(0, null, 48), 1, [human(), human(), human(), human()]);
    expect(self.deltas).toEqual([72, -24, -24, -24]);
    expect(self.deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("takes at most what a person has", () => {
    expect(settle(paysFor(1, 0, 64), 1, [human(10), human(), bot, bot]).deltas).toEqual([-10, 10, 0, 0]);
    expect(settle(paysFor(1, 0, 64), 1, [human(0), human(), bot, bot]).deltas).toEqual([0, 0, 0, 0]);
  });

  it("pays a person for a bot from the bank, up to what's left today", () => {
    expect(settle(paysFor(0, 2, 64), 1, [human(), human(), bot, bot])).toEqual({ deltas: [64, 0, -64, 0], fromBank: [64, 0, 0, 0] });
    expect(settle(paysFor(0, 2, 64), 1, [human(100, 20), human(), bot, bot])).toEqual({ deltas: [20, 0, -20, 0], fromBank: [20, 0, 0, 0] });
  });

  it("sends what a person pays a bot to the bank, and bots pay bots nothing real", () => {
    expect(settle(paysFor(2, 0, 16), 1, [human(), human(), bot, bot])).toEqual({ deltas: [-16, 0, 16, 0], fromBank: [0, 0, 0, 0] });
    expect(settle(paysFor(2, 3, 16), 1, [human(), human(), bot, bot])).toEqual({ deltas: [0, 0, 16, -16], fromBank: [0, 0, 0, 0] });
  });

  it("knows what the bank still pays someone today", () => {
    expect(bankLeftToday(undefined, undefined, "2026-11-27")).toBe(MAHJONG_BANK_DAILY_CAP);
    expect(bankLeftToday("2026-11-27", 150, "2026-11-27")).toBe(50);
    expect(bankLeftToday("2026-11-26", 150, "2026-11-27")).toBe(MAHJONG_BANK_DAILY_CAP);
    expect(bankLeftToday("2026-11-27", 500, "2026-11-27")).toBe(0);
    expect(bankLeftToday("2026-11-27", undefined, "2026-11-27")).toBe(MAHJONG_BANK_DAILY_CAP);
  });
});

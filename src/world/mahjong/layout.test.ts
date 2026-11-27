import { describe, expect, it } from "vitest";
import { DRAWN_GAP, HAND_GAP, PAD, RIVER_GAP, RIVER_LABEL, STRIP_GAP, TABLE_MAX_WIDTH, tableLayout } from "./layout";

describe("the table's tile sizes", () => {
  it.each([360, 375, 402, 430])("fits a full hand of 14, the drawn tile apart, across a %ipx phone", (width) => {
    const { hand } = tableLayout(width);
    expect(PAD * 2 + 14 * hand + 13 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
    expect(PAD * 2 + 14 * (hand + 1) + 13 * HAND_GAP + DRAWN_GAP).toBeGreaterThan(width);
  });

  it("makes the iPhone 17's hand and discards bigger than the old 25 and 15 points", () => {
    const { hand, river } = tableLayout(402);
    expect(hand).toBeGreaterThanOrEqual(26);
    expect(river).toBeGreaterThanOrEqual(21);
  });

  it("fits a row of discards and three player cards across the width", () => {
    const l = tableLayout(402);
    expect(RIVER_LABEL + l.riverPerRow * (l.river + RIVER_GAP)).toBeLessThanOrEqual(402 - PAD * 2);
    expect(3 * l.card + 2 * STRIP_GAP).toBeLessThanOrEqual(402 - PAD * 2);
  });

  it("stops growing past a phone-sized column on a wide screen", () => {
    expect(tableLayout(1400)).toEqual(tableLayout(TABLE_MAX_WIDTH));
    expect(tableLayout(1400).width).toBe(TABLE_MAX_WIDTH);
  });
});

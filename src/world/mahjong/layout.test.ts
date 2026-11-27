import { describe, expect, it } from "vitest";
import { acrossFit, acrossHeightOf, acrossRows, DRAWN_GAP, HAND_GAP, meldSize, MIDDLE_MIN, PAD, pileCap, pileSizes, RIVER_GAP, SIDE_COLUMN, sideFit, sideSpot, TABLE_GAP, TABLE_MAX_WIDTH, tableLayout, TILE_TALL } from "./layout";

const PHONE = { width: 402, height: 874 };
// The table's height below the across seat on that phone with the two-row hand, as the mockup measured it.
const PHONE_TABLE = 284;
const counts = (n: number) => ({ mine: n, across: n, left: n, right: n });

describe("the table's width", () => {
  it.each([360, 375, 402, 430])("fits a two-row hand of 7 and 7 with the drawn tile apart, bigger than one row, across a %ipx phone", (width) => {
    const { handTwo, hand } = tableLayout(width, 874);
    expect(PAD * 2 + 8 * handTwo + 7 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
    expect(handTwo).toBeGreaterThan(hand * 1.5);
  });

  it.each([360, 375, 402, 430])("fits a full hand of 14, the drawn tile apart, across a %ipx phone", (width) => {
    const { hand } = tableLayout(width, 874);
    expect(PAD * 2 + 14 * hand + 13 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
  });

  it("grows past 560 points on a wide screen, with the window's height, up to a limit", () => {
    expect(tableLayout(1280, 800).width).toBe(880);
    expect(tableLayout(1920, 1200).width).toBe(TABLE_MAX_WIDTH);
    expect(tableLayout(1280, 400).width).toBe(560);
    expect(tableLayout(PHONE.width, PHONE.height).width).toBe(PHONE.width);
  });

  it("fits A's and C's seat columns, both side piles and the compass across the table", () => {
    const l = tableLayout(PHONE.width, PHONE.height);
    expect(2 * SIDE_COLUMN + 2 * TABLE_GAP + l.centre).toBe(l.inner);
    expect(2 * l.sideWidth + 44 + 2 * TABLE_GAP).toBeLessThanOrEqual(l.centre);
  });
});

describe("the discard piles", () => {
  const layout = tableLayout(PHONE.width, PHONE.height);
  const cap = pileCap(layout, layout.handTwo);

  it("start big and get smaller as they grow, and are never bigger than your hand's tiles", () => {
    const sizes = [1, 6, 12, 18, 24, 30].map((n) => pileSizes({ layout, height: PHONE_TABLE, counts: counts(n), cap }));
    for (const s of sizes) {
      expect(s.across).toBeLessThanOrEqual(layout.handTwo);
      expect(s.side).toBeLessThanOrEqual(layout.handTwo);
    }
    // The table keeps the smallest size so far in a hand, so the piles never grow back even where a bigger pile happens to fit a little better.
    expect(sizes.at(-1)!.across).toBeLessThan(sizes[1].across);
    expect(sizes.at(-1)!.side).toBeLessThan(sizes[1].side);
    expect(sizes[1].across).toBeGreaterThanOrEqual(30);
    expect(sizes[2].across).toBeGreaterThanOrEqual(22);
    expect(sizes[4].across).toBeGreaterThanOrEqual(16);
  });

  it.each([1, 6, 12, 18, 24, 34])("fits %i discards each in their boxes without overlapping the middle", (n) => {
    const s = pileSizes({ layout, height: PHONE_TABLE, counts: counts(n), cap });
    const { perRow, rows } = acrossRows(n);
    expect(perRow * (s.across + RIVER_GAP) - RIVER_GAP).toBeLessThanOrEqual(layout.centre);
    expect(rows * (Math.round(s.across * TILE_TALL) + RIVER_GAP) - RIVER_GAP).toBeLessThanOrEqual(s.acrossHeight);
    expect(2 * s.acrossHeight + s.middle + 2 * TABLE_GAP).toBeLessThanOrEqual(PHONE_TABLE);
    expect(s.middle).toBeGreaterThanOrEqual(MIDDLE_MIN);
    for (let i = 0; i < n; i++) {
      for (const side of ["left", "right"] as const) {
        const at = sideSpot(i, s.side, { width: layout.sideWidth, height: s.middle }, side);
        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.y).toBeGreaterThanOrEqual(0);
        expect(at.x + Math.round(s.side * TILE_TALL)).toBeLessThanOrEqual(layout.sideWidth);
        expect(at.y + s.side).toBeLessThanOrEqual(s.middle);
      }
    }
  });

  it("lays B's and your discards in two rows, the first on top", () => {
    expect(acrossRows(1)).toEqual({ perRow: 1, rows: 1 });
    expect(acrossRows(6)).toEqual({ perRow: 3, rows: 2 });
    expect(acrossRows(13)).toEqual({ perRow: 7, rows: 2 });
  });

  it("runs A's discards down from the top and C's up from the bottom, each starting at their own seat", () => {
    const box = { width: 105, height: 100 };
    const a = [0, 1, 2, 3].map((i) => sideSpot(i, 20, box, "left"));
    expect(a.map((p) => p.y)).toEqual([0, 22, 44, 66]);
    expect(a.every((p) => p.x === 0)).toBe(true);
    expect(sideSpot(4, 20, box, "left")).toEqual({ x: 29, y: 0 });
    const c = [0, 1, 2, 3].map((i) => sideSpot(i, 20, box, "right"));
    expect(c.map((p) => p.y)).toEqual([80, 58, 36, 14]);
    expect(c.every((p) => p.x === 105 - 27)).toBe(true);
    expect(sideSpot(4, 20, box, "right")).toEqual({ x: 105 - 27 - 29, y: 80 });
  });

  it("is roomier on web, and smaller but whole on a short phone", () => {
    const web = tableLayout(1280, 800);
    expect(pileSizes({ layout: web, height: 276, counts: counts(12), cap: pileCap(web, web.handTwo) }).across).toBeGreaterThan(pileSizes({ layout, height: PHONE_TABLE, counts: counts(12), cap }).across);
    const se = tableLayout(375, 667);
    const small = pileSizes({ layout: se, height: 270, counts: counts(18), cap: pileCap(se, se.hand) });
    expect(small.across).toBeGreaterThanOrEqual(14);
  });

  it("keeps A's and C's piles in columns of at least three on a wide screen, so they still run down and up", () => {
    const web = tableLayout(1100, 800);
    for (const n of [5, 8, 12]) {
      const s = pileSizes({ layout: web, height: 276, counts: counts(n), cap: pileCap(web, web.handTwo) });
      const perColumn = Math.floor((s.middle + RIVER_GAP) / (s.side + RIVER_GAP));
      expect(perColumn).toBeGreaterThanOrEqual(Math.min(n, 3));
    }
  });

  it.each([
    ["only A has discarded", { mine: 0, across: 0, left: 1, right: 0 }],
    ["B and you haven't discarded", { mine: 0, across: 0, left: 9, right: 9 }],
    ["nobody has discarded", { mine: 0, across: 0, left: 0, right: 0 }],
  ])("leaves the middle its share when %s", (_, c) => {
    const s = pileSizes({ layout, height: PHONE_TABLE, counts: c, cap });
    expect(s.acrossHeight).toBe(acrossHeightOf(s.across));
    expect(2 * s.acrossHeight + s.middle + 2 * TABLE_GAP).toBeLessThanOrEqual(PHONE_TABLE);
    expect(s.middle).toBeGreaterThan(MIDDLE_MIN);
    // A side pile is as big as when B's pile and yours hold a tile each.
    expect(s.side).toBeGreaterThanOrEqual(pileSizes({ layout, height: PHONE_TABLE, counts: { ...c, mine: 1, across: 1 }, cap }).side);
  });

  it("fits nothing to an empty pile", () => {
    expect(acrossFit(0, 100, 100)).toBe(Infinity);
    expect(sideFit(0, 100, 100)).toBe(Infinity);
  });
});

describe("the melds of A, B and C", () => {
  const layout = tableLayout(PHONE.width, PHONE.height);
  const none = { tiles: 0, melds: 0 };

  it("share one size, bigger than the old concealed stack's, and fit B's row and A's and C's columns", () => {
    const size = meldSize({ layout, height: PHONE_TABLE, across: { tiles: 6, melds: 2 }, left: { tiles: 3, melds: 1 }, right: { tiles: 7, melds: 2 } });
    expect(size).toBeGreaterThanOrEqual(22);
    expect(Math.round(size * TILE_TALL)).toBeLessThanOrEqual(SIDE_COLUMN);
    expect(7 * (size + 1) + 4).toBeLessThanOrEqual(PHONE_TABLE - 74);
  });

  it("shrinks for four kongs, but never below a readable size", () => {
    const kongs = { tiles: 16, melds: 4 };
    const size = meldSize({ layout, height: PHONE_TABLE, across: kongs, left: kongs, right: kongs });
    expect(size).toBeGreaterThanOrEqual(8);
    expect(size).toBeLessThan(meldSize({ layout, height: PHONE_TABLE, across: none, left: none, right: none }));
  });
});

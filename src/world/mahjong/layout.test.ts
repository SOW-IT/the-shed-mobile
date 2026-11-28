import { describe, expect, it } from "vitest";
import { acrossFit, acrossHeightOf, acrossRows, BIG_TILE, DRAWN_GAP, HAND_GAP, meldOrder, meldRun, meldSize, MIDDLE_MIN, PAD, pileCap, pileSizes, RIVER_GAP, SIDE_COLUMN, sideFit, sideSpot, TABLE_GAP, TABLE_MAX_WIDTH, tableLayout, TILE_TALL } from "./layout";

const PHONE = { width: 402, height: 874 };
// The table's height below the across seat on that phone with the two-row hand, as the mockup measured it.
const PHONE_TABLE = 284;
const counts = (n: number) => ({ mine: n, across: n, left: n, right: n });

describe("the table's width", () => {
  it.each([360, 375, 402, 430])("fits a two-row hand of 7 and 7 with the drawn tile apart, bigger than one row, across a %ipx phone", (width) => {
    const { handTwo, hand, oneRow } = tableLayout(width, 874);
    expect(PAD * 2 + 7 * handTwo + 6 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
    expect(handTwo).toBeGreaterThan(hand * 1.5);
    expect(handTwo).toBeGreaterThanOrEqual(width >= 402 ? 52 : 46);
    expect(oneRow).toBe(false);
  });

  it.each([
    ["a tablet", 820, 1180, 56],
    ["a tablet on its side", 1180, 820, 78],
    ["a laptop window", 1280, 800, 76],
    ["a wide desktop window", 1920, 1080, 96],
  ])("lays the hand in one row on %s, the tiles much bigger than a phone's", (_, width, height, least) => {
    const l = tableLayout(width, height);
    expect(l.oneRow).toBe(true);
    expect(l.hand).toBeGreaterThanOrEqual(least);
    expect(PAD * 2 + 14 * l.hand + 13 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(l.width);
    // Never taller than a tenth of the window (or the two-row size on a phone), so the board keeps its room.
    expect(l.hand).toBeLessThanOrEqual(Math.max(BIG_TILE, Math.round(height * 0.1)));
  });

  it.each([360, 375, 402, 430])("fits a full hand of 14, the drawn tile apart, across a %ipx phone", (width) => {
    const { hand } = tableLayout(width, 874);
    expect(PAD * 2 + 14 * hand + 13 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
  });

  it("grows past 560 points on a wide screen, with the window's height, up to a limit", () => {
    expect(tableLayout(1280, 800).width).toBe(1120);
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

  it("sizes the side piles against the middle the table renders, going compact on a very short table", () => {
    const se = tableLayout(375, 667);
    const s = pileSizes({ layout: se, height: 130, counts: { mine: 0, across: 0, left: 24, right: 0 }, cap: pileCap(se, se.hand) });
    const rendered = 130 - 2 * TABLE_GAP - 2 * acrossHeightOf(s.across);
    expect(s.middle).toBe(rendered);
    expect(s.acrossHeight).toBe(acrossHeightOf(s.across));
    const last = sideSpot(23, s.side, { width: se.sideWidth, height: s.middle }, "left");
    expect(last.y + s.side).toBeLessThanOrEqual(s.middle);
    expect(last.x + Math.round(s.side * TILE_TALL)).toBeLessThanOrEqual(se.sideWidth);
  });

  it("fits nothing to an empty pile", () => {
    expect(acrossFit(0, 100, 100)).toBe(Infinity);
    expect(sideFit(0, 100, 100)).toBe(Infinity);
  });
});

describe("the melds of A, B and C", () => {
  const layout = tableLayout(PHONE.width, PHONE.height);
  const none = { tiles: 0, melds: 0, sideways: 0 };

  it("share one size, bigger than the old concealed stack's, and fit B's row and A's and C's columns", () => {
    const size = meldSize({ layout, height: PHONE_TABLE, across: { tiles: 6, melds: 2, sideways: 2 }, left: { tiles: 3, melds: 1, sideways: 1 }, right: { tiles: 7, melds: 2, sideways: 2 } });
    expect(size).toBeGreaterThanOrEqual(22);
    expect(Math.round(size * TILE_TALL)).toBeLessThanOrEqual(SIDE_COLUMN);
    expect(7 * (size + 1) + 2 * Math.ceil(size * (TILE_TALL - 1)) + 4).toBeLessThanOrEqual(PHONE_TABLE - 74);
  });

  it("shrinks for four kongs, but never below a readable size", () => {
    const kongs = { tiles: 16, melds: 4, sideways: 4 };
    const size = meldSize({ layout, height: PHONE_TABLE, across: kongs, left: kongs, right: kongs });
    expect(size).toBeGreaterThanOrEqual(8);
    expect(size).toBeLessThan(meldSize({ layout, height: PHONE_TABLE, across: none, left: none, right: none }));
  });
});

describe("a claimed tile, laid sideways", () => {
  // You're seat 0: C (on your right) is 1, B (across) 2, A (on your left) 3.
  const pong = (from: number | null, concealed = false) => ({ tiles: [40, 41, 42], from, claimed: 42, concealed });
  const kong = (from: number) => ({ tiles: [80, 81, 82, 83], from, claimed: 80, concealed: false });

  it("goes on the side of the seat it came from, for your melds", () => {
    expect(meldOrder(pong(3), 0, 0)).toEqual({ tiles: [42, 40, 41], sideways: 0 });
    expect(meldOrder(pong(2), 0, 0)).toEqual({ tiles: [40, 42, 41], sideways: 1 });
    expect(meldOrder(pong(1), 0, 0)).toEqual({ tiles: [40, 41, 42], sideways: 2 });
  });

  it("goes on the side of the giver for B's row, which runs against B's own left to right", () => {
    // B's left is C, on your right; B's right is A, on your left.
    expect(meldOrder(pong(1), 2, 0).sideways).toBe(2);
    expect(meldOrder(pong(3), 2, 0).sideways).toBe(0);
    expect(meldOrder(pong(0), 2, 0).sideways).toBe(1);
  });

  it("goes toward the giver down A's and C's columns", () => {
    // A's left is B, at the top; A's right is you, at the bottom.
    expect(meldOrder(pong(2), 3, 0).sideways).toBe(0);
    expect(meldOrder(pong(0), 3, 0).sideways).toBe(2);
    // C's left is you, at the bottom; C's right is B, at the top.
    expect(meldOrder(pong(0), 1, 0).sideways).toBe(2);
    expect(meldOrder(pong(2), 1, 0).sideways).toBe(0);
    expect(meldOrder(kong(3), 1, 0)).toEqual({ tiles: [81, 82, 80, 83], sideways: 2 });
  });

  it("is the same seen from any seat, and from a watcher's", () => {
    expect(meldOrder(pong(3), 0, 2).sideways).toBe(2);
    expect(meldOrder(pong(3), 0, 1).sideways).toBe(meldOrder(pong(2), 3, 0).sideways);
  });

  it("isn't there for a concealed kong, or a meld nobody gave", () => {
    expect(meldOrder(pong(null), 0, 0)).toEqual({ tiles: [40, 41, 42], sideways: null });
    expect(meldOrder(pong(3, true), 0, 0).sideways).toBeNull();
    expect(meldOrder({ tiles: [40, 41, 42], from: 3, claimed: 99, concealed: false }, 0, 0).sideways).toBeNull();
  });

  it("makes a seat's melds a little longer, so they fit smaller", () => {
    const layout = tableLayout(PHONE.width, PHONE.height);
    const run = meldRun([pong(3), pong(null)], 0, 0);
    expect(run).toEqual({ tiles: 6, melds: 2, sideways: 1 });
    const flat = { ...run, sideways: 0 };
    expect(meldSize({ layout, height: 150, across: run, left: run, right: run })).toBeLessThanOrEqual(meldSize({ layout, height: 150, across: flat, left: flat, right: flat }));
  });
});

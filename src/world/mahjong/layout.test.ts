import { describe, expect, it } from "vitest";
import { ACROSS_SEAT_HEIGHT, zonesFor, CENTRE, DRAWN_GAP, HAND_GAP, PAD, RIVER_GAP, riverFit, SIDE_COLUMN, TABLE_GAP, TABLE_MAX_WIDTH, tableLayout, TILE_TALL, zoneHeight } from "./layout";

const MOST_DISCARDS = 34;

describe("the table's tile sizes", () => {
  it.each([360, 375, 402, 430])("fits a two-row hand of 7 and 7 with the drawn tile apart, bigger than one row, across a %ipx phone", (width) => {
    const { handTwo, hand } = tableLayout(width);
    expect(PAD * 2 + 8 * handTwo + 7 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
    expect(handTwo).toBeGreaterThan(hand * 1.5);
  });

  it.each([360, 375, 402, 430])("fits a full hand of 14, the drawn tile apart, across a %ipx phone", (width) => {
    const { hand } = tableLayout(width);
    expect(PAD * 2 + 14 * hand + 13 * HAND_GAP + DRAWN_GAP).toBeLessThanOrEqual(width);
    expect(PAD * 2 + 14 * (hand + 1) + 13 * HAND_GAP + DRAWN_GAP).toBeGreaterThan(width);
  });

  it("makes the iPhone 17's discards bigger than the first version's 15 points, and bigger than the melds and backs", () => {
    const l = tableLayout(402);
    expect(l.hand).toBeGreaterThanOrEqual(26);
    expect(l.across.tile).toBeGreaterThanOrEqual(26);
    expect(l.side.tile).toBeGreaterThanOrEqual(22);
    expect(Math.min(l.across.tile, l.side.tile)).toBeGreaterThan(14);
    expect(l.handTwo).toBeGreaterThan(l.hand);
    expect(l.zoom).toBeGreaterThan(l.across.tile);
  });

  it("fits both sides around the middle in the width", () => {
    const l = tableLayout(402);
    expect(2 * SIDE_COLUMN + CENTRE + 4 * TABLE_GAP + 2 * l.side.width).toBeLessThanOrEqual(402 - PAD * 2);
    expect(l.side.columns * (l.side.tile * TILE_TALL + RIVER_GAP)).toBeLessThanOrEqual(l.side.width);
    expect(Math.round(l.sideStack * TILE_TALL)).toBeLessThanOrEqual(SIDE_COLUMN);
  });

  it("stops growing past a phone-sized column on a wide screen", () => {
    expect(tableLayout(1400)).toEqual(tableLayout(TABLE_MAX_WIDTH));
    expect(tableLayout(1400).width).toBe(TABLE_MAX_WIDTH);
  });
});

describe("the discard zones", () => {
  it.each(["across", "side"] as const)("keep the same height from the first discard to the last, so nothing below or beside them moves (%s)", (which) => {
    const zone = tableLayout(402)[which];
    const reserved = zoneHeight(zone);
    for (let count = 1; count <= MOST_DISCARDS; count++) {
      const { columns, tile } = riverFit(count, zone);
      const rows = Math.ceil(count / columns);
      const used = rows * ((zone.sideways ? tile : tile * TILE_TALL) + RIVER_GAP);
      expect(rows).toBeLessThanOrEqual(zone.rows);
      expect(used).toBeLessThanOrEqual(reserved);
      expect(columns * ((zone.sideways ? tile * TILE_TALL : tile) + RIVER_GAP)).toBeLessThanOrEqual(zone.width + 0.001);
    }
    expect(zoneHeight(zone)).toBe(reserved);
  });

  it("keeps full-size tiles until a zone has to fit more than it reserved for", () => {
    const { across, side } = tableLayout(402);
    expect(riverFit(26, across).tile).toBe(across.tile);
    expect(riverFit(24, side).tile).toBe(side.tile);
    expect(riverFit(MOST_DISCARDS, across).tile).toBeLessThan(across.tile);
  });
});

describe("fitting the zones to the table's height", () => {
  const { across, side } = tableLayout(402);
  const tableFor = (zones: ReturnType<typeof zonesFor>) => ACROSS_SEAT_HEIGHT + 2 * zoneHeight(zones.across) + Math.max(zoneHeight(zones.side), 150) + 4 * TABLE_GAP;

  it("keeps full-size zones when the table is tall enough", () => {
    expect(zonesFor(across, side, 2000)).toEqual({ across, side });
  });

  it.each([420, 360, 300])("shrinks every zone together to fit a %ipx table, so they never overlap", (height) => {
    const zones = zonesFor(across, side, height);
    expect(tableFor(zones)).toBeLessThanOrEqual(height);
    expect(zones.across.tile).toBeLessThan(across.tile);
  });
});

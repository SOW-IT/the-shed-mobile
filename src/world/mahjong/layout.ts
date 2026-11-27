export const TABLE_MAX_WIDTH = 560;
export const PAD = 8;
export const HAND_GAP = 1;
export const DRAWN_GAP = 6;
export const RIVER_GAP = 2;
export const SIDE_COLUMN = 58;
export const CENTRE = 44;
export const TABLE_GAP = 4;
export const TILE_TALL = 1.36;
export const ACROSS_SEAT_HEIGHT = 58;
export const ACTION_HEIGHT = 66;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export type Zone = { width: number; columns: number; rows: number; tile: number; sideways: boolean };

const rowHeight = (tile: number, sideways: boolean) => (sideways ? tile : tile * TILE_TALL) + RIVER_GAP;

export const zoneHeight = (zone: Zone) => zone.rows * rowHeight(zone.tile, zone.sideways);

export const riverFit = (count: number, zone: Zone) => {
  const columns = Math.max(zone.columns, Math.ceil(count / zone.rows));
  const fits = Math.floor((zone.width / columns - RIVER_GAP) / (zone.sideways ? TILE_TALL : 1));
  return { columns, tile: Math.min(zone.tile, fits) };
};

export const tableLayout = (screenWidth: number) => {
  const width = Math.min(screenWidth, TABLE_MAX_WIDTH);
  const inner = width - PAD * 2;
  const hand = clamp(Math.floor((inner - DRAWN_GAP - 13 * HAND_GAP) / 14), 18, 40);
  const acrossColumns = 13;
  const across = clamp(Math.floor((inner - acrossColumns * RIVER_GAP) / acrossColumns), 14, 34);
  const sideWidth = Math.floor((inner - 2 * SIDE_COLUMN - CENTRE - 4 * TABLE_GAP) / 2);
  const sideColumns = 3;
  const side = clamp(Math.floor((sideWidth / sideColumns - RIVER_GAP) / TILE_TALL), 14, 30);
  const zoom = clamp(Math.floor((Math.min(inner, 400) - 32 - 7 * RIVER_GAP) / 7), 30, 48);
  const acrossZone: Zone = { width: inner, columns: acrossColumns, rows: 2, tile: across, sideways: false };
  const sideZone: Zone = { width: sideWidth, columns: sideColumns, rows: 8, tile: side, sideways: true };
  const handTwo = clamp(Math.floor((inner - DRAWN_GAP - 7 * HAND_GAP) / 8), 18, 52);
  return { width, hand, handTwo, across: acrossZone, side: sideZone, zoom, sideStack: 30, myMeld: clamp(Math.round(hand * 0.7), 14, 26) };
};

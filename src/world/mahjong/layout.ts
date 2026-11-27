/** The table can't be narrower than this unless the screen is; on a wide screen it grows with the window's height. */
const TABLE_MIN_WIDTH = 560;
export const TABLE_MAX_WIDTH = 1000;
export const PAD = 8;
export const HAND_GAP = 1;
export const DRAWN_GAP = 6;
export const RIVER_GAP = 2;
export const SIDE_COLUMN = 58;
export const CENTRE = 44;
export const TABLE_GAP = 4;
export const TILE_TALL = 1.36;
export const ACROSS_SEAT_HEIGHT = 58;
/** The row above your hand for the claim chips and the hint (the timer lives under ✕ now). */
export const ACTION_HEIGHT = 36;
/** The strip down the right, under ✕, where the timer runs; the across seat keeps clear of it (and of the same on the left, to stay centred). */
export const TIMER_STRIP = 40;
/** A side seat's avatar, name and badges, above its melds. */
const SIDE_PLATE = 80;
/** The across seat's avatar, name and badges, before its melds. */
const ACROSS_PLATE = 120;
export const MELD_GAP = 4;
/** The compass between A's and C's discards needs this much height. */
export const MIDDLE_MIN = 84;
const PILE_MIN = 10;
const MELD_MAX = 40;
const MELD_MIN = 8;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export const tableLayout = (screenWidth: number, screenHeight: number) => {
  const width = Math.min(screenWidth, clamp(Math.round(screenHeight * 1.1), TABLE_MIN_WIDTH, TABLE_MAX_WIDTH));
  const inner = width - PAD * 2;
  const hand = clamp(Math.floor((inner - DRAWN_GAP - 13 * HAND_GAP) / 14), 18, 40);
  const handTwo = clamp(Math.floor((inner - DRAWN_GAP - 7 * HAND_GAP) / 8), 18, 52);
  const zoom = clamp(Math.floor((Math.min(inner, 400) - 32 - 7 * RIVER_GAP) / 7), 30, 48);
  // A's and C's seat columns run the table's full height; B's and your discards sit between them.
  const centre = inner - 2 * (SIDE_COLUMN + TABLE_GAP);
  const sideWidth = Math.floor((centre - CENTRE - 2 * TABLE_GAP) / 2);
  return { width, inner, hand, handTwo, zoom, centre, sideWidth, myMeld: clamp(Math.round(hand * 0.7), 14, 26) };
};

type TableLayout = ReturnType<typeof tableLayout>;

/** The biggest tile that fits `count` discards in two rows (B's and yours) in a box. */
export const acrossFit = (count: number, width: number, height: number) => {
  if (count === 0) return Infinity;
  const perRow = Math.ceil(count / 2);
  return Math.floor(Math.min((width - (perRow - 1) * RIVER_GAP) / perRow, (height - RIVER_GAP) / 2 / TILE_TALL));
};

/** How tall B's pile and yours are, two rows of `size` tiles. */
export const acrossHeightOf = (size: number) => 2 * (Math.round(size * TILE_TALL) + RIVER_GAP) - RIVER_GAP;

/** The biggest tile whose two rows fit in `height`, however few discards there are. */
const acrossFitIn = (height: number) => {
  let size = Math.floor((height - RIVER_GAP) / 2 / TILE_TALL);
  while (size > 0 && acrossHeightOf(size) > height) size--;
  return size;
};

/** A side pile's columns hold at least this many (or the whole pile), so it always reads as running down (A) or up (C). */
const SIDE_RUN = 3;

/** The biggest tile that fits `count` sideways discards in columns (A's and C's) in a box. */
export const sideFit = (count: number, width: number, height: number) => {
  if (count === 0) return Infinity;
  let best = 0;
  for (let columns = 1; columns <= count; columns++) {
    const perColumn = Math.ceil(count / columns);
    if (perColumn < Math.min(count, SIDE_RUN)) break;
    best = Math.max(best, Math.floor(Math.min((height - (perColumn - 1) * RIVER_GAP) / perColumn, (width - (columns - 1) * RIVER_GAP) / columns / TILE_TALL)));
  }
  return best;
};

/** A discard pile's rows: two of them, the first on top, each half the pile (the first gets the odd one). */
export const acrossRows = (count: number) => {
  const perRow = Math.max(1, Math.ceil(count / 2));
  return { perRow, rows: count > perRow ? 2 : 1 };
};

/** Where a side discard goes, from the top-left of its box: A fills each column down from the top, C up from the bottom; both start at their own seat's edge. */
export const sideSpot = (i: number, tile: number, box: { width: number; height: number }, side: "left" | "right") => {
  const perColumn = Math.max(1, Math.floor((box.height + RIVER_GAP) / (tile + RIVER_GAP)));
  const column = Math.floor(i / perColumn);
  const row = i % perColumn;
  const wide = Math.round(tile * TILE_TALL);
  return side === "left"
    ? { x: column * (wide + RIVER_GAP), y: row * (tile + RIVER_GAP) }
    : { x: box.width - wide - column * (wide + RIVER_GAP), y: box.height - tile - row * (tile + RIVER_GAP) };
};

export type PileCounts = { mine: number; across: number; left: number; right: number };

/**
 * How big the discards are: as big as every pile still fits, so they start
 * big and shrink as the piles grow. `height` is the table below the across
 * seat. The split between the two across piles and the middle is the one
 * that keeps the smaller of the two sizes biggest (then the closest pair);
 * the side piles then take whatever height the middle has.
 */
export const pileSizes = ({ layout, height, counts, cap }: { layout: TableLayout; height: number; counts: PileCounts; cap: number }) => {
  const avail = height - 2 * TABLE_GAP;
  let across = PILE_MIN;
  let best = -Infinity;
  for (let rows = 16; avail - 2 * rows >= MIDDLE_MIN; rows++) {
    const middle = avail - 2 * rows;
    // An empty pile still takes the rows its size needs, so it can't claim more height than this split gives it.
    const a = Math.min(cap, acrossFitIn(rows), acrossFit(counts.across, layout.centre, rows), acrossFit(counts.mine, layout.centre, rows));
    const b = Math.min(cap, sideFit(counts.left, layout.sideWidth, middle), sideFit(counts.right, layout.sideWidth, middle));
    const score = Math.min(a, b) * 1000 - Math.abs(a - b);
    if (score > best) {
      best = score;
      across = a;
    }
  }
  across = Math.max(PILE_MIN, across);
  const acrossHeight = acrossHeightOf(across);
  const middle = Math.max(MIDDLE_MIN, avail - 2 * acrossHeight);
  const side = Math.max(PILE_MIN, Math.min(cap, sideFit(counts.left, layout.sideWidth, middle), sideFit(counts.right, layout.sideWidth, middle)));
  return { across, side, acrossHeight, middle };
};

/** Discards are never bigger than your own hand's tiles. */
export const pileCap = (layout: TableLayout, handSize: number) => Math.min(handSize, clamp(Math.floor(layout.inner / 7), 40, 64));

type MeldRun = { tiles: number; melds: number };
const runFit = (run: MeldRun, length: number) => (run.tiles === 0 ? Infinity : Math.floor((length - (run.melds - 1) * MELD_GAP) / run.tiles) - 1);

/**
 * One size for A's, B's and C's melds (their concealed tiles aren't drawn,
 * just counted): as big as B's run fits beside B's plate, and A's and C's
 * fit down their seat columns.
 */
export const meldSize = ({ layout, height, across, left, right }: { layout: TableLayout; height: number; across: MeldRun; left: MeldRun; right: MeldRun }) => {
  const acrossLength = layout.inner - 2 * TIMER_STRIP - ACROSS_PLATE - 8;
  const sideLength = height - SIDE_PLATE;
  const fit = Math.min(MELD_MAX, Math.floor(SIDE_COLUMN / TILE_TALL), runFit(across, acrossLength), runFit(left, sideLength), runFit(right, sideLength));
  return Math.max(MELD_MIN, fit);
};

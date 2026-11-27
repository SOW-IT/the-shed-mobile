export const TABLE_MAX_WIDTH = 560;
export const PAD = 8;
export const HAND_GAP = 1;
export const DRAWN_GAP = 6;
export const RIVER_GAP = 2;
export const RIVER_LABEL = 34;
export const STRIP_GAP = 6;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export const tableLayout = (screenWidth: number) => {
  const width = Math.min(screenWidth, TABLE_MAX_WIDTH);
  const inner = width - PAD * 2;
  const hand = clamp(Math.floor((inner - DRAWN_GAP - 13 * HAND_GAP) / 14), 18, 40);
  const riverPerRow = 14;
  const river = clamp(Math.floor((inner - RIVER_LABEL - riverPerRow * RIVER_GAP) / riverPerRow), 14, 30);
  const card = Math.floor((inner - STRIP_GAP * 2) / 3);
  const meld = clamp(Math.floor((card - 16) / 7), 11, 18);
  const myMeld = clamp(Math.round(hand * 0.8), 16, 30);
  return { width, hand, river, riverPerRow, card, meld, myMeld };
};


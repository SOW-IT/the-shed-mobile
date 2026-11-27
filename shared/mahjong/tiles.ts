/**
 * Hong Kong mahjong tiles. A tile is an id, 0 to 143, so each of the four
 * copies can be followed on the table; its kind is what it is:
 *
 * - 0–8 Dots (筒) 1–9, 9–17 Bamboo (索) 1–9, 18–26 Characters (萬) 1–9
 * - 27–30 the winds East, South, West, North
 * - 31–33 the dragons Red (中), Green (發), White (白)
 * - 34–37 the flowers (梅蘭菊竹) and 38–41 the seasons (春夏秋冬), one of each
 */

export const KINDS = 34;
export const SUITED = 27;
export const TILE_COUNT = 136;

export const kindOf = (tile: number) => tile >> 2;

export type Suit = 0 | 1 | 2;
const SUIT_NAMES = ["Dots", "Bamboo", "Characters"] as const;
const SUIT_CHARS = ["筒", "索", "萬"] as const;

export const isSuited = (kind: number) => kind < SUITED;
export const isHonour = (kind: number) => kind >= SUITED && kind < KINDS;
export const isWind = (kind: number) => kind >= 27 && kind <= 30;
export const isDragon = (kind: number) => kind >= 31 && kind <= 33;
export const suitOf = (kind: number): Suit => Math.floor(kind / 9) as Suit;
const rankOf = (kind: number) => (kind % 9) + 1;
export const isTerminal = (kind: number) => isSuited(kind) && (kind % 9 === 0 || kind % 9 === 8);
export const isTerminalOrHonour = (kind: number) => isTerminal(kind) || isHonour(kind);

export const windKind = (wind: number) => 27 + wind;
export const WIND_NAMES = ["East", "South", "West", "North"] as const;
export const WIND_CHARS = ["東", "南", "西", "北"] as const;
const DRAGON_NAMES = ["Red Dragon", "Green Dragon", "White Dragon"] as const;
const DRAGON_CHARS = ["中", "發", "白"] as const;

export const THIRTEEN_ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33] as const;

/** What a tile is called, for VoiceOver and the faan list: "5 Dots", "Red Dragon", "Plum". */
export const tileName = (kind: number) => {
  if (isSuited(kind)) return `${rankOf(kind)} ${SUIT_NAMES[suitOf(kind)]}`;
  if (isWind(kind)) return `${WIND_NAMES[kind - 27]} Wind`;
  return DRAGON_NAMES[kind - 31];
};

/** The face's characters, for drawing it: a rank over its suit, or one character. */
export const tileFace = (kind: number): { top: string; bottom?: string } => {
  if (isSuited(kind)) return { top: String(rankOf(kind)), bottom: SUIT_CHARS[suitOf(kind)] };
  if (isWind(kind)) return { top: WIND_CHARS[kind - 27] };
  return { top: DRAGON_CHARS[kind - 31] };
};

export const allTiles = () => Array.from({ length: TILE_COUNT }, (_, i) => i);

export const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Tiles in the order a hand is kept: by kind, then by id. */
export const sortTiles = (tiles: readonly number[]) => [...tiles].sort((a, b) => kindOf(a) - kindOf(b) || a - b);

/** How many of each of the 34 kinds, from tile ids. */
export const countsOf = (tiles: readonly number[]) => {
  const counts = Array.from({ length: KINDS }, () => 0);
  for (const tile of tiles) {
    counts[kindOf(tile)]++;
  }
  return counts;
};

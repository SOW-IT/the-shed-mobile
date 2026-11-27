import { KINDS, SUITED, THIRTEEN_ORPHANS } from "./tiles";

/** A set inside a winning hand: a chow starting at `kind`, or a pong of `kind`. */
export type Group = { type: "chow" | "pong"; kind: number };
/** One way to read a winning hand's concealed tiles: four sets less the melds, and a pair. */
type Reading = { pair: number; groups: Group[] };

const canChowFrom = (kind: number) => kind < SUITED && kind % 9 <= 6;

/**
 * Every way the counts split into `sets` sets and one pair. Each reading is
 * kept, since one can score more than another (all pongs, or all chows).
 */
export const readings = (counts: readonly number[], sets: number): Reading[] => {
  const c = [...counts];
  const found: Reading[] = [];
  const total = c.reduce((sum, n) => sum + n, 0);
  if (total !== sets * 3 + 2) return found;
  const groups: Group[] = [];
  const split = (from: number, left: number, pair: number) => {
    let i = from;
    while (i < KINDS && c[i] === 0) i++;
    if (i >= KINDS) {
      if (left === 0) found.push({ pair, groups: [...groups] });
      return;
    }
    if (left === 0) return;
    if (c[i] >= 3) {
      c[i] -= 3;
      groups.push({ type: "pong", kind: i });
      split(i, left - 1, pair);
      groups.pop();
      c[i] += 3;
    }
    if (canChowFrom(i) && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      groups.push({ type: "chow", kind: i });
      split(i, left - 1, pair);
      groups.pop();
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
  };
  for (let pair = 0; pair < KINDS; pair++) {
    if (c[pair] < 2) continue;
    c[pair] -= 2;
    split(0, sets, pair);
    c[pair] += 2;
  }
  return found;
};

/** Thirteen Orphans: one of each terminal and honour, and a second of one. */
export const isThirteenOrphans = (counts: readonly number[]) => {
  let pairs = 0;
  for (let kind = 0; kind < KINDS; kind++) {
    const n = counts[kind];
    const orphan = (THIRTEEN_ORPHANS as readonly number[]).includes(kind);
    if (!orphan && n > 0) return false;
    if (orphan && n === 0) return false;
    if (n === 2) pairs++;
    if (n > 2) return false;
  }
  return pairs === 1;
};

/** Whether these concealed counts complete a hand with `melds` melds laid down. */
export const isComplete = (counts: readonly number[], melds: number) =>
  readings(counts, 4 - melds).length > 0 || (melds === 0 && isThirteenOrphans(counts));

/** Per (sets, pair) the most partial sets one suit's nine counts can make. -1 where it can't. */
type Splits = number[][];
const suitSplits = new Map<number, Splits>();

const splitSuit = (c: number[], honours: boolean): Splits => {
  const best: Splits = Array.from({ length: 5 }, () => [-1, -1]);
  const search = (from: number, sets: number, partials: number, pair: number) => {
    let i = from;
    while (i < c.length && c[i] === 0) i++;
    if (i >= c.length) {
      const m = Math.min(sets, 4);
      if (partials > best[m][pair]) best[m][pair] = partials;
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      search(i, sets + 1, partials, pair);
      c[i] += 3;
    }
    if (!honours && i <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      search(i, sets + 1, partials, pair);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!pair) search(i, sets, partials, 1);
      search(i, sets, partials + 1, pair);
      c[i] += 2;
    }
    if (!honours && i <= 7 && c[i + 1] > 0) {
      c[i]--;
      c[i + 1]--;
      search(i, sets, partials + 1, pair);
      c[i]++;
      c[i + 1]++;
    }
    if (!honours && i <= 6 && c[i + 2] > 0) {
      c[i]--;
      c[i + 2]--;
      search(i, sets, partials + 1, pair);
      c[i]++;
      c[i + 2]++;
    }
    c[i]--;
    search(i, sets, partials, pair);
    c[i]++;
  };
  search(0, 0, 0, 0);
  return best;
};

const splitsOf = (counts: readonly number[], base: number): Splits => {
  let key = 0;
  for (let i = 0; i < 9; i++) key = key * 5 + counts[base + i];
  const known = suitSplits.get(key);
  if (known) return known;
  const found = splitSuit(counts.slice(base, base + 9), false);
  suitSplits.set(key, found);
  return found;
};

/**
 * How many tiles a hand is from ready (0) or complete (-1): the usual
 * count of sets, partial sets and a pair, or Thirteen Orphans when nothing's
 * been called. Each suit is split once and remembered, so a bot can weigh
 * every discard quickly.
 */
export const shanten = (counts: readonly number[], melds: number) => {
  const need = 4 - melds;
  const groups = [splitsOf(counts, 0), splitsOf(counts, 9), splitsOf(counts, 18), splitSuit(counts.slice(SUITED, KINDS), true)];
  // Per (sets, pair), the most partial sets across the groups so far.
  let state: Splits = Array.from({ length: 5 }, () => [-1, -1]);
  state[0][0] = 0;
  for (const group of groups) {
    const next: Splits = Array.from({ length: 5 }, () => [-1, -1]);
    for (let m = 0; m <= need; m++)
      for (let p = 0; p <= 1; p++) {
        if (state[m][p] < 0) continue;
        for (let gm = 0; m + gm <= need; gm++)
          for (let gp = 0; p + gp <= 1; gp++) {
            const t = group[gm][gp];
            if (t < 0) continue;
            if (state[m][p] + t > next[m + gm][p + gp]) next[m + gm][p + gp] = state[m][p] + t;
          }
      }
    state = next;
  }
  let best = 8;
  for (let m = 0; m <= need; m++)
    for (let p = 0; p <= 1; p++) {
      if (state[m][p] < 0) continue;
      best = Math.min(best, 8 - 2 * (m + melds) - Math.min(state[m][p], need - m) - p);
    }
  if (melds === 0) {
    let kinds = 0;
    let pair = 0;
    for (const kind of THIRTEEN_ORPHANS) {
      if (counts[kind] > 0) kinds++;
      if (counts[kind] > 1) pair = 1;
    }
    best = Math.min(best, 13 - kinds - pair);
  }
  return best;
};

/** The kinds that would complete a hand of 13 (less 3 a meld). */
export const waitsOf = (counts: readonly number[], melds: number) => {
  const waits: number[] = [];
  const c = [...counts];
  for (let kind = 0; kind < KINDS; kind++) {
    if (c[kind] >= 4) continue;
    c[kind]++;
    if (isComplete(c, melds)) waits.push(kind);
    c[kind]--;
  }
  return waits;
};

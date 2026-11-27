import { KINDS } from "./tiles";

/**
 * Test helpers: a hand written the way players say it, "123m 456p 789s EE"
 * (m Characters, p Dots, s Bamboo; E S W N winds, R G Wh dragons), turned
 * into kinds, counts or tile ids.
 */

const SUIT_BASE: Record<string, number> = { p: 0, s: 9, m: 18 };
const HONOURS: Record<string, number> = { E: 27, S: 28, W: 29, N: 30, R: 31, G: 32, Wh: 33 };

export const kinds = (text: string): number[] =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((part) => {
      const suited = /^(\d+)([mps])$/.exec(part);
      if (suited) return [...suited[1]].map((d) => SUIT_BASE[suited[2]] + Number(d) - 1);
      const out: number[] = [];
      let rest = part;
      while (rest.length > 0) {
        const name = rest.startsWith("Wh") ? "Wh" : rest[0];
        if (!(name in HONOURS)) throw new Error(`Unknown tile ${part}`);
        out.push(HONOURS[name]);
        rest = rest.slice(name.length);
      }
      return out;
    });

export const counts = (text: string) => {
  const c = Array.from({ length: KINDS }, () => 0);
  for (const k of kinds(text)) c[k]++;
  return c;
};

/** Tile ids for kinds, each copy used once (starting from `copy`). */
export const tilesOf = (text: string, used = new Map<number, number>()) =>
  kinds(text).map((k) => {
    const copy = used.get(k) ?? 0;
    used.set(k, copy + 1);
    return k * 4 + copy;
  });

/** A small seeded random, so a dealt hand is the same every run. */
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

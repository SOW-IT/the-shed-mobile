import type { PatternKind } from "./runner";

type Range = readonly [number, number];
type Spread = readonly [Range, Range];

export const RUNNER_V2 = {
  speed: {
    surge: 22,
    surgeEaseSeconds: 10,
    cap: 2900,
  },
  beyondSeconds: 60,
  combo: {
    reaction: { start: 0.25, at20k: 0.15, floor: 0.1 },
    chanceAt20k: 0.9,
    chanceLimit: 0.98,
    longerEverySeconds: 12,
  },
  gap: {
    reaction: 0.3,
    reactionCut: 0.1,
    slackGoneScore: 40_000,
  },
  phraseShare: 0.35,
  phrases: [
    { name: "weave", from: 25_000, kinds: ["hang", "rock", "hang", "rock"] },
    { name: "staircase", from: 40_000, kinds: ["rock", "tall", "rock", "tall", "rock"] },
    { name: "switchback", from: 50_000, kinds: ["beam", "tall", "hang", "double"] },
    { name: "tunnel", from: 75_000, kinds: ["hang", "beam", "hang", "triple", "rock"] },
    { name: "gauntlet", from: 100_000, kinds: ["triple", "hang", "triple", "beam", "triple"] },
  ] satisfies readonly { name: string; from: number; kinds: readonly PatternKind[] }[],
  unlockScores: { bar: 5_000, twin: 10_000, stair: 15_000, triple: 30_000 } satisfies Partial<Record<PatternKind, number>>,
  lateShare: 0.1,
  spread: {
    fromScore: 5_000,
    seconds: 100,
  },
  duckLeadSeconds: 0.2,
  sizes: {
    rock: { height: [[22, 34], [16, 46]], width: [[18, 28], [14, 40]] },
    tall: { height: [[84, 104], [84, 104]], width: [[22, 30], [16, 44]] },
    wide: { height: [[26, 34], [22, 44]] },
    double: { height: [[80, 88], [80, 104]], width: [[18, 24], [16, 32]], gap: [[10, 24], [10, 60]] },
    triple: { height: [[80, 104], [80, 104]], width: [[18, 26], [16, 34]], gap: [[60, 120], [40, 140]] },
    stair: { height: [[80, 88], [80, 96]], rise: [[12, 20], [12, 28]], width: [[18, 24], [16, 30]], gap: [[10, 20], [10, 40]] },
    beam: { width: [[46, 46], [40, 80]], height: [[22, 22], [18, 28]], bottom: [[34, 34], [31, 40]] },
    bar: { width: [[70, 140], [70, 340]], height: [[20, 22], [18, 26]], bottom: [[34, 34], [32, 38]] },
    hang: { width: [[30, 48], [24, 120]], bottom: [[32, 32], [30, 38]] },
    twin: { width: [[24, 36], [20, 48]], gap: [[24, 40], [16, 70]] },
  } satisfies Record<string, Record<string, Spread>>,
} as const;

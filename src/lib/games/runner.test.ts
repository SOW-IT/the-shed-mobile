import { describe, expect, test } from "vitest";
import { SCORE_LIMITS } from "../../../shared/games";
import { GAME_VIEWS } from "./playArea";
import {
  comboChance,
  comboGap,
  duck,
  gapSlack,
  HARD_FROM_SCORE,
  HARD_FROM_SECONDS,
  HARDEST_COMBO,
  HARDEST_SCORE,
  hardness,
  HIT_WIDTH,
  hop,
  jump,
  longestCombo,
  makePattern,
  MAX_COMBO,
  minimumGap,
  newRunner,
  onGround,
  practiceStart,
  RUNNER,
  runnerAt,
  runnerSpeed,
  sliding,
  stepRunner,
  timeAtScore,
  type PatternKind,
  type RunnerState,
} from "./runner";

const FRAME = 1 / 60;
const PHONE_BOARD = GAME_VIEWS.runner.size;
const KINDS: readonly PatternKind[] = ["rock", "tall", "wide", "double", "beam", "hang"];
const DUCKS: readonly PatternKind[] = ["beam", "hang"];

const moveFor = (kind: PatternKind) => (kind === "rock" ? hop : DUCKS.includes(kind) ? duck : jump);

const ignoringHits = (state: RunnerState) => ({ ...stepRunner(state, FRAME), over: false });

const fingerprint = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16);
};

type Spawn = { kind: PatternKind; front: number; back: number; speed: number; time: number; fromChain: boolean; chained: boolean };

const spawnsFrom = (start: RunnerState, seconds: number, step: (s: RunnerState) => RunnerState = ignoringHits) => {
  let state = start;
  const spawns: Spawn[] = [];
  const end = start.time + seconds;
  while (state.time < end && !state.over) {
    const known = new Set(state.obstacles.map((o) => o.group));
    const fromChain = state.chain.length > 0;
    state = step(state);
    const fresh = state.obstacles.filter((o) => !known.has(o.group));
    if (fresh.length > 0) {
      spawns.push({
        kind: fresh[0].pattern,
        front: state.distance + Math.min(...fresh.map((o) => o.x)),
        back: state.distance + Math.max(...fresh.map((o) => o.x + o.width)),
        speed: state.speed,
        time: state.time,
        fromChain,
        chained: fromChain || state.chain.length > 0,
      });
    }
  }
  return { state, spawns };
};

const perfectPlayer = (late: number) => (s: RunnerState): RunnerState => {
  const left = RUNNER.x - HIT_WIDTH / 2;
  const right = RUNNER.x + HIT_WIDTH / 2;
  const ahead = s.obstacles.filter((o) => o.x + o.width > left).sort((a, b) => a.x - b.x);
  if (ahead.length === 0) return s;
  const group = ahead.filter((o) => o.group === ahead[0].group);
  const enter = (Math.min(...group.map((o) => o.x)) - right) / s.speed;
  const exit = (Math.max(...group.map((o) => o.x + o.width)) - left) / s.speed;
  const kind = group[0].pattern;
  if (DUCKS.includes(kind)) {
    if (!onGround(s)) return enter < 0.3 - late ? duck(s) : s;
    return enter <= 0.08 - late && (!sliding(s) || s.slideFor < exit) ? duck(s) : s;
  }
  const rise = (kind === "rock" ? RUNNER.hopSpeed : RUNNER.jumpSpeed) / RUNNER.gravity;
  if ((enter + exit) / 2 - rise > FRAME / 2 - late || !onGround(s)) return s;
  return moveFor(kind)(s);
};

const latestMove = (width: number, time: number, kind: PatternKind, seed: number) => {
  const blank: RunnerState = { ...newRunner(width, seed), time, speed: runnerSpeed(time), nextIn: Infinity };
  const obstacles = makePattern(blank, kind, width + 10);
  const shown = { ...blank, obstacles };
  let latest = -1;
  for (let wait = 0; wait < 90; wait++) {
    let state = shown;
    for (let frame = 0; frame < 240 && !state.over; frame++) {
      state = stepRunner(frame === wait ? moveFor(kind)(state) : state, FRAME);
    }
    if (!state.over) latest = wait;
  }
  return latest * FRAME;
};

const SAMPLE_SEEDS = 24;
const SAMPLE_SECONDS = 12;

const share = (runs: Spawn[][]) => runs.flat().filter((s) => s.chained).length / runs.flat().length;

const perSecond = (runs: Spawn[][]) => runs.flat().length / (SAMPLE_SEEDS * SAMPLE_SECONDS);

const gapsInSeconds = (spawns: Spawn[]) => spawns.slice(1).map((after, k) => (after.front - spawns[k].back) / spawns[k].speed);

const sample = (score: number) =>
  Array.from({ length: SAMPLE_SEEDS }, (_, i) => spawnsFrom(runnerAt(PHONE_BOARD, i + 1, score), SAMPLE_SECONDS).spawns);

const meanGapSeconds = (runs: Spawn[][]) => {
  const gaps = runs.flatMap(gapsInSeconds);
  return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
};

describe("Mystic Man past 10,000", () => {
  test("below 10,000 the speed, combos and gaps are what they were", () => {
    for (let time = 0; time < HARD_FROM_SECONDS; time += 0.25) {
      expect(runnerSpeed(time)).toBe(Math.min(1200, 300 + time * 9));
      expect(hardness(time)).toBe(0);
      expect(longestCombo(time)).toBe(time < 15 ? 0 : Math.min(MAX_COMBO, 2 + Math.floor((time - 15) / 15)));
      expect(gapSlack(time)).toBe(0.5);
    }
    expect(comboGap("rock", "tall", 1200)).toBe(comboGap("rock", "tall", 1200, HARD_FROM_SECONDS - 1));
  });

  test("below 10,000 seeded runs spawn exactly the obstacles 2.13.3 spawned", () => {
    const golden = ["143:b33879a4", "154:1a2cfc1c", "148:b3169989", "149:e9e0c79f", "150:8b4de5c8"];
    const runs = [1, 2, 3, 4, 5].map((seed) => {
      let state = newRunner(760, seed);
      const seen = new Set<number>();
      const rows: string[] = [];
      while (state.score < HARD_FROM_SCORE) {
        state = ignoringHits(state);
        for (const o of state.obstacles) {
          if (seen.has(o.id)) continue;
          seen.add(o.id);
          rows.push([o.pattern, o.kind, (state.distance + o.x).toFixed(3), o.width, o.height, o.bottom, state.speed.toFixed(3)].join(","));
        }
      }
      return `${rows.length}:${fingerprint(rows.join(";"))}`;
    });
    expect(runs).toEqual(golden);
  });

  test("the speed climbs from 1200 at 10,000 points to 1500 at 20,000, then creeps on toward 2000 without reaching it", () => {
    expect([RUNNER.cruiseSpeed, RUNNER.topSpeed, RUNNER.ceilingSpeed]).toEqual([1200, 1500, 2000]);
    let state = newRunner(760, 3);
    const marks = [HARD_FROM_SCORE, 15_000, HARDEST_SCORE, 25_000, 30_000];
    const at = new Map<number, number>();
    while (state.score < 30_000) {
      state = ignoringHits(state);
      for (const mark of marks) if (!at.has(mark) && state.score >= mark) at.set(mark, state.speed);
    }
    expect(at.get(HARD_FROM_SCORE)).toBeCloseTo(1200, 0);
    expect(at.get(15_000)).toBeGreaterThan(1300);
    expect(at.get(15_000)).toBeLessThan(1400);
    expect(at.get(HARDEST_SCORE)).toBeGreaterThan(1499);
    expect(at.get(HARDEST_SCORE)).toBeLessThan(1501);
    expect(at.get(25_000)).toBeGreaterThan(1500);
    expect(at.get(30_000)).toBeGreaterThan(at.get(25_000) ?? Infinity);
    expect(at.get(30_000)).toBeLessThan(1600);
    const later = [50_000, 100_000, 1_000_000].map((score) => runnerSpeed(timeAtScore(score)));
    expect(later[0]).toBeGreaterThan(at.get(30_000) ?? Infinity);
    expect(later[1]).toBeGreaterThan(later[0]);
    expect(later[2]).toBeGreaterThan(later[1]);
    expect(later[2]).toBeLessThan(RUNNER.ceilingSpeed);
    expect(RUNNER.ceilingSpeed / RUNNER.stride).toBeLessThan(SCORE_LIMITS.runner.perSecond);
  });

  test("a run started at a score has the time, speed and distance a run reaching it would", () => {
    let state = newRunner(760, 5);
    while (state.score < 17_500) state = ignoringHits(state);
    const jumped = runnerAt(760, 5, 17_500);
    expect(jumped.score).toBe(17_500);
    expect(jumped.time).toBeCloseTo(state.time, 1);
    expect(jumped.speed).toBeCloseTo(state.speed, 0);
    expect(hardness(timeAtScore(HARD_FROM_SCORE))).toBeCloseTo(0, 6);
    expect(["15000", undefined, "", "abc", "-5", "1.5", "0", "9999999"].map(practiceStart)).toEqual([
      15_000,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(hardness(timeAtScore(HARDEST_SCORE))).toBeCloseTo(1, 6);
  });

  test("from 10,000 chains come more often, run longer and sit closer, steeply to 20,000 and on without end", () => {
    const scores = [HARD_FROM_SCORE, 12_500, 15_000, 17_500, HARDEST_SCORE, 30_000, 50_000, 100_000, 1_000_000];
    const times = scores.map(timeAtScore);
    const rises = (values: number[]) => values.slice(1).every((v, i) => v > values[i]);
    expect(rises(times.map(comboChance))).toBe(true);
    expect(rises(times.map((t) => -gapSlack(t)))).toBe(true);
    expect(rises(times.map((t) => -comboGap("rock", "rock", 1, t)))).toBe(true);
    expect(times.map(longestCombo).slice(1).every((n, i) => n >= longestCombo(times[i]))).toBe(true);
    expect(longestCombo(times[0])).toBe(MAX_COMBO);
    expect(comboChance(times[4])).toBeCloseTo(0.9);
    expect(longestCombo(times[4])).toBe(HARDEST_COMBO);
    expect(longestCombo(times[7])).toBeGreaterThan(HARDEST_COMBO);
    expect(gapSlack(times[4])).toBeCloseTo(0.1);
    expect(comboChance(times[8])).toBeLessThan(1);
    expect(gapSlack(times[8])).toBeGreaterThan(0);
    for (const t of times) expect(comboGap("rock", "rock", 1, t)).toBeGreaterThan(comboGap("rock", "rock", 1, Infinity));

    const [easy, middle, hardest, later, much] = [HARD_FROM_SCORE, 15_000, HARDEST_SCORE, 50_000, 100_000].map(sample);
    expect(share(hardest)).toBeGreaterThan(share(easy));
    expect(perSecond(middle)).toBeGreaterThan(perSecond(easy));
    expect(perSecond(hardest)).toBeGreaterThan(perSecond(middle));
    expect(perSecond(later)).toBeGreaterThan(perSecond(hardest));
    expect(perSecond(much)).toBeGreaterThan(perSecond(later));
    expect(meanGapSeconds(middle)).toBeLessThan(meanGapSeconds(easy));
    expect(meanGapSeconds(hardest)).toBeLessThan(meanGapSeconds(middle));
    expect(meanGapSeconds(later)).toBeLessThan(meanGapSeconds(hardest));
  });

  test.each([HARD_FROM_SCORE, 15_000, HARDEST_SCORE, 25_000, 30_000, 50_000, 100_000])(
    "at %i a perfect player clears every chain, a little early or late too, and no gap is under the reaction and jump time",
    (score) => {
      let chained = 0;
      for (const late of [0, -0.05, 0.05]) {
        for (let seed = 1; seed <= 20; seed++) {
          const player = perfectPlayer(late);
          const { state, spawns } = spawnsFrom(runnerAt(PHONE_BOARD, seed, score), 30, (s) => stepRunner(player(s), FRAME));
          expect(state.over, `seed ${seed}, ${late} s late, from ${score}, died at ${state.score}`).toBe(false);
          for (let k = 1; k < spawns.length; k++) {
            const [before, after] = [spawns[k - 1], spawns[k]];
            const gap = after.front - before.back;
            const floor = after.fromChain
              ? comboGap(before.kind, after.kind, before.speed, Infinity)
              : minimumGap(before.speed);
            expect(gap).toBeGreaterThanOrEqual(floor - 1);
            if (after.fromChain) chained++;
          }
        }
      }
      expect(chained).toBeGreaterThan(100);
    }
  );

  test("at 1500, the speed at 20,000, every pattern leaves 0.3 s to react after it comes into view on every screen, and still 0.2 s at 100,000", () => {
    const top = timeAtScore(HARDEST_SCORE);
    const much = timeAtScore(100_000);
    const budgets: Record<string, number> = {};
    for (const kind of KINDS) {
      for (let seed = 1; seed <= 12; seed++) {
        expect(latestMove(PHONE_BOARD, top, kind, seed), kind).toBeGreaterThanOrEqual(0.3);
        budgets[kind] = Math.min(budgets[kind] ?? Infinity, latestMove(PHONE_BOARD, much, kind, seed));
      }
    }
    for (const kind of KINDS) expect(budgets[kind], kind).toBeGreaterThanOrEqual(0.2);
  });
});

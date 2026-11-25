import { describe, expect, test } from "vitest";
import { SCORE_LIMITS } from "../../../shared/games";
import { GAME_VIEWS } from "./playArea";
import {
  apex,
  clearableLength,
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
  PATTERN_KINDS,
  PHRASES,
  phrasesAt,
  PATTERN_FROM_SCORE,
  lateKindsAt,
  sizeSpread,
  slideReach,
  jumpReach,
  hopReach,
  type SizeChoice,
  practiceStart,
  REACH_SHARE,
  RUNNER,
  runnerAt,
  runnerSpeed,
  sliding,
  SLACK_GONE_SCORE,
  stepRunner,
  timeAtScore,
  TRIPLE_FROM_SCORE,
  VARIETY_FROM_SCORE,
  type Obstacle,
  type PatternKind,
  type RunnerState,
} from "./runner";

const FRAME = 1 / 60;
const PHONE_BOARD = GAME_VIEWS.runner.size;
const KINDS = PATTERN_KINDS;
const DUCKS: readonly PatternKind[] = ["beam", "bar", "hang", "twin"];

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

  test("below 5,000 seeded runs spawn exactly the obstacles 2.13.6 spawned", () => {
    const golden = ["85:d0f57fde", "86:6b8847f2", "89:7aff85e4", "89:d81af18e", "87:17b2b711"];
    const runs = [1, 2, 3, 4, 5].map((seed) => {
      let state = newRunner(760, seed);
      const seen = new Set<number>();
      const rows: string[] = [];
      while (state.score < VARIETY_FROM_SCORE) {
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

  test("the speed climbs from 1200 at 10,000 points to 1500 at 20,000, then keeps rising past 2000 by a little more each stretch", () => {
    expect([RUNNER.cruiseSpeed, RUNNER.topSpeed, RUNNER.ceilingSpeed]).toEqual([1200, 1500, 2900]);
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
    expect(at.get(30_000)).toBeGreaterThan((at.get(25_000) ?? Infinity) + 40);
    expect(at.get(30_000)).toBeGreaterThan(1600);
    const later = [50_000, 75_000, 100_000, 200_000, 1_000_000].map((score) => runnerSpeed(timeAtScore(score)));
    expect(later[0]).toBeGreaterThan((at.get(30_000) ?? Infinity) + 100);
    later.slice(1).forEach((speed, i) => expect(speed).toBeGreaterThan(later[i] + 50));
    expect(later[2]).toBeGreaterThan(1900);
    expect(later[2]).toBeLessThan(2100);
    expect(later[4]).toBeLessThanOrEqual(RUNNER.ceilingSpeed);
    expect(runnerSpeed(1e9)).toBe(RUNNER.ceilingSpeed);
    expect(RUNNER.ceilingSpeed / RUNNER.stride).toBeLessThan(SCORE_LIMITS[2].runner.perSecond);
  });

  test("a run started at a score has the time, speed and distance a run reaching it would", () => {
    let state = newRunner(760, 5);
    for (const mark of [17_500, 30_000, 100_000]) {
      while (state.score < mark) state = ignoringHits(state);
      const jumped = runnerAt(760, 5, mark);
      expect(jumped.score).toBe(mark);
      expect(jumped.time).toBeCloseTo(state.time, 1);
      expect(jumped.speed).toBeCloseTo(state.speed, 0);
    }
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
    expect(rises(times.slice(0, 6).map((t) => -gapSlack(t)))).toBe(true);
    expect(rises(times.map((t) => -comboGap("rock", "rock", 1, t)))).toBe(true);
    expect(times.map(longestCombo).slice(1).every((n, i) => n >= longestCombo(times[i]))).toBe(true);
    expect(longestCombo(times[0])).toBe(MAX_COMBO);
    expect(comboChance(times[4])).toBeCloseTo(0.9);
    expect(longestCombo(times[4])).toBe(HARDEST_COMBO);
    expect(longestCombo(times[7])).toBeGreaterThan(HARDEST_COMBO);
    expect(gapSlack(times[4])).toBeCloseTo(0.1);
    expect(comboChance(times[8])).toBeLessThan(1);
    expect(gapSlack(times[5])).toBeGreaterThan(0);
    expect(gapSlack(timeAtScore(SLACK_GONE_SCORE))).toBe(0);
    expect(gapSlack(times[8])).toBe(0);
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

  test.each([VARIETY_FROM_SCORE, HARD_FROM_SCORE, 15_000, HARDEST_SCORE, 25_000, 30_000, 50_000, 75_000, 100_000])(
    "at %i a perfect player clears every chain, a little early or late too, and no gap is under the reaction and jump time",
    (score) => {
      let chained = 0;
      const met = new Set<PatternKind>();
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
              : minimumGap(before.speed, Infinity);
            expect(gap).toBeGreaterThanOrEqual(floor - 1);
            if (after.fromChain) chained++;
          }
          for (const spawn of spawns) met.add(spawn.kind);
        }
      }
      expect(chained).toBeGreaterThan(100);
      for (const kind of lateKindsAt(timeAtScore(score))) expect(met.has(kind), kind).toBe(true);
    }
  );

  test("at 1500, the speed at 20,000, every pattern leaves 0.3 s to react after it comes into view on every screen, and still 0.2 s at 100,000", () => {
    const top = timeAtScore(HARDEST_SCORE);
    const budgets: Record<number, Record<string, number>> = {};
    for (const kind of KINDS) {
      for (let seed = 1; seed <= 12; seed++) {
        expect(latestMove(PHONE_BOARD, top, kind, seed), kind).toBeGreaterThanOrEqual(0.3);
        for (const score of [30_000, 50_000, 100_000]) {
          const worst = budgets[score] ?? (budgets[score] = {});
          worst[kind] = Math.min(worst[kind] ?? Infinity, latestMove(PHONE_BOARD, timeAtScore(score), kind, seed));
        }
      }
    }
    for (const kind of KINDS) {
      expect(budgets[30_000][kind], kind).toBeGreaterThanOrEqual(0.26);
      expect(budgets[50_000][kind], kind).toBeGreaterThanOrEqual(0.23);
      expect(budgets[100_000][kind], kind).toBeGreaterThanOrEqual(0.2);
    }
  });
});

describe("Mystic Man past 20,000 (v2)", () => {
  const MARKS = [HARDEST_SCORE, 30_000, 50_000, 75_000, 100_000];

  const meanCombo = (runs: Spawn[][]) => {
    let chains = 0;
    let inChains = 0;
    for (const run of runs) {
      for (const spawn of run) {
        if (!spawn.chained) continue;
        inChains++;
        if (!spawn.fromChain) chains++;
      }
    }
    return inChains / Math.max(1, chains);
  };

  const spareSeconds = (runs: Spawn[][]) => {
    const spare = runs.flatMap((spawns) =>
      spawns.slice(1).map((after, k) => {
        const before = spawns[k];
        const floor = after.fromChain ? comboGap(before.kind, after.kind, before.speed, Infinity) : minimumGap(before.speed, Infinity);
        return (after.front - before.back - floor) / before.speed;
      })
    );
    return spare.reduce((sum, value) => sum + value, 0) / spare.length;
  };

  test("every stretch from 20,000 to 100,000 is faster, leaves less room for a mistake, and chains longer and tighter than the one before", () => {
    const runs = MARKS.map(sample);
    const speeds = MARKS.map((score) => runnerSpeed(timeAtScore(score)));
    const rate = runs.map(perSecond);
    const gaps = runs.map(meanGapSeconds);
    const spare = runs.map(spareSeconds);
    const shares = runs.map(share);
    const times = MARKS.map(timeAtScore);
    const reactions = times.map((t) => comboGap("rock", "rock", 1, t));
    const floors = times.map((t) => minimumGap(1, t) + gapSlack(t));
    const chains = times.map(longestCombo);
    for (let i = 1; i < MARKS.length; i++) {
      const at = `${MARKS[i - 1]} to ${MARKS[i]}`;
      expect(speeds[i], at).toBeGreaterThan(speeds[i - 1]);
      expect(spare[i], at).toBeLessThan(spare[i - 1]);
      expect(rate[i], at).toBeGreaterThan(rate[0]);
      expect(gaps[i], at).toBeLessThan(gaps[0]);
      expect(shares[i], at).toBeGreaterThanOrEqual(shares[i - 1]);
      expect(reactions[i], at).toBeLessThan(reactions[i - 1]);
      expect(floors[i], at).toBeLessThan(floors[i - 1]);
      expect(chains[i], at).toBeGreaterThan(chains[i - 1] + 4);
      expect(comboChance(times[i]), at).toBeGreaterThan(comboChance(times[i - 1]));
    }
    expect(spare[1]).toBeLessThan(spare[0] * 0.7);
    expect(spare[2]).toBeLessThan(spare[1] * 0.7);
    expect(meanCombo(runs[2])).toBeGreaterThan(meanCombo(runs[0]));
  }, 60_000);

  test("past 40,000 the break between chains has no slack left, and the time to react after a landing keeps shrinking toward 0.2 s", () => {
    const at = [SLACK_GONE_SCORE, 50_000, 75_000, 100_000, 1_000_000].map(timeAtScore);
    const reaction = (t: number) => minimumGap(1, t) - 40 - (2 * RUNNER.jumpSpeed) / RUNNER.gravity;
    expect(reaction(at[0])).toBeCloseTo(0.3, 6);
    at.slice(1).forEach((t, i) => expect(reaction(t)).toBeLessThan(reaction(at[i])));
    for (const t of at) expect(gapSlack(t)).toBe(0);
    expect(reaction(Infinity)).toBeCloseTo(0.2, 6);
    expect(reaction(at[4])).toBeGreaterThan(0.2);
  });

  test("new combinations join at 25,000, 30,000, 40,000, 50,000, 75,000 and 100,000, and turn up in play", () => {
    expect(phrasesAt(timeAtScore(HARDEST_SCORE))).toEqual([]);
    expect(PHRASES.map((phrase) => phrase.from)).toEqual([25_000, 40_000, 50_000, 75_000, 100_000]);
    PHRASES.forEach((phrase, i) => {
      expect(phrasesAt(timeAtScore(phrase.from - 100))).toHaveLength(i);
      expect(phrasesAt(timeAtScore(phrase.from))).toHaveLength(i + 1);
    });
    const counts = (score: number) => {
      const seen: Partial<Record<PatternKind, number>> = {};
      for (const run of sample(score)) for (const spawn of run) seen[spawn.kind] = (seen[spawn.kind] ?? 0) + 1;
      return seen;
    };
    expect(counts(HARDEST_SCORE).triple).toBeUndefined();
    expect(counts(TRIPLE_FROM_SCORE - 2_000).triple).toBeUndefined();
    expect(counts(TRIPLE_FROM_SCORE).triple).toBeGreaterThan(5);
    const runOf = (kinds: readonly PatternKind[], spawns: Spawn[]) =>
      spawns.some((_, i) => kinds.every((kind, k) => spawns[i + k]?.kind === kind && (k === 0 || spawns[i + k].fromChain)));
    for (const phrase of PHRASES) {
      const runs = sample(phrase.from + 1_000);
      expect(runs.some((spawns) => runOf(phrase.kinds, spawns)), phrase.name).toBe(true);
    }
  }, 60_000);

  test("a triple is three rocks a hop can't clear, spread as far as the big jump allows", () => {
    for (const score of [TRIPLE_FROM_SCORE, 50_000, 100_000]) {
      const time = timeAtScore(score);
      for (let seed = 1; seed <= 30; seed++) {
        const state: RunnerState = { ...newRunner(PHONE_BOARD, seed), time, speed: runnerSpeed(time), nextIn: Infinity };
        const group = makePattern(state, "triple", 300);
        expect(group).toHaveLength(3);
        expect(new Set(group.map((o) => o.group)).size).toBe(1);
        const height = group[0].height;
        expect(height - RUNNER.forgive).toBeGreaterThan(apex(RUNNER.hopSpeed));
        const span = Math.max(...group.map((o) => o.x + o.width)) - group[0].x;
        expect(span).toBeLessThanOrEqual(REACH_SHARE * clearableLength(RUNNER.jumpSpeed, height, state.speed) + 1);
        expect(group[1].x - (group[0].x + group[0].width)).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe("Mystic Man's obstacles in v2", () => {
  const MARKS = [VARIETY_FROM_SCORE, HARD_FROM_SCORE, HARDEST_SCORE, 30_000, 50_000, 100_000];
  const JUMPED: readonly PatternKind[] = ["tall", "wide", "double", "triple", "stair"];
  const at = (score: number, seed = 1): RunnerState => {
    const time = timeAtScore(score);
    return { ...newRunner(PHONE_BOARD, seed), time, speed: runnerSpeed(time), nextIn: Infinity };
  };
  const extent = (group: readonly Obstacle[]) => ({
    span: Math.max(...group.map((o) => o.x + o.width)) - Math.min(...group.map((o) => o.x)),
    top: Math.max(...group.map((o) => o.bottom + o.height)),
    bottom: Math.min(...group.map((o) => o.bottom)),
  });
  const wideLimit = (speed: number) => jumpReach(speed, 22);

  const clears = (state: RunnerState, kind: PatternKind, choice: SizeChoice, move = moveFor(kind)) => {
    const shown = { ...state, obstacles: makePattern({ ...state }, kind, PHONE_BOARD + 10, choice) };
    let good = 0;
    let latest = -1;
    for (let wait = 0; wait < 120; wait++) {
      let run = shown;
      for (let frame = 0; frame < 300 && !run.over; frame++) run = stepRunner(frame === wait ? move(run) : run, FRAME);
      if (!run.over) {
        good++;
        latest = wait;
      }
    }
    return { good, latest: latest * FRAME };
  };

  test("sizes stay as they were below 5,000, then spread wider the higher the score", () => {
    expect(sizeSpread(timeAtScore(VARIETY_FROM_SCORE - 100))).toBe(0);
    const spreads = MARKS.map((score) => sizeSpread(timeAtScore(score)));
    spreads.slice(1).forEach((value, i) => expect(value).toBeGreaterThan(spreads[i]));
    expect(spreads[0]).toBeCloseTo(0, 6);
    expect(spreads[3]).toBeGreaterThan(0.85);
    const range = (score: number, kind: PatternKind) => {
      const least = extent(makePattern(at(score), kind, 0, "least"));
      const most = extent(makePattern(at(score), kind, 0, "most"));
      return { span: most.span - least.span, top: most.top - least.top };
    };
    for (const kind of KINDS) {
      if (kind === "wide") continue;
      const early = range(VARIETY_FROM_SCORE, kind);
      const late = range(30_000, kind);
      expect(late.span + late.top, kind).toBeGreaterThan(early.span + early.top);
    }
  });

  test.each(MARKS)("at %i every size of every obstacle keeps to what its move can clear", (score) => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const choice of ["random", "least", "most"] as const) {
        for (const kind of lateKindsAt(timeAtScore(score)).concat(["rock", "tall", "wide", "double", "beam", "hang"])) {
          const state = at(score, seed);
          const s = state.speed;
          const group = makePattern(state, kind, 0, choice);
          const { span, top, bottom } = extent(group);
          const where = `${kind} ${choice} seed ${seed}`;
          if (kind === "rock") {
            expect(top - RUNNER.forgive, where).toBeLessThan(apex(RUNNER.hopSpeed));
            expect(span, where).toBeLessThanOrEqual(hopReach(s, top) + 1);
          } else if (DUCKS.includes(kind)) {
            expect(bottom, where).toBeGreaterThan(RUNNER.slideHeight - RUNNER.forgive);
            expect(bottom, where).toBeLessThan(RUNNER.standHeight - RUNNER.forgive);
            expect(span, where).toBeLessThanOrEqual(slideReach(s) + 1);
            if (kind === "beam" || kind === "bar") {
              expect(span, where).toBeLessThanOrEqual(jumpReach(s, top) + 1);
              expect(span, where).toBeLessThanOrEqual(wideLimit(s) + 1);
            }
          } else {
            expect(JUMPED.includes(kind), where).toBe(true);
            if (kind !== "wide") expect(Math.min(...group.map((o) => o.height)) - RUNNER.forgive, where).toBeGreaterThan(apex(RUNNER.hopSpeed));
            expect(span, where).toBeLessThanOrEqual(jumpReach(s, top) + 1);
            expect(span, where).toBeLessThanOrEqual(wideLimit(s) + 1);
          }
        }
      }
    }
  });

  test.each(MARKS)("at %i the smallest and largest of every obstacle are cleared by its move with time to spare", (score) => {
    const state = at(score);
    for (const kind of lateKindsAt(state.time).concat(["rock", "tall", "wide", "double", "beam", "hang"])) {
      for (const choice of ["least", "most"] as const) {
        const { good, latest } = clears(state, kind, choice);
        expect(good, `${kind} ${choice}`).toBeGreaterThanOrEqual(3);
        expect(latest, `${kind} ${choice}`).toBeGreaterThanOrEqual(0.2);
      }
    }
    if (state.time >= timeAtScore(PATTERN_FROM_SCORE.bar ?? 0)) {
      for (const choice of ["least", "most"] as const) {
        expect(clears(state, "bar", choice, jump).good, `bar ${choice} jumped`).toBeGreaterThanOrEqual(2);
        expect(clears(state, "beam", choice, jump).good, `beam ${choice} jumped`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("the orange bar comes in at 5,000, longer than the yellow beam and the vines usually are, and it floats where a slide passes under it", () => {
    expect(PATTERN_FROM_SCORE.bar).toBe(VARIETY_FROM_SCORE);
    expect(lateKindsAt(timeAtScore(VARIETY_FROM_SCORE - 50))).toEqual([]);
    expect(lateKindsAt(timeAtScore(VARIETY_FROM_SCORE))).toEqual(["bar"]);
    for (const score of MARKS) {
      for (let seed = 1; seed <= 30; seed++) {
        const [bar] = makePattern(at(score, seed), "bar", 0);
        expect(bar.kind).toBe("bar");
        expect(bar.width).toBeGreaterThan(48);
        expect(bar.width).toBeGreaterThan(makePattern(at(score, seed), "beam", 0, "least")[0].width);
      }
    }
    const runs = sample(VARIETY_FROM_SCORE + 500);
    expect(runs.flat().filter((spawn) => spawn.kind === "bar").length).toBeGreaterThan(5);
    expect(sample(VARIETY_FROM_SCORE - 1_500).flat().some((spawn) => spawn.kind === "bar")).toBe(false);
  });

  test("the vine pair comes in at 10,000 and the rock steps at 15,000", () => {
    expect(PATTERN_FROM_SCORE).toMatchObject({ twin: 10_000, stair: 15_000 });
    const twin = makePattern(at(20_000), "twin", 0, "most");
    expect(twin.map((o) => o.kind)).toEqual(["hang", "hang"]);
    const stair = makePattern(at(20_000), "stair", 0, "most");
    expect(stair.map((o) => o.kind)).toEqual(["rock", "tall"]);
    expect(stair[1].height).toBeGreaterThan(stair[0].height);
    expect(sample(15_500).flat().some((spawn) => spawn.kind === "stair")).toBe(true);
    expect(sample(10_500).flat().some((spawn) => spawn.kind === "twin")).toBe(true);
  });
});


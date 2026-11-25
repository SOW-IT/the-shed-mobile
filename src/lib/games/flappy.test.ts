import { describe, expect, test } from "vitest";
import { SCORE_LIMITS } from "../../../shared/games";
import {
  FLAPPY,
  flap,
  flapLevel,
  flappyAt,
  gapHeight,
  gapReach,
  leastJump,
  MAX_GAP_DROP,
  MAX_GAP_RISE,
  newFlappy,
  pipeSpeed,
  reachShare,
  spacingAt,
  spacingRange,
  stepFlappy,
  tightening,
  variety,
  type FlappyState,
  type Pipe,
} from "./flappy";

const FRAME = 1 / 60;
const TAP_FRAMES = 9;

type Spawned = { gapTop: number; gapHeight: number; space: number };

const pipesAt = (width: number, height: number, seed: number, gaps: number, count = 60) => {
  let state: FlappyState = { ...newFlappy(width, height, seed), gaps };
  const spawned: Spawned[] = [];
  let distance = 0;
  let lastAt = 0;
  for (let i = 0; i < 60_000 && spawned.length < count; i++) {
    const known = new Set(state.pipes.map((p) => p.id));
    state = stepFlappy({ ...state, y: height * 0.4, vy: 0, over: false, gaps, time: 0 }, FRAME);
    distance += pipeSpeed(state.score) * FRAME;
    for (const pipe of state.pipes) {
      if (known.has(pipe.id)) continue;
      const at = distance + pipe.x;
      spawned.push({ gapTop: pipe.gapTop, gapHeight: pipe.gapHeight, space: spawned.length === 0 ? 0 : at - lastAt });
      lastAt = at;
    }
  }
  return spawned;
};

const beat = (state: FlappyState) => {
  let next = state;
  for (let i = 0; i < TAP_FRAMES && !next.over; i++) next = stepFlappy(next, FRAME);
  return next;
};

const through = (start: FlappyState, goal: number): boolean => {
  const seen = new Set<string>();
  const go = (state: FlappyState, frame: number): boolean => {
    if (state.over) return false;
    if (state.gaps >= goal) return true;
    const key = `${frame}|${state.y.toFixed(1)}|${state.vy.toFixed(0)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return go(beat(flap(state)), frame + TAP_FRAMES) || go(stepFlappy(state, FRAME), frame + 1);
  };
  return go(start, 0);
};

const flyable = (width: number, height: number, gaps: number, first: Spawned, second: Spawned) => {
  const x = 300;
  const pipes: Pipe[] = [
    { id: 1, x, gapTop: first.gapTop, gapHeight: first.gapHeight, passed: false },
    { id: 2, x: x + second.space, gapTop: second.gapTop, gapHeight: second.gapHeight, passed: false },
  ];
  const state: FlappyState = {
    ...newFlappy(width, height, 1),
    gaps,
    y: first.gapTop + first.gapHeight / 2,
    nextIn: Infinity,
    pipes,
  };
  return through(state, gaps + 2);
};

const spread = (values: number[]) => {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
};

const meanJump = (pipes: Spawned[]) =>
  pipes.slice(1).reduce((sum, pipe, i) => sum + Math.abs(pipe.gapTop - pipes[i].gapTop), 0) / (pipes.length - 1);

describe("Flap gets less predictable as the score rises", () => {
  test("the variety starts at nothing, grows with the score and levels off", () => {
    expect(variety(0)).toBe(0);
    expect(variety(200)).toBeGreaterThan(variety(100));
    expect(variety(2000)).toBeGreaterThan(variety(400));
    expect(variety(1_000_000)).toBeLessThanOrEqual(1);
    expect(reachShare(FLAPPY.spacing)).toBe(1);
    expect(reachShare(FLAPPY.farthestSpacing)).toBe(1);
    expect(reachShare(FLAPPY.closestSpacing)).toBeLessThan(1);
  });

  test("pipes come at the same spacing at first, then closer and farther apart", () => {
    const spaces = (gaps: number) =>
      [1, 2, 3, 4, 5].flatMap((seed) => pipesAt(360, 640, seed, gaps).slice(2).map((p) => p.space));
    expect(spread(spaces(0))).toBeLessThan(5);
    expect(spread(spaces(30))).toBeGreaterThan(spread(spaces(10)));
    expect(spread(spaces(90))).toBeGreaterThan(spread(spaces(30)));
    for (const gaps of [90, 300, 10_000]) {
      const { low, high } = spacingRange(gaps * FLAPPY.pointsPerGap);
      for (const space of spaces(gaps)) {
        expect(space).toBeGreaterThanOrEqual(low - 4);
        expect(space).toBeLessThanOrEqual(high + 4);
      }
    }
    expect(spacingRange(900)).toEqual({
      low: FLAPPY.spacing - (FLAPPY.spacing - FLAPPY.closestSpacing) * variety(900),
      high: FLAPPY.spacing + (FLAPPY.farthestSpacing - FLAPPY.spacing) * variety(900),
      lean: 1,
    });
  });

  test("the jump from one gap to the next gets bigger as the score rises", () => {
    const jumps = (gaps: number) => {
      const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => meanJump(pipesAt(360, 640, seed, gaps)));
      return runs.reduce((sum, jump) => sum + jump, 0) / runs.length;
    };
    expect(jumps(30)).toBeGreaterThan(jumps(0));
    expect(jumps(200)).toBeGreaterThan(jumps(30));
  });

  test("a gap never rises or drops more than the bird can manage in the time before it", () => {
    for (const [width, height] of [[360, 640], [480, 820]]) {
      for (const gaps of [0, 20, 60, 200, 1000, 3000]) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const pipes = pipesAt(width, height, seed, gaps);
          for (let i = 1; i < pipes.length; i++) {
            const most = gapReach(pipes[i].space + 0.01, gaps * FLAPPY.pointsPerGap);
            expect(pipes[i - 1].gapTop - pipes[i].gapTop).toBeLessThanOrEqual(most.rise + 1);
            expect(pipes[i].gapTop - pipes[i - 1].gapTop).toBeLessThanOrEqual(most.drop + 1);
            const share = reachShare(pipes[i].space + 0.01, pipeSpeed(gaps * FLAPPY.pointsPerGap), FLAPPY.hardReachShare);
            expect(most.rise).toBeLessThanOrEqual(MAX_GAP_RISE * share + 1e-9);
            expect(most.drop).toBeLessThanOrEqual(MAX_GAP_DROP * share + 1e-9);
          }
        }
      }
    }
  });

  test.each([0, 20, 60, 100, 200, 300, 1000, 3000, 100_000])(
    "with %i gaps passed, every seeded pair of pipes can be flown by a player tapping at most every 0.15 s",
    (gaps) => {
      let pairs = 0;
      for (const [width, height] of [[360, 640], [480, 820]]) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const pipes = pipesAt(width, height, seed, gaps, 30);
          for (let i = 1; i < pipes.length; i++) {
            expect(flyable(width, height, gaps, pipes[i - 1], pipes[i]), `seed ${seed}, pipe ${i} on ${width}x${height}`).toBe(true);
            pairs++;
          }
        }
      }
      expect(pairs).toBeGreaterThan(300);
    },
    120_000
  );
});

const v1Speed = (score: number) => FLAPPY.startSpeed + (FLAPPY.topSpeed - FLAPPY.startSpeed) * (1 - Math.exp(-score / FLAPPY.rampScore));
const v1Gap = (score: number) => FLAPPY.widestGap - (FLAPPY.widestGap - FLAPPY.narrowestGap) * (1 - Math.exp(-score / FLAPPY.rampScore));

const fingerprint = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16);
};

describe("Flap v2: past 1,000 it keeps getting harder, a level every 1,000 points", () => {
  const LEVEL_SCORES = [1000, 2000, 3000, 5000, 10_000, 20_000, 30_000, 100_000, 300_000, 1_000_000];

  test("below 1,000 the speed, gaps and jumps are what they were", () => {
    for (let score = 0; score < 1000; score += 7) {
      expect(flapLevel(score)).toBe(0);
      expect(pipeSpeed(score)).toBe(v1Speed(score));
      expect(gapHeight(score)).toBe(v1Gap(score));
      expect(leastJump(score)).toBe(FLAPPY.leastJumpShare * variety(score));
    }
  });

  test("below 950 seeded runs spawn exactly the pipes 2.13.6 spawned", () => {
    const runs = [1, 2, 3, 4, 5].map((seed) => {
      let state = newFlappy(360, 640, seed);
      const seen = new Set<number>();
      const rows: string[] = [];
      while (state.score < 950) {
        state = stepFlappy({ ...state, y: 300, vy: 0, over: false, gaps: Math.floor(state.time / 1.1) }, FRAME);
        for (const p of state.pipes) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          rows.push([p.x.toFixed(3), p.gapTop.toFixed(3), p.gapHeight.toFixed(3)].join(","));
        }
      }
      return `${rows.length}:${fingerprint(rows.join(";"))}`;
    });
    expect(runs).toEqual(["75:98f446f8", "75:d869bffe", "74:62ae71bd", "73:f7a31144", "74:fab3655a"]);
  });

  test("every level is a little faster, with narrower gaps, pipes further apart and bigger jumps, and it never stops", () => {
    expect(LEVEL_SCORES.map(flapLevel)).toEqual([1, 2, 3, 5, 10, 20, 30, 100, 300, 1000]);
    expect(flapLevel(1999)).toBe(1);
    const rising = (values: number[]) => values.slice(1).every((value, i) => value > values[i]);
    const scores = [999, ...LEVEL_SCORES];
    expect(rising(scores.map(pipeSpeed))).toBe(true);
    expect(rising(scores.map((score) => -gapHeight(score)))).toBe(true);
    expect(rising(scores.map((score) => spacingRange(score).low))).toBe(true);
    expect(rising(scores.map((score) => spacingRange(score).high))).toBe(true);
    expect(rising(scores.map((score) => spacingRange(score).lean))).toBe(true);
    expect(rising(scores.map((score) => spacingAt(score, 0.5)))).toBe(true);
    expect(rising(scores.map(leastJump))).toBe(true);
    expect(rising(scores.map(tightening))).toBe(true);
    expect(pipeSpeed(1_000_000)).toBeGreaterThan(pipeSpeed(999_000));
    expect(pipeSpeed(1_000_000)).toBeLessThan(FLAPPY.hardTopSpeed);
    expect(FLAPPY.hardTopSpeed / FLAPPY.topSpeed).toBeGreaterThanOrEqual(1.1);
    expect(FLAPPY.hardTopSpeed / FLAPPY.topSpeed).toBeLessThanOrEqual(1.15);
    expect(pipeSpeed(10_000) - FLAPPY.topSpeed).toBeGreaterThan((FLAPPY.hardTopSpeed - FLAPPY.topSpeed) / 2);
    expect(gapHeight(10_000)).toBeLessThan(135);
    expect(gapHeight(1_000_000)).toBeGreaterThan(FLAPPY.floorGap);
    expect(spacingRange(1_000_000).high).toBeLessThan(FLAPPY.widestSpacing);
    for (const score of [0, 999, 1000, 30_000, 1_000_000]) {
      expect(spacingAt(score, 0)).toBe(spacingRange(score).low);
      expect(spacingAt(score, 1)).toBe(spacingRange(score).high);
    }
    expect(spacingAt(999, 0.5)).toBe((spacingRange(999).low + spacingRange(999).high) / 2);
  });

  test("the narrowest gap there can be still fits a flap with room to spare", () => {
    const hitRadius = FLAPPY.radius - 2;
    const flapRise = FLAPPY.flapSpeed ** 2 / (2 * FLAPPY.gravity);
    expect(flapRise + 2 * hitRadius).toBeLessThan(FLAPPY.floorGap - 20);
    expect(spacingRange(1000).low).toBeGreaterThan(FLAPPY.pipeWidth + 2 * FLAPPY.radius + 60);
  });

  test("measured at 1,000, 3,000, 10,000 and 30,000: pipes further apart, wide ones more often, bigger climbs and drops, narrower gaps", () => {
    const measure = (score: number) => {
      const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => pipesAt(480, 820, seed, score / FLAPPY.pointsPerGap, 60).slice(2));
      const all = runs.flat();
      return {
        space: all.reduce((sum, pipe) => sum + pipe.space, 0) / all.length,
        wide: all.filter((pipe) => pipe.space >= 280).length / all.length,
        gap: all.reduce((sum, pipe) => sum + pipe.gapHeight, 0) / all.length,
        jump: runs.reduce((sum, run) => sum + meanJump(run), 0) / runs.length,
        speed: pipeSpeed(score),
      };
    };
    const [easy, middle, hard, harder] = [1000, 3000, 10_000, 30_000].map(measure);
    for (const [before, after] of [[easy, middle], [middle, hard], [hard, harder]]) {
      expect(after.space).toBeGreaterThan(before.space);
      expect(after.wide).toBeGreaterThan(before.wide);
      expect(after.gap).toBeLessThan(before.gap);
      expect(after.jump).toBeGreaterThan(before.jump);
      expect(after.speed).toBeGreaterThan(before.speed);
    }
  });

  test("however high the score, the points a second stay under the server's limit for v2", () => {
    const fastest = pipeSpeed(SCORE_LIMITS[2].flappy.max);
    const perSecond = (FLAPPY.pointsPerGap * fastest) / FLAPPY.closestSpacing + 1;
    expect(perSecond).toBeLessThan(SCORE_LIMITS[2].flappy.perSecond);
  });

  test("a run started at a score has that score, its gaps and time, and plays on at that level", () => {
    for (const score of [1, 999, 1000, 15_000, 1_000_000]) {
      const state = flappyAt(360, 640, 4, score);
      expect(state.score).toBe(score);
      expect(state.gaps * FLAPPY.pointsPerGap + Math.floor(state.time)).toBe(score);
      expect(state.time).toBeGreaterThanOrEqual(0);
      expect(state.time).toBeLessThanOrEqual(score / (FLAPPY.pointsPerGap + 1) + FLAPPY.pointsPerGap + 1);
    }
    let state = flap(flappyAt(360, 640, 4, 20_000));
    for (let i = 0; i < 120; i++) state = stepFlappy({ ...state, y: 300, vy: 0 }, FRAME);
    expect(state.score).toBeGreaterThanOrEqual(20_000);
    expect(state.pipes[0].gapHeight).toBeCloseTo(gapHeight(20_000), 6);
  });
});

import { describe, expect, test } from "vitest";
import { SCORE_LIMITS } from "../../../shared/games";
import {
  birdX,
  FLAPPY,
  flap,
  flappyAt,
  flappyScore,
  gapHeight,
  gapReach,
  leastJump,
  MAX_GAP_DROP,
  MAX_GAP_RISE,
  newFlappy,
  pipeShadeStep,
  pipeSpeed,
  shades,
  skyStep,
  stepFlappy,
  type FlappyState,
  type Pipe,
} from "./flappy";
import { FLAPPY_V2 } from "./flappyTuning";

const FRAME = 1 / 60;
const TAP_FRAMES = 9;
const BOARDS = [
  [390, 500],
  [390, 700],
  [390, 900],
];
const LAST_SHRINK = Math.ceil((FLAPPY_V2.startGap - FLAPPY_V2.minGap) / FLAPPY_V2.gapShrinkPerPipe);
const LAST_SPEED_UP = Math.ceil((FLAPPY_V2.topSpeed - FLAPPY_V2.startSpeed) / FLAPPY_V2.speedPerPipe);

type Spawned = { gapTop: number; gapHeight: number; space: number };

const pipesAt = (width: number, height: number, seed: number, gaps: number, count = 40) => {
  let state: FlappyState = { ...newFlappy(width, height, seed), gaps };
  const spawned: Spawned[] = [];
  let distance = 0;
  let lastAt = 0;
  for (let i = 0; i < 60_000 && spawned.length < count; i++) {
    const known = new Set(state.pipes.map((p) => p.id));
    state = stepFlappy({ ...state, y: height * 0.4, vy: 0, over: false, gaps }, FRAME);
    distance += pipeSpeed(gaps) * FRAME;
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

describe("Flap v2 scoring", () => {
  test("a pipe cleared is a point, and nothing else scores", () => {
    expect(FLAPPY_V2.pointsPerPipe).toBe(1);
    expect([0, 1, 7, 500].map(flappyScore)).toEqual([0, 1, 7, 500]);
    const autopilot = (s: FlappyState) => {
      const next = s.pipes.find((p) => p.x + FLAPPY.pipeWidth > birdX(s) - FLAPPY.radius);
      const target = next ? next.gapTop + next.gapHeight * 0.62 : s.height * 0.45;
      return s.y > target && s.vy > 0 ? flap(s) : s;
    };
    let state = newFlappy(390, 700, 5);
    for (let t = 0; t < 30 && !state.over; t += FRAME) state = stepFlappy(autopilot(state), FRAME);
    expect(state.over).toBe(false);
    expect(state.gaps).toBeGreaterThan(10);
    expect(state.score).toBe(state.gaps);
    let idle = { ...newFlappy(390, 700, 5), nextIn: Infinity };
    for (let t = 0; t < 2; t += FRAME) idle = stepFlappy({ ...idle, y: 300, vy: 0 }, FRAME);
    expect(idle.score).toBe(0);
  });

  test("the most points a second, at the top speed, stay well under the server's limit for v2", () => {
    const pipesPerSecond = FLAPPY_V2.topSpeed / FLAPPY_V2.spacing;
    expect(pipesPerSecond * FLAPPY_V2.pointsPerPipe * 2).toBeLessThan(SCORE_LIMITS[2].flappy.perSecond);
  });
});

describe("Flap v2 pipes", () => {
  test("the gap starts comfortable, shrinks a little every pipe, then holds at its minimum for good", () => {
    expect(gapHeight(0)).toBe(FLAPPY_V2.startGap);
    for (let pipes = 1; pipes <= LAST_SHRINK; pipes++) expect(gapHeight(pipes)).toBeLessThan(gapHeight(pipes - 1));
    expect(gapHeight(LAST_SHRINK)).toBe(FLAPPY_V2.minGap);
    for (const pipes of [LAST_SHRINK + 1, 500, 5000, 1_000_000]) expect(gapHeight(pipes)).toBe(FLAPPY_V2.minGap);
    const hitbox = 2 * (FLAPPY.radius - 2);
    const flapRise = FLAPPY.flapSpeed ** 2 / (2 * FLAPPY.gravity);
    expect(FLAPPY_V2.minGap).toBeGreaterThan(hitbox + flapRise + 20);
  });

  test("the speed rises with every pipe up to its cap, and stays there", () => {
    expect(pipeSpeed(0)).toBe(FLAPPY_V2.startSpeed);
    for (let pipes = 1; pipes <= LAST_SPEED_UP; pipes++) expect(pipeSpeed(pipes)).toBeGreaterThan(pipeSpeed(pipes - 1));
    expect(pipeSpeed(LAST_SPEED_UP)).toBe(FLAPPY_V2.topSpeed);
    for (const pipes of [LAST_SPEED_UP + 1, 1000, 1_000_000]) expect(pipeSpeed(pipes)).toBe(FLAPPY_V2.topSpeed);
  });

  test("pipes come the same distance apart, every time", () => {
    for (const gaps of [0, 100, 1000]) {
      for (const pipe of pipesAt(390, 700, 3, gaps).slice(1)) {
        expect(Math.abs(pipe.space - FLAPPY_V2.spacing)).toBeLessThan(pipeSpeed(gaps) * FRAME + 1e-6);
      }
    }
  });

  test("each opening sits at a random height, never further from the last than the bird can manage", () => {
    for (const [width, height] of BOARDS) {
      for (const gaps of [0, 20, 100, LAST_SHRINK, 1000]) {
        const tops = new Set<number>();
        for (const seed of [1, 2, 3, 4]) {
          const pipes = pipesAt(width, height, seed, gaps);
          const most = gapReach(gaps);
          for (let i = 1; i < pipes.length; i++) {
            tops.add(Math.round(pipes[i].gapTop));
            expect(pipes[i - 1].gapTop - pipes[i].gapTop).toBeLessThanOrEqual(most.rise + 1e-6);
            expect(pipes[i].gapTop - pipes[i - 1].gapTop).toBeLessThanOrEqual(most.drop + 1e-6);
          }
        }
        expect(tops.size).toBeGreaterThan(60);
      }
    }
    expect(gapReach(1000).rise).toBeLessThanOrEqual(MAX_GAP_RISE);
    expect(gapReach(1000).drop).toBeLessThanOrEqual(MAX_GAP_DROP);
    expect(leastJump(0)).toBe(0);
    expect(leastJump(1000)).toBeGreaterThan(leastJump(20));
    expect(leastJump(1_000_000)).toBeLessThanOrEqual(FLAPPY_V2.mostJumpShare);
  });

  test.each([0, 20, 60, 100, LAST_SHRINK, 300, 500, 5000])(
    "with %i pipes passed, every seeded pair of pipes can be flown by a player tapping at most every 0.15 s",
    (gaps) => {
      let pairs = 0;
      for (const [width, height] of BOARDS) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const pipes = pipesAt(width, height, seed, gaps, 25);
          for (let i = 1; i < pipes.length; i++) {
            expect(flyable(width, height, gaps, pipes[i - 1], pipes[i]), `seed ${seed}, pipe ${i} on ${width}x${height}`).toBe(true);
            pairs++;
          }
        }
      }
      expect(pairs).toBeGreaterThan(400);
    },
    120_000
  );
});

describe("Flap v2 colours", () => {
  test("the pipes go a step darker every 10 pipes, darkest from 100", () => {
    expect([0, 9, 10, 50, 100, 500].map(pipeShadeStep)).toEqual([0, 0, 1, 5, 10, 10]);
  });

  test("the sky goes a step darker every 50 pipes, night at 500, with stars near the end", () => {
    expect([0, 10, 49, 50, 100, 200, 500, 5000].map(skyStep)).toEqual([0, 0, 0, 1, 2, 4, 10, 10]);
    expect(shades({ gaps: 350, time: 9, pipeShadeSince: 0, skySince: 0 }).stars).toBe(false);
    expect(shades({ gaps: 400, time: 9, pipeShadeSince: 0, skySince: 0 }).stars).toBe(true);
  });

  test("a new step fades in over a second", () => {
    const at = (time: number) => shades({ gaps: 50, time, pipeShadeSince: 3, skySince: 3 });
    expect(at(3).sky).toBe(0);
    expect(at(3.5).sky).toBeCloseTo(0.5 / FLAPPY_V2.skySteps, 9);
    expect(at(3 + FLAPPY_V2.fadeSeconds).sky).toBeCloseTo(1 / FLAPPY_V2.skySteps, 9);
    expect(at(60).sky).toBeCloseTo(1 / FLAPPY_V2.skySteps, 9);
    expect(at(3.5).pipe).toBeCloseTo(4.5 / FLAPPY_V2.pipeShadeSteps, 9);
    expect(shades({ gaps: 0, time: 1, pipeShadeSince: -1e9, skySince: -1e9 })).toEqual({ pipe: 0, sky: 0, stars: false });
  });

  test("passing the pipe that starts a step starts its fade", () => {
    let state: FlappyState = { ...newFlappy(390, 700, 1), gaps: 49, nextIn: Infinity };
    state = {
      ...state,
      pipes: [{ id: 1, x: birdX(state) - FLAPPY.radius - FLAPPY.pipeWidth + 1, gapTop: 0, gapHeight: 700, passed: false }],
    };
    const next = stepFlappy({ ...state, time: 12 }, FRAME);
    expect(next.gaps).toBe(50);
    expect(next.skySince).toBeCloseTo(12 + FRAME, 9);
    expect(next.pipeShadeSince).toBeCloseTo(12 + FRAME, 9);
  });
});

describe("Flap v2 test-only start", () => {
  test("a run started at a pipe count has that many pipes and that score, and no fade under way", () => {
    for (const pipes of [1, 10, 100, 500]) {
      const state = flappyAt(390, 700, 4, pipes);
      expect(state.gaps).toBe(pipes);
      expect(state.score).toBe(pipes);
      expect(shades(state).sky).toBe(skyStep(pipes) / FLAPPY_V2.skySteps);
    }
    let state = flap(flappyAt(390, 700, 4, 300));
    for (let i = 0; i < 120; i++) state = stepFlappy({ ...state, y: 300, vy: 0 }, FRAME);
    expect(state.pipes[0].gapHeight).toBe(FLAPPY_V2.minGap);
  });
});

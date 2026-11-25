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
  dayPassed,
  flappyColours,
  pipesFlown,
  pipeSpeed,
  type FlappyPalette,
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

/* eslint-disable no-restricted-syntax -- the colour maths is checked on a sample palette, not the game's own */
const PALETTE: FlappyPalette = {
  sky: [
    [0, "#f0c0a0"],
    [0.14, "#90d0e0"],
    [0.6, "#90d0e0"],
    [0.78, "#f0c070"],
    [0.91, "#e07060"],
    [1, "#202040"],
  ],
  sun: "#ffe8a0",
  sunset: "#ff9050",
  cloud: "#e8f8f8",
  pipe: "#50a060",
  pipeSunset: "#407848",
  pipeShadow: "#103020",
  ground: "#d8c088",
  groundSunset: "#c89060",
  grass: "#80a050",
  grassSunset: "#808840",
};
/* eslint-enable no-restricted-syntax */

const brightness = (hex: string) => [1, 3, 5].reduce((sum, at) => sum + parseInt(hex.slice(at, at + 2), 16), 0) / (3 * 255);
const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);

describe("Flap v2 colours: an afternoon passing into sunset", () => {
  const MARKS = [0, 50, 100, 200, 500, 1000];
  const at = (pipes: number) => flappyColours(pipes, PALETTE);

  test("the day eases in and out, reaches sunset at pipe 200 and holds there", () => {
    expect(dayPassed(0)).toBe(0);
    expect(dayPassed(FLAPPY_V2.sunsetPipe)).toBe(1);
    expect(dayPassed(1000)).toBe(1);
    expect(FLAPPY_V2.sunsetPipe).toBe(200);
    expect(dayPassed(40)).toBeGreaterThan(0.05);
    expect(dayPassed(40)).toBeLessThan(0.2);
    expect(dayPassed(100)).toBeCloseTo(0.5, 9);
    for (let pipes = 1; pipes <= FLAPPY_V2.sunsetPipe; pipes++) {
      expect(dayPassed(pipes)).toBeGreaterThan(dayPassed(pipes - 1));
      expect(dayPassed(pipes) - dayPassed(pipes - 1)).toBeLessThan(2 / FLAPPY_V2.sunsetPipe);
    }
  });

  test("the sky warms from day blue at 0 through 50 and 100 to sunset at 200, the same at 500 and 1000, never night", () => {
    const skies = MARKS.map((pipes) => at(pipes).sky);
    expect(skies[0]).toBe(PALETTE.sky[2][1]);
    expect(warmth(skies[1])).toBeGreaterThan(warmth(skies[0]));
    expect(warmth(skies[2])).toBeGreaterThan(warmth(skies[1]));
    expect(warmth(skies[3])).toBeGreaterThan(warmth(skies[2]));
    expect(skies[3]).toBe(PALETTE.sky[4][1]);
    expect(skies[4]).toBe(skies[3]);
    expect(skies[5]).toBe(skies[3]);
    expect(at(1000)).toEqual(at(200));
    expect(at(500)).toEqual(at(200));
    expect(brightness(skies[3])).toBeGreaterThan(0.45);
  });

  test("the pipes deepen gently to a cap at pipe 200, never near black, and their outline is always darker than the body", () => {
    const pipes = MARKS.map((count) => at(count));
    for (let i = 1; i < 4; i++) expect(brightness(pipes[i].pipe)).toBeLessThan(brightness(pipes[i - 1].pipe));
    expect(pipes[4].pipe).toBe(pipes[3].pipe);
    expect(pipes[5].pipe).toBe(pipes[3].pipe);
    expect(brightness(pipes[1].pipe)).toBeGreaterThan(0.95 * brightness(pipes[0].pipe));
    expect(brightness(pipes[3].pipe)).toBeGreaterThan(0.3);
    for (const colours of pipes) {
      expect(brightness(colours.outline)).toBeLessThan(brightness(colours.pipe) - 0.08);
      expect(Math.abs(brightness(colours.outline) - brightness(colours.sky))).toBeGreaterThan(0.15);
    }
  });

  test("the ground and the sun go with the day: the ground warms, the sun sinks and reddens", () => {
    const [noon, , , sunset] = MARKS.map((count) => at(count));
    expect(noon.ground).toBe(PALETTE.ground);
    expect(sunset.ground).toBe(PALETTE.groundSunset);
    expect(sunset.grass).toBe(PALETTE.grassSunset);
    expect(noon.sun).toBe(PALETTE.sun);
    expect(sunset.sun).toBe(PALETTE.sunset);
    expect(sunset.sunY).toBeGreaterThan(noon.sunY);
    expect(sunset.sunX).toBeGreaterThan(noon.sunX);
  });

  test("within a pipe the day moves on smoothly, from one pass to the next", () => {
    const state = flappyAt(390, 700, 1, 200);
    expect(pipesFlown(state)).toBe(200);
    const half = (FLAPPY_V2.spacing / pipeSpeed(200)) / 2;
    expect(pipesFlown({ ...state, time: state.time + half })).toBeCloseTo(200.5, 9);
    expect(pipesFlown({ ...state, time: state.time + 60 })).toBe(201);
  });

  test("passing a pipe marks when, so the day carries on from there", () => {
    let state: FlappyState = { ...newFlappy(390, 700, 1), gaps: 49, nextIn: Infinity };
    state = {
      ...state,
      pipes: [{ id: 1, x: birdX(state) - FLAPPY.radius - FLAPPY.pipeWidth + 1, gapTop: 0, gapHeight: 700, passed: false }],
    };
    const next = stepFlappy({ ...state, time: 12 }, FRAME);
    expect(next.gaps).toBe(50);
    expect(next.passedAt).toBeCloseTo(12 + FRAME, 9);
    expect(pipesFlown(next)).toBe(50);
  });
});

describe("Flap v2 test-only start", () => {
  test("a run started at a pipe count has that many pipes and that score, and the day that far on", () => {
    for (const pipes of [1, 10, 100, 500]) {
      const state = flappyAt(390, 700, 4, pipes);
      expect(state.gaps).toBe(pipes);
      expect(state.score).toBe(pipes);
      expect(pipesFlown(state)).toBe(pipes);
    }
    let state = flap(flappyAt(390, 700, 4, 300));
    for (let i = 0; i < 120; i++) state = stepFlappy({ ...state, y: 300, vy: 0 }, FRAME);
    expect(state.pipes[0].gapHeight).toBe(FLAPPY_V2.minGap);
  });
});

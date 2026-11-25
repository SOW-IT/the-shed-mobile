import { describe, expect, test } from "vitest";
import {
  FLAPPY,
  flap,
  MAX_GAP_DROP,
  MAX_GAP_RISE,
  newFlappy,
  pipeSpeed,
  reachShare,
  stepFlappy,
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

const through = (state: FlappyState, goal: number): boolean =>
  !state.over && (state.gaps >= goal || through(beat(state), goal) || through(beat(flap(state)), goal));

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
    expect(spread(spaces(200))).toBeGreaterThan(spread(spaces(30)));
    for (const space of spaces(10_000)) {
      expect(space).toBeGreaterThanOrEqual(FLAPPY.closestSpacing - 4);
      expect(space).toBeLessThanOrEqual(FLAPPY.farthestSpacing + 4);
    }
  });

  test("the jump from one gap to the next gets bigger as the score rises", () => {
    const jumps = (gaps: number) => meanJump([1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => pipesAt(360, 640, seed, gaps)));
    expect(jumps(30)).toBeGreaterThan(jumps(0));
    expect(jumps(200)).toBeGreaterThan(jumps(30));
  });

  test("a gap never rises or drops more than the bird can manage over the space before it", () => {
    for (const [width, height] of [[360, 640], [480, 820]]) {
      for (const gaps of [0, 20, 60, 200, 1000]) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const pipes = pipesAt(width, height, seed, gaps);
          for (let i = 1; i < pipes.length; i++) {
            const reach = reachShare(pipes[i].space + 0.01);
            expect(pipes[i - 1].gapTop - pipes[i].gapTop).toBeLessThanOrEqual(MAX_GAP_RISE * reach + 1);
            expect(pipes[i].gapTop - pipes[i - 1].gapTop).toBeLessThanOrEqual(MAX_GAP_DROP * reach + 1);
          }
        }
      }
    }
  });

  test.each([0, 20, 60, 200, 1000])(
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

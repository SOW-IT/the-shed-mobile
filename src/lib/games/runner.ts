// Mystic Man: he runs on his own and keeps speeding up. Jump the low
// obstacles, slide under the high ones. The score is the distance run. Pure:
// each step takes a state and returns the next. Heights are measured up from
// the ground.
import { between, random } from "./random";

export const RUNNER = {
  x: 56,
  width: 28,
  standHeight: 54,
  slideHeight: 26,
  gravity: 2600,
  jumpSpeed: 900,
  /** A swipe down in the air drops him this fast. */
  diveSpeed: 1300,
  slideSeconds: 0.6,
  startSpeed: 300,
  speedGain: 9,
  topSpeed: 720,
  /** Distance per point. */
  stride: 12,
  /** High obstacles float this far up: over a slide, into a standing head. */
  highBottom: 34,
  highHeight: 22,
  /** Hit boxes are this much smaller than they look, to be fair. */
  forgive: 4,
} as const;

export type Obstacle = {
  id: number;
  kind: "low" | "high";
  x: number;
  width: number;
  height: number;
  bottom: number;
};

export type RunnerState = {
  width: number;
  over: boolean;
  time: number;
  distance: number;
  speed: number;
  score: number;
  /** Height of his feet above the ground, and how fast that's changing. */
  y: number;
  vy: number;
  slideFor: number;
  /** A slide asked for in the air, started on landing. */
  slideOnLanding: boolean;
  obstacles: Obstacle[];
  /** Distance until the next obstacle appears at the right edge. */
  nextIn: number;
  nextId: number;
  seed: number;
};

export const newRunner = (width: number, seed: number): RunnerState => ({
  width,
  over: false,
  time: 0,
  distance: 0,
  speed: RUNNER.startSpeed,
  score: 0,
  y: 0,
  vy: 0,
  slideFor: 0,
  slideOnLanding: false,
  obstacles: [],
  nextIn: width * 0.6,
  nextId: 1,
  seed,
});

export const onGround = (state: RunnerState) => state.y <= 0;
export const sliding = (state: RunnerState) => state.slideFor > 0;
export const runnerHeight = (state: RunnerState) => (sliding(state) ? RUNNER.slideHeight : RUNNER.standHeight);

export const jump = (state: RunnerState): RunnerState =>
  state.over || !onGround(state)
    ? state
    : { ...state, vy: RUNNER.jumpSpeed, slideFor: 0, slideOnLanding: false };

/** Slides on the ground; in the air, drops fast and slides on landing. */
export const duck = (state: RunnerState): RunnerState => {
  if (state.over) return state;
  if (onGround(state)) return { ...state, slideFor: RUNNER.slideSeconds };
  return { ...state, vy: Math.min(state.vy, -RUNNER.diveSpeed), slideOnLanding: true };
};

export const runnerSpeed = (time: number) => Math.min(RUNNER.topSpeed, RUNNER.startSpeed + time * RUNNER.speedGain);

const newObstacle = (state: RunnerState): Obstacle => {
  const high = state.time > 6 && random(state) < 0.35;
  const id = state.nextId++;
  if (high) {
    return { id, kind: "high", x: state.width + 10, width: 46, height: RUNNER.highHeight, bottom: RUNNER.highBottom };
  }
  return {
    id,
    kind: "low",
    x: state.width + 10,
    width: Math.round(between(state, 20, 34)),
    height: Math.round(between(state, 32, 50)),
    bottom: 0,
  };
};

/**
 * Distance to the next obstacle: always enough to land a jump and react,
 * which is about a second of running at any speed.
 */
export const gapAfter = (state: RunnerState) => state.speed * between(state, 0.85, 1.7) + 140;

const hits = (state: RunnerState, obstacle: Obstacle) => {
  const f = RUNNER.forgive;
  const left = RUNNER.x - RUNNER.width / 2 + f;
  const right = RUNNER.x + RUNNER.width / 2 - f;
  const bottom = state.y + f;
  const top = state.y + runnerHeight(state) - f;
  const overlapsX = obstacle.x < right && obstacle.x + obstacle.width > left;
  const overlapsY = obstacle.bottom < top && obstacle.bottom + obstacle.height > bottom;
  return overlapsX && overlapsY;
};

export const stepRunner = (previous: RunnerState, dt: number): RunnerState => {
  if (previous.over) return previous;
  const state: RunnerState = { ...previous };
  state.time += dt;
  state.speed = runnerSpeed(state.time);
  const travelled = state.speed * dt;
  state.distance += travelled;

  if (!onGround(state) || state.vy > 0) {
    state.vy -= RUNNER.gravity * dt;
    state.y = Math.max(0, state.y + state.vy * dt);
    if (state.y === 0) {
      state.vy = 0;
      if (state.slideOnLanding) state.slideFor = RUNNER.slideSeconds;
      state.slideOnLanding = false;
    }
  }
  state.slideFor = Math.max(0, state.slideFor - (onGround(state) ? dt : 0));

  const obstacles = previous.obstacles
    .map((obstacle) => ({ ...obstacle, x: obstacle.x - travelled }))
    .filter((obstacle) => obstacle.x + obstacle.width > -10);
  state.nextIn -= travelled;
  if (state.nextIn <= 0) {
    obstacles.push(newObstacle(state));
    state.nextIn = gapAfter(state);
  }
  state.obstacles = obstacles;
  state.over = obstacles.some((obstacle) => hits(state, obstacle));
  state.score = Math.floor(state.distance / RUNNER.stride);
  return state;
};

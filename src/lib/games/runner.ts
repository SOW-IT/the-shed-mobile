// Mystic Man: he runs on his own and keeps speeding up. A tap is a small hop,
// a swipe up the big jump, a swipe down a slide. The score is the distance
// run. Pure: each step takes a state and returns the next. Heights are
// measured up from the ground.
//
// Every obstacle pattern is sized from the jump physics at the speed it
// appears, so the right input always clears it (see `PATTERN_RULES` and the
// clearability test).
import { between, random } from "./random";

export const RUNNER = {
  x: 56,
  width: 28,
  standHeight: 54,
  slideHeight: 26,
  gravity: 2600,
  /** The big jump: a swipe up. Rises about 156. */
  jumpSpeed: 900,
  /** The small hop: a tap. Rises about 69. */
  hopSpeed: 600,
  /** A hop turns into the big jump if the swipe up comes this soon after it. */
  upgradeSeconds: 0.15,
  /** A swipe down in the air drops him this fast. */
  diveSpeed: 1300,
  slideSeconds: 0.6,
  startSpeed: 300,
  speedGain: 9,
  topSpeed: 720,
  /** Distance per point. */
  stride: 12,
  /** The floating beam: over a slide, into a standing head; a big jump clears it too. */
  highBottom: 34,
  highHeight: 22,
  /** The hanging vines come down to here and go up out of sight: slide only. */
  hangBottom: 32,
  hangHeight: 600,
  /** Hit boxes are this much smaller than they look, to be fair. */
  forgive: 4,
} as const;

/** The width of his hit box. */
export const HIT_WIDTH = RUNNER.width - RUNNER.forgive * 2;

export type ObstacleKind = "rock" | "tall" | "wide" | "beam" | "hang";
export type PatternKind = "rock" | "tall" | "wide" | "double" | "beam" | "hang";

export type Obstacle = {
  id: number;
  kind: ObstacleKind;
  /** The obstacles of one pattern (a double is two rocks) share a group. */
  group: number;
  pattern: PatternKind;
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
  /** Seconds since takeoff while in the air, and whether it's the big jump. */
  jumpAge: number | null;
  bigJump: boolean;
  slideFor: number;
  /** A slide asked for in the air, started on landing. */
  slideOnLanding: boolean;
  obstacles: Obstacle[];
  /** Distance until the next pattern appears at the right edge. */
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
  jumpAge: null,
  bigJump: false,
  slideFor: 0,
  slideOnLanding: false,
  obstacles: [],
  nextIn: width * 0.6,
  nextId: 1,
  seed,
});

export const onGround = (state: RunnerState) => state.y <= 0 && state.vy <= 0;
export const sliding = (state: RunnerState) => state.slideFor > 0;
export const runnerHeight = (state: RunnerState) => (sliding(state) ? RUNNER.slideHeight : RUNNER.standHeight);

// ---- Physics, used both to play and to size obstacles ----------------------

export const apex = (speed: number) => (speed * speed) / (2 * RUNNER.gravity);
const airtime = (speed: number) => (2 * speed) / RUNNER.gravity;

/** Seconds a jump of the given speed keeps his feet above `height`. */
const timeAbove = (speed: number, height: number) => {
  const d = speed * speed - 2 * RUNNER.gravity * Math.max(0, height);
  return d <= 0 ? 0 : (2 * Math.sqrt(d)) / RUNNER.gravity;
};

/**
 * The longest stretch of obstacle of the given height a jump clears at a run
 * speed: the distance run while his feet are high enough, less his width.
 */
export const clearableLength = (jumpSpeed: number, height: number, runSpeed: number) =>
  runSpeed * timeAbove(jumpSpeed, height - RUNNER.forgive) - HIT_WIDTH;

// ---- Input -------------------------------------------------------------------

/** A tap: the small hop. */
export const hop = (state: RunnerState): RunnerState =>
  state.over || !onGround(state)
    ? state
    : { ...state, vy: RUNNER.hopSpeed, jumpAge: 0, bigJump: false, slideFor: 0, slideOnLanding: false };

/**
 * A swipe up: the big jump. Just after a hop (the tap that began the swipe)
 * it turns the hop into the big jump, rising to the big jump's full height.
 */
export const jump = (state: RunnerState): RunnerState => {
  if (state.over) return state;
  if (onGround(state)) {
    return { ...state, vy: RUNNER.jumpSpeed, jumpAge: 0, bigJump: true, slideFor: 0, slideOnLanding: false };
  }
  if (!state.bigJump && state.jumpAge !== null && state.jumpAge < RUNNER.upgradeSeconds) {
    // Rise from here to the big jump's full height, without a jerk.
    const vy = Math.sqrt(2 * RUNNER.gravity * Math.max(0, apex(RUNNER.jumpSpeed) - state.y));
    return { ...state, vy, bigJump: true };
  }
  return state;
};

/** Slides on the ground; in the air, drops fast and slides on landing. */
export const duck = (state: RunnerState): RunnerState => {
  if (state.over) return state;
  if (onGround(state)) return { ...state, slideFor: RUNNER.slideSeconds };
  return { ...state, vy: Math.min(state.vy, -RUNNER.diveSpeed), slideOnLanding: true };
};

export const runnerSpeed = (time: number) => Math.min(RUNNER.topSpeed, RUNNER.startSpeed + time * RUNNER.speedGain);

// ---- Patterns ------------------------------------------------------------------

/** How much of a jump's reach a pattern may use, so a human has slack. */
export const REACH_SHARE = 0.75;
/** Seconds to see the next pattern and act, on top of landing a big jump. */
const REACTION_SECONDS = 0.4;

const HOP_HEIGHT = apex(RUNNER.hopSpeed);

/**
 * What each pattern asks for, as heights and lengths that follow from the
 * physics. A hop pattern fits under the hop's reach; a big pattern is out of
 * the hop's reach (taller, or longer) but inside the big jump's.
 */
const PATTERN_RULES = {
  rock: { height: [22, 34], width: [18, 28] },
  tall: { height: [Math.ceil(HOP_HEIGHT + RUNNER.forgive + 10), 104], width: [22, 30] },
  wide: { height: [26, 34] },
  // Two rocks back to back, each out of a hop's reach.
  double: { height: [Math.ceil(HOP_HEIGHT + RUNNER.forgive + 6), 88], width: [18, 24], gap: [10, 24] },
  hang: { width: [30, 48] },
} as const;

/** Which patterns can appear, by seconds into the run. */
const patternFor = (state: RunnerState): PatternKind => {
  const roll = random(state);
  if (state.time < 5) return "rock";
  if (state.time < 12) return roll < 0.55 ? "rock" : roll < 0.75 ? "tall" : "beam";
  if (roll < 0.28) return "rock";
  if (roll < 0.43) return "tall";
  if (roll < 0.58) return "wide";
  if (roll < 0.73) return "double";
  if (roll < 0.85) return "beam";
  return "hang";
};

const whole = (state: RunnerState, low: number, high: number) => Math.round(between(state, low, high));

/** The obstacles of one pattern, left edge at `x`, sized for the run speed. */
export const makePattern = (state: RunnerState, kind: PatternKind, x: number): Obstacle[] => {
  const s = state.speed;
  const group = state.nextId;
  const base = (rest: Omit<Obstacle, "id" | "group" | "pattern">): Obstacle => ({
    id: state.nextId++,
    group,
    pattern: kind,
    ...rest,
  });
  switch (kind) {
    case "rock": {
      const r = PATTERN_RULES.rock;
      return [base({ kind: "rock", x, width: whole(state, ...r.width), height: whole(state, ...r.height), bottom: 0 })];
    }
    case "tall": {
      const r = PATTERN_RULES.tall;
      return [base({ kind: "tall", x, width: whole(state, ...r.width), height: whole(state, ...r.height), bottom: 0 })];
    }
    case "wide": {
      const height = whole(state, ...PATTERN_RULES.wide.height);
      // Longer than a hop reaches, shorter than the big jump's reach.
      const low = clearableLength(RUNNER.hopSpeed, height, s) + 10;
      const high = REACH_SHARE * clearableLength(RUNNER.jumpSpeed, height, s);
      return [base({ kind: "wide", x, width: Math.floor(between(state, low, Math.max(low, high))), height, bottom: 0 })];
    }
    case "double": {
      const r = PATTERN_RULES.double;
      const first = whole(state, ...r.width);
      const second = whole(state, ...r.width);
      const gap = whole(state, ...r.gap);
      // Too tall for a hop; short enough that the big jump clears the pair.
      const tallest = (height: number) =>
        first + gap + second <= REACH_SHARE * clearableLength(RUNNER.jumpSpeed, height, s);
      let height = whole(state, ...r.height);
      while (height > r.height[0] && !tallest(height)) height -= 2;
      return [
        base({ kind: "rock", x, width: first, height, bottom: 0 }),
        base({ kind: "rock", x: x + first + gap, width: second, height, bottom: 0 }),
      ];
    }
    case "beam":
      return [base({ kind: "beam", x, width: 46, height: RUNNER.highHeight, bottom: RUNNER.highBottom })];
    case "hang":
      return [
        base({
          kind: "hang",
          x,
          width: whole(state, ...PATTERN_RULES.hang.width),
          height: RUNNER.hangHeight,
          bottom: RUNNER.hangBottom,
        }),
      ];
  }
};

/** The length of a pattern, front to back. */
export const patternSpan = (obstacles: readonly Obstacle[]) =>
  Math.max(...obstacles.map((o) => o.x + o.width)) - Math.min(...obstacles.map((o) => o.x));

/**
 * The clear run after a pattern: long enough to land the longest jump, see
 * the next pattern and act, at the current speed. Never shorter than that,
 * so a slide-only pattern can't come where a landing leaves no time to duck.
 */
export const minimumGap = (speed: number) => speed * (airtime(RUNNER.jumpSpeed) + REACTION_SECONDS) + 40;

const gapAfter = (state: RunnerState) => minimumGap(state.speed) + state.speed * between(state, 0, 0.8);

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

  if (state.y > 0 || state.vy > 0) {
    // Exact over the step, so the arc matches apex() and timeAbove().
    state.y = Math.max(0, state.y + state.vy * dt - (RUNNER.gravity * dt * dt) / 2);
    state.vy -= RUNNER.gravity * dt;
    state.jumpAge = (state.jumpAge ?? 0) + dt;
    if (state.y === 0) {
      state.vy = 0;
      state.jumpAge = null;
      state.bigJump = false;
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
    const pattern = makePattern(state, patternFor(state), state.width + 10);
    obstacles.push(...pattern);
    state.nextIn = patternSpan(pattern) + gapAfter(state);
  }
  state.obstacles = obstacles;
  state.over = obstacles.some((obstacle) => hits(state, obstacle));
  state.score = Math.floor(state.distance / RUNNER.stride);
  return state;
};

const PATTERN_KINDS: readonly PatternKind[] = ["rock", "tall", "wide", "double", "beam", "hang"];
export const isPatternKind = (value: string): value is PatternKind => (PATTERN_KINDS as readonly string[]).includes(value);

/**
 * A still board showing the given patterns, sized as they'd be `time`
 * seconds into a run. For screenshots in test builds only.
 */
export const previewWith = (width: number, kinds: readonly PatternKind[], time = 30): RunnerState => {
  const state: RunnerState = { ...newRunner(width, 7), time, speed: runnerSpeed(time), nextIn: Infinity };
  let x = width * 0.4;
  const obstacles: Obstacle[] = [];
  for (const kind of kinds) {
    const pattern = makePattern(state, kind, x);
    obstacles.push(...pattern);
    x += patternSpan(pattern) + 60;
  }
  return { ...state, obstacles };
};

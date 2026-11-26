// Mystic Man: he runs on his own and keeps speeding up. A tap is a small hop,
// a swipe up the big jump, a swipe down a slide. The score is the distance
// run. Pure: each step takes a state and returns the next. Heights are
// measured up from the ground.
//
// Every obstacle pattern is sized from the jump physics at the speed it
// appears, so the right input always clears it (see `PATTERN_RULES` and the
// clearability test).
import { between, random } from "./random";
import { RUNNER_V2 } from "./runnerTuning";

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
  cruiseSpeed: 1200,
  topSpeed: 1500,
  surge: RUNNER_V2.speed.surge,
  ceilingSpeed: RUNNER_V2.speed.cap,
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

export type ObstacleKind = "rock" | "tall" | "wide" | "beam" | "bar" | "hang";
export type PatternKind = "rock" | "tall" | "wide" | "double" | "triple" | "stair" | "beam" | "bar" | "hang" | "twin";

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
  /** The rest of a combo under way: patterns still to come, close behind. */
  chain: PatternKind[];
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
  chain: [],
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
  // The hop from the same touch hasn't left the ground yet: slide instead.
  if (state.y <= 0) {
    return { ...state, vy: 0, jumpAge: null, bigJump: false, slideFor: RUNNER.slideSeconds, slideOnLanding: false };
  }
  return { ...state, vy: Math.min(state.vy, -RUNNER.diveSpeed), slideOnLanding: true };
};

export const HARD_FROM_SCORE = 10_000;
export const HARDEST_SCORE = 20_000;

const CRUISE_FROM_SECONDS = (RUNNER.cruiseSpeed - RUNNER.startSpeed) / RUNNER.speedGain;
const CRUISE_FROM_DISTANCE = ((RUNNER.startSpeed + RUNNER.cruiseSpeed) / 2) * CRUISE_FROM_SECONDS;
export const HARD_FROM_SECONDS =
  CRUISE_FROM_SECONDS + (HARD_FROM_SCORE * RUNNER.stride - CRUISE_FROM_DISTANCE) / RUNNER.cruiseSpeed;
const HARD_RAMP_SECONDS =
  ((HARDEST_SCORE - HARD_FROM_SCORE) * RUNNER.stride) / ((RUNNER.cruiseSpeed + RUNNER.topSpeed) / 2);

const HARDEST_SECONDS = HARD_FROM_SECONDS + HARD_RAMP_SECONDS;
const BEYOND_SECONDS = RUNNER_V2.beyondSeconds;
const SURGE_EASE_SECONDS = RUNNER_V2.speed.surgeEaseSeconds;
const SURGE_TOP_SECONDS =
  ((RUNNER.ceilingSpeed - RUNNER.topSpeed) / RUNNER.surge + Math.sqrt(SURGE_EASE_SECONDS)) ** 2 - SURGE_EASE_SECONDS;

export const hardness = (time: number) => Math.min(1, Math.max(0, (time - HARD_FROM_SECONDS) / HARD_RAMP_SECONDS));

const pastHardest = (time: number) => Math.max(0, time - HARDEST_SECONDS);

const beyondHardest = (time: number) => {
  const past = pastHardest(time);
  return past === Infinity ? 1 : past / (past + BEYOND_SECONDS);
};

const surgeSpeed = (past: number) =>
  RUNNER.topSpeed +
  RUNNER.surge * (Math.sqrt(Math.min(past, SURGE_TOP_SECONDS) + SURGE_EASE_SECONDS) - Math.sqrt(SURGE_EASE_SECONDS));

const surgeDistance = (past: number) => {
  const rising = Math.min(past, SURGE_TOP_SECONDS);
  const root = Math.sqrt(SURGE_EASE_SECONDS);
  const climb = RUNNER.surge * ((2 / 3) * ((rising + SURGE_EASE_SECONDS) ** 1.5 - SURGE_EASE_SECONDS ** 1.5) - root * rising);
  return RUNNER.topSpeed * rising + climb + RUNNER.ceilingSpeed * Math.max(0, past - SURGE_TOP_SECONDS);
};

const ease = (easy: number, hardest: number, limit: number, time: number) =>
  easy + (hardest - easy) * hardness(time) + (limit - hardest) * beyondHardest(time);

export const runnerSpeed = (time: number) =>
  time < HARD_FROM_SECONDS
    ? Math.min(RUNNER.cruiseSpeed, RUNNER.startSpeed + time * RUNNER.speedGain)
    : time < HARDEST_SECONDS
      ? ease(RUNNER.cruiseSpeed, RUNNER.topSpeed, RUNNER.topSpeed, time)
      : surgeSpeed(pastHardest(time));

const distanceAt = (time: number) => {
  const rising = Math.min(time, CRUISE_FROM_SECONDS);
  const cruising = Math.min(Math.max(0, time - CRUISE_FROM_SECONDS), HARD_FROM_SECONDS - CRUISE_FROM_SECONDS);
  const surging = Math.min(Math.max(0, time - HARD_FROM_SECONDS), HARD_RAMP_SECONDS);
  return (
    (rising * (RUNNER.startSpeed + runnerSpeed(rising))) / 2 +
    cruising * RUNNER.cruiseSpeed +
    (surging * (RUNNER.cruiseSpeed + runnerSpeed(HARD_FROM_SECONDS + surging))) / 2 +
    surgeDistance(pastHardest(time))
  );
};

export const timeAtScore = (score: number) => {
  const distance = score * RUNNER.stride;
  let low = 0;
  let high = 1;
  while (distanceAt(high) < distance) high *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (distanceAt(mid) < distance) low = mid;
    else high = mid;
  }
  return high;
};

export const SLACK_GONE_SCORE = RUNNER_V2.gap.slackGoneScore;
const SLACK_GONE_SECONDS = timeAtScore(SLACK_GONE_SCORE);
export const TRIPLE_FROM_SCORE = RUNNER_V2.unlockScores.triple;

export const PHRASES: readonly { name: string; from: number; kinds: readonly PatternKind[] }[] = RUNNER_V2.phrases;
export const VARIETY_FROM_SCORE = RUNNER_V2.spread.fromScore;
const VARIETY_FROM_SECONDS = timeAtScore(VARIETY_FROM_SCORE);
const SPREAD_SECONDS = RUNNER_V2.spread.seconds;

export const sizeSpread = (time: number) =>
  time < VARIETY_FROM_SECONDS ? 0 : 1 - Math.exp(-(time - VARIETY_FROM_SECONDS) / SPREAD_SECONDS);

export const PATTERN_FROM_SCORE: Partial<Record<PatternKind, number>> = RUNNER_V2.unlockScores;
const LATE_KINDS = (Object.keys(PATTERN_FROM_SCORE) as PatternKind[]).map((kind) => ({
  kind,
  from: timeAtScore(PATTERN_FROM_SCORE[kind] ?? 0),
}));

export const lateKindsAt = (time: number) => LATE_KINDS.filter((late) => time >= late.from).map((late) => late.kind);

const PHRASE_SECONDS = PHRASES.map((phrase) => timeAtScore(phrase.from));
const PHRASE_SHARE = RUNNER_V2.phraseShare;

export const phrasesAt = (time: number) => PHRASES.filter((_, i) => time >= PHRASE_SECONDS[i]);

export const practiceStart = (value: string | undefined) => {
  const score = Number(value);
  return Number.isInteger(score) && score > 0 && score <= 1_000_000 ? score : undefined;
};

export const runnerAt = (width: number, seed: number, score: number): RunnerState => {
  const time = timeAtScore(score);
  return { ...newRunner(width, seed), time, speed: runnerSpeed(time), distance: score * RUNNER.stride, score };
};

// ---- Patterns ------------------------------------------------------------------

/** How much of a jump's reach a pattern may use, so a human has slack. */
export const REACH_SHARE = 0.75;
/** Seconds to see the next pattern and act, on top of landing a big jump. */
const REACTION_SECONDS = RUNNER_V2.gap.reaction;
/** Within a combo, seconds between landing one move and starting the next. */
const COMBO_REACTION_SECONDS = RUNNER_V2.combo.reaction.start;
const HARDEST_COMBO_REACTION_SECONDS = RUNNER_V2.combo.reaction.at20k;
const LEAST_COMBO_REACTION_SECONDS = RUNNER_V2.combo.reaction.floor;

type Range = readonly [number, number];
type Spread = readonly [Range, Range];

/**
 * What each pattern asks for, as heights and lengths that follow from the
 * physics. A hop pattern fits under the hop's reach; a big pattern is out of
 * the hop's reach (taller, or longer) but inside the big jump's.
 */
const PATTERN_RULES = RUNNER_V2.sizes;

const DUCK_LEAD_SECONDS = RUNNER_V2.duckLeadSeconds;

export const slideReach = (speed: number) => speed * (RUNNER.slideSeconds - DUCK_LEAD_SECONDS) - HIT_WIDTH;

export const jumpReach = (speed: number, top: number) => REACH_SHARE * clearableLength(RUNNER.jumpSpeed, top, speed);

export const hopReach = (speed: number, top: number) => REACH_SHARE * clearableLength(RUNNER.hopSpeed, top, speed);

/**
 * Combos: patterns that come close behind each other, so one move leads
 * straight into the next, in a random order. Each gap is `comboGap`, worked
 * out from the moves either side, so any order is tight but clearable. They
 * start at 15 seconds as pairs, come more often and run longer the longer
 * you last: one more pattern every `COMBO_GROWTH_SECONDS`, up to
 * `MAX_COMBO`.
 */
export const COMBO_FROM_SECONDS = 15;
const COMBO_GROWTH_SECONDS = 15;
export const MAX_COMBO = 10;
export const HARDEST_COMBO = 16;
const HARDEST_COMBO_CHANCE = RUNNER_V2.combo.chanceAt20k;
const COMBO_CHANCE_LIMIT = RUNNER_V2.combo.chanceLimit;
const LONGER_COMBO_SECONDS = RUNNER_V2.combo.longerEverySeconds;

/** The longest combo that can come at this point in a run, or 0 before they start. */
export const longestCombo = (time: number) =>
  time < COMBO_FROM_SECONDS
    ? 0
    : Math.min(MAX_COMBO, 2 + Math.floor((time - COMBO_FROM_SECONDS) / COMBO_GROWTH_SECONDS)) +
      Math.round((HARDEST_COMBO - MAX_COMBO) * hardness(time)) +
      Math.floor(pastHardest(time) / LONGER_COMBO_SECONDS);

/** How often the next pattern is a combo: a quarter at first, up to two thirds. */
export const comboChance = (time: number) =>
  Math.min(0.66, 0.25 + (time - COMBO_FROM_SECONDS) * 0.004) +
  ease(0, HARDEST_COMBO_CHANCE - 0.66, COMBO_CHANCE_LIMIT - 0.66, time);

/** Each pattern of a combo, weighted: mostly hops, which lead into the rest. */
const COMBO_KINDS: readonly PatternKind[] = ["rock", "rock", "rock", "tall", "wide", "double", "beam", "hang", "hang"];

const pick = <T>(state: RunnerState, from: readonly T[]) => from[Math.floor(random(state) * from.length) % from.length];

/** Which pattern, or combo, comes next. */
const patternsFor = (state: RunnerState): readonly PatternKind[] => {
  const longest = longestCombo(state.time);
  if (longest < 2 || random(state) >= comboChance(state.time)) return [patternFor(state)];
  // Mostly as long as it gets by now, sometimes one shorter.
  const length = Math.max(2, longest - (random(state) < 0.35 ? 1 : 0));
  const phrases = phrasesAt(state.time);
  const late = lateKindsAt(state.time);
  const kinds = late.length > 0 ? [...COMBO_KINDS, ...late] : COMBO_KINDS;
  const combo: PatternKind[] = [];
  while (combo.length < length) {
    const phrase = phrases.length > 0 && random(state) < PHRASE_SHARE ? pick(state, phrases) : null;
    if (phrase && combo.length + phrase.kinds.length <= length) combo.push(...phrase.kinds);
    else combo.push(pick(state, kinds));
  }
  return combo;
};

/** Which single pattern can appear, by seconds into the run. */
const patternFor = (state: RunnerState): PatternKind => {
  const roll = random(state);
  if (state.time < 5) return "rock";
  if (state.time < 12) return roll < 0.55 ? "rock" : roll < 0.75 ? "tall" : "beam";
  const late = lateKindsAt(state.time);
  if (late.length > 0 && random(state) < LATE_SHARE * late.length) return pick(state, late);
  if (roll < 0.28) return "rock";
  if (roll < 0.43) return "tall";
  if (roll < 0.58) return "wide";
  if (roll < 0.73) return "double";
  if (roll < 0.85) return "beam";
  return "hang";
};

const LATE_SHARE = RUNNER_V2.lateShare;

const whole = (state: RunnerState, low: number, high: number) => Math.round(between(state, low, high));

export type SizeChoice = "random" | "least" | "most";

const ranged = (spread: number, [base, widest]: Spread): Range => [
  base[0] + (widest[0] - base[0]) * spread,
  base[1] + (widest[1] - base[1]) * spread,
];

/** The obstacles of one pattern, left edge at `x`, sized for the run speed. */
export const makePattern = (state: RunnerState, kind: PatternKind, x: number, choice: SizeChoice = "random"): Obstacle[] => {
  const s = state.speed;
  const spread = sizeSpread(state.time);
  const group = state.nextId;
  const base = (rest: Omit<Obstacle, "id" | "group" | "pattern">): Obstacle => ({
    id: state.nextId++,
    group,
    pattern: kind,
    ...rest,
  });
  const size = (range: Spread) => {
    const [low, high] = ranged(spread, range);
    if (choice === "least") return Math.round(low);
    if (choice === "most") return Math.round(high);
    return low === high ? low : whole(state, low, high);
  };
  switch (kind) {
    case "rock": {
      const r = PATTERN_RULES.rock;
      const width = size(r.width);
      const height = size(r.height);
      return [base({ kind: "rock", x, width: Math.min(width, Math.floor(hopReach(s, height))), height, bottom: 0 })];
    }
    case "tall": {
      const r = PATTERN_RULES.tall;
      const width = size(r.width);
      const height = size(r.height);
      return [base({ kind: "tall", x, width: Math.min(width, Math.floor(jumpReach(s, height))), height, bottom: 0 })];
    }
    case "wide": {
      const [shortest, tallest] = ranged(spread, PATTERN_RULES.wide.height);
      const height = choice === "least" ? Math.round(tallest) : choice === "most" ? Math.round(shortest) : size(PATTERN_RULES.wide.height);
      // Longer than a hop reaches, shorter than the big jump's reach.
      const low = clearableLength(RUNNER.hopSpeed, height, s) + 10;
      const high = jumpReach(s, height);
      const width = choice === "least" ? low : choice === "most" ? high : between(state, low, Math.max(low, high));
      return [base({ kind: "wide", x, width: Math.floor(Math.max(low, Math.min(high, width))), height, bottom: 0 })];
    }
    case "double": {
      const r = PATTERN_RULES.double;
      const first = size(r.width);
      const second = size(r.width);
      const gap = size(r.gap);
      // Too tall for a hop; short enough that the big jump clears the pair.
      const tallest = (height: number) => first + gap + second <= jumpReach(s, height);
      let height = size(r.height);
      while (height > r.height[0][0] && !tallest(height)) height -= 2;
      return [
        base({ kind: "rock", x, width: first, height, bottom: 0 }),
        base({ kind: "rock", x: x + first + gap, width: second, height, bottom: 0 }),
      ];
    }
    case "triple": {
      const r = PATTERN_RULES.triple;
      const widths = [size(r.width), size(r.width), size(r.width)];
      const rolled = size(r.gap);
      const solid = widths[0] + widths[1] + widths[2];
      let height = size(r.height);
      while (height > r.height[0][0] && solid + 2 * rolled > jumpReach(s, height)) height -= 2;
      const gap = Math.max(10, Math.min(rolled, Math.floor((jumpReach(s, height) - solid) / 2)));
      return [
        base({ kind: "rock", x, width: widths[0], height, bottom: 0 }),
        base({ kind: "rock", x: x + widths[0] + gap, width: widths[1], height, bottom: 0 }),
        base({ kind: "rock", x: x + widths[0] + widths[1] + 2 * gap, width: widths[2], height, bottom: 0 }),
      ];
    }
    case "stair": {
      const r = PATTERN_RULES.stair;
      const first = size(r.width);
      const second = size(r.width);
      const gap = size(r.gap);
      const rise = size(r.rise);
      let low = size(r.height);
      while (low > r.height[0][0] && first + gap + second > jumpReach(s, low + rise)) low -= 2;
      return [
        base({ kind: "rock", x, width: first, height: low, bottom: 0 }),
        base({ kind: "tall", x: x + first + gap, width: second, height: low + rise, bottom: 0 }),
      ];
    }
    case "beam":
    case "bar": {
      const r = PATTERN_RULES[kind];
      const width = size(r.width);
      const height = size(r.height);
      const bottom = size(r.bottom);
      const longest = Math.floor(Math.min(jumpReach(s, bottom + height), slideReach(s)));
      return [base({ kind, x, width: Math.min(width, longest), height, bottom })];
    }
    case "hang": {
      const r = PATTERN_RULES.hang;
      const width = Math.min(size(r.width), Math.floor(slideReach(s)));
      return [base({ kind: "hang", x, width, height: RUNNER.hangHeight, bottom: size(r.bottom) })];
    }
    case "twin": {
      const r = PATTERN_RULES.twin;
      const first = size(r.width);
      const second = size(r.width);
      const gap = Math.max(10, Math.min(size(r.gap), Math.floor(slideReach(s)) - first - second));
      return [
        base({ kind: "hang", x, width: first, height: RUNNER.hangHeight, bottom: RUNNER.hangBottom }),
        base({ kind: "hang", x: x + first + gap, width: second, height: RUNNER.hangHeight, bottom: RUNNER.hangBottom }),
      ];
    }
  }
};

/** The length of a pattern, front to back. */
export const patternSpan = (obstacles: readonly Obstacle[]) =>
  Math.max(...obstacles.map((o) => o.x + o.width)) - Math.min(...obstacles.map((o) => o.x));

const GAP_REACTION_CUT = RUNNER_V2.gap.reactionCut;

const gapCut = (time: number) => {
  const past = Math.max(0, time - SLACK_GONE_SECONDS);
  return past === Infinity ? 1 : past / (past + BEYOND_SECONDS);
};

/**
 * The clear run after a pattern: long enough to land the longest jump, see
 * the next pattern and act, at the current speed. Never shorter than that,
 * so a slide-only pattern can't come where a landing leaves no time to duck.
 */
export const minimumGap = (speed: number, time = 0) =>
  speed * (airtime(RUNNER.jumpSpeed) + REACTION_SECONDS - GAP_REACTION_CUT * gapCut(time)) + 40;

export const gapSlack = (time: number) =>
  time < HARDEST_SECONDS
    ? ease(0.5, 0.1, 0.1, time)
    : 0.1 * Math.max(0, 1 - pastHardest(time) / (SLACK_GONE_SECONDS - HARDEST_SECONDS));

const gapAfter = (state: RunnerState) =>
  minimumGap(state.speed, state.time) + state.speed * between(state, 0, gapSlack(state.time));

const DUCKS: readonly PatternKind[] = ["hang", "beam", "bar", "twin"];
/** The jump each pattern takes: the hop, the big jump, or none (a slide). */
const takeoffSpeed = (kind: PatternKind) =>
  DUCKS.includes(kind) ? 0 : kind === "rock" ? RUNNER.hopSpeed : RUNNER.jumpSpeed;

/**
 * The clear run between two patterns of a combo: time to come down from the
 * first (a slide needs none: a hop or jump cuts it short), react, and set up
 * the second (take off early enough for its jump, or start the slide).
 */
export const comboGap = (first: PatternKind, second: PatternKind, speed: number, time = 0) => {
  const landing = airtime(takeoffSpeed(first)) * 0.6;
  const setUp = DUCKS.includes(second) ? 0.1 : airtime(takeoffSpeed(second)) / 2;
  const reaction = ease(COMBO_REACTION_SECONDS, HARDEST_COMBO_REACTION_SECONDS, LEAST_COMBO_REACTION_SECONDS, time);
  return speed * (landing + reaction + setUp) + HIT_WIDTH;
};

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

const MAX_STEP_TRAVEL = 24;

export const stepRunner = (previous: RunnerState, dt: number): RunnerState => {
  if (previous.over) return previous;
  const pieces = Math.max(1, Math.ceil((runnerSpeed(previous.time + dt) * dt) / MAX_STEP_TRAVEL - 1e-9));
  let state = previous;
  for (let i = 0; i < pieces && !state.over; i++) state = stepOnce(state, dt / pieces);
  return state;
};

const stepOnce = (previous: RunnerState, dt: number): RunnerState => {
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
    const [kind, ...rest] = state.chain.length > 0 ? state.chain : patternsFor(state);
    const pattern = makePattern(state, kind, state.width + 10);
    obstacles.push(...pattern);
    state.chain = rest;
    state.nextIn = patternSpan(pattern) + (rest.length > 0 ? comboGap(kind, rest[0], state.speed, state.time) : gapAfter(state));
  }
  state.obstacles = obstacles;
  state.over = obstacles.some((obstacle) => hits(state, obstacle));
  state.score = Math.floor(state.distance / RUNNER.stride);
  return state;
};

export const PATTERN_KINDS: readonly PatternKind[] = ["rock", "tall", "wide", "double", "triple", "stair", "beam", "bar", "hang", "twin"];
export const isPatternKind = (value: string): value is PatternKind => (PATTERN_KINDS as readonly string[]).includes(value);

/**
 * A still board showing the given patterns, sized as they'd be `time`
 * seconds into a run. For screenshots in test builds only.
 */
export const previewRange = (width: number, kinds: readonly PatternKind[], time: number): RunnerState => {
  const state: RunnerState = { ...newRunner(width, 7), time, speed: runnerSpeed(time), nextIn: Infinity };
  let x = width * 0.25;
  const obstacles: Obstacle[] = [];
  for (const kind of kinds) {
    for (const choice of ["least", "most"] as const) {
      const pattern = makePattern(state, kind, x, choice);
      obstacles.push(...pattern);
      x += patternSpan(pattern) + 50;
    }
  }
  return { ...state, obstacles };
};

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

// Flap: tap to flap through the gaps in the pipes. Ten points a gap, and a
// point a second for staying alive. Pure: each step takes a state and returns
// the next. y grows downward, as on screen.
import { between, random } from "./random";

export const FLAPPY = {
  /** The bird's x, as a share of the board's width. */
  xShare: 0.28,
  radius: 13,
  gravity: 1500,
  flapSpeed: 470,
  pipeWidth: 62,
  /** Space between one pipe and the next. */
  spacing: 230,
  groundHeight: 56,
  pointsPerGap: 10,
  startSpeed: 150,
  topSpeed: 200,
  widestGap: 180,
  narrowestGap: 150,
  /** The score by which about two thirds of the speed-up and narrowing is done. */
  rampScore: 250,
  closestSpacing: 180,
  farthestSpacing: 300,
  varietyScore: 400,
  leastJumpShare: 0.6,
  hardFromScore: 1000,
  levelScore: 1000,
  hardTopSpeed: 228,
  floorGap: 120,
  hardClosestSpacing: 230,
  widestSpacing: 380,
  spacingTail: 2.5,
  hardReachShare: 1.6,
  tighteningLevels: 8,
  hardJumpShare: 0.25,
} as const;

export type Pipe = { id: number; x: number; gapTop: number; gapHeight: number; passed: boolean };

export type FlappyState = {
  width: number;
  height: number;
  over: boolean;
  time: number;
  gaps: number;
  score: number;
  y: number;
  vy: number;
  pipes: Pipe[];
  /** Distance until the next pipe appears at the right edge. */
  nextIn: number;
  space: number;
  nextId: number;
  seed: number;
};

export const newFlappy = (width: number, height: number, seed: number): FlappyState => ({
  width,
  height,
  over: false,
  time: 0,
  gaps: 0,
  score: 0,
  y: height * 0.42,
  vy: 0,
  pipes: [],
  nextIn: width * 0.55,
  space: FLAPPY.spacing,
  nextId: 1,
  seed,
});

export const birdX = (state: FlappyState) => state.width * FLAPPY.xShare;

export const flap = (state: FlappyState): FlappyState =>
  state.over ? state : { ...state, vy: -FLAPPY.flapSpeed };

/** From 0 at the start towards 1, levelling off so a high score stays playable. */
const ramp = (score: number) => 1 - Math.exp(-Math.max(0, score) / FLAPPY.rampScore);

export const flapLevel = (score: number) =>
  score < FLAPPY.hardFromScore ? 0 : 1 + Math.floor((score - FLAPPY.hardFromScore) / FLAPPY.levelScore);

export const tightening = (score: number) => flapLevel(score) / (flapLevel(score) + FLAPPY.tighteningLevels);

export const pipeSpeed = (score: number) =>
  FLAPPY.startSpeed + (FLAPPY.topSpeed - FLAPPY.startSpeed) * ramp(score) + (FLAPPY.hardTopSpeed - FLAPPY.topSpeed) * tightening(score);
export const gapHeight = (score: number) =>
  FLAPPY.widestGap - (FLAPPY.widestGap - FLAPPY.narrowestGap) * ramp(score) - (FLAPPY.narrowestGap - FLAPPY.floorGap) * tightening(score);

const flappyScore = (gaps: number, time: number) => gaps * FLAPPY.pointsPerGap + Math.floor(time);

/**
 * How far a gap may sit above the one before it. Between two pipes the bird
 * can climb about 320, so this leaves room to react; falling is easy.
 */
export const MAX_GAP_RISE = 240;
export const MAX_GAP_DROP = 320;

export const variety = (score: number) => 1 - Math.exp(-Math.max(0, score) / FLAPPY.varietyScore);

export const reachShare = (space: number, speed: number = FLAPPY.topSpeed, most = 1) =>
  Math.min(most, ((space - FLAPPY.pipeWidth) / (FLAPPY.spacing - FLAPPY.pipeWidth)) * (FLAPPY.topSpeed / Math.max(FLAPPY.topSpeed, speed)));

export const spacingRange = (score: number) => {
  const v = variety(score);
  const t = tightening(score);
  const low = FLAPPY.spacing - (FLAPPY.spacing - FLAPPY.closestSpacing) * v;
  const high = FLAPPY.spacing + (FLAPPY.farthestSpacing - FLAPPY.spacing) * v;
  return {
    low: low + (FLAPPY.hardClosestSpacing - low) * t,
    high: high + (FLAPPY.widestSpacing - high) * t,
    lean: 1 + FLAPPY.spacingTail * t,
  };
};

export const spacingAt = (score: number, roll: number) => {
  const { low, high, lean } = spacingRange(score);
  return low + (high - low) * roll ** (1 / lean);
};

const nextSpace = (state: FlappyState) => spacingAt(state.score, random(state));

const REACH_AHEAD = 50;

export const gapReach = (space: number, score: number) => {
  const reach = reachShare(space, pipeSpeed(score + REACH_AHEAD), 1 + (FLAPPY.hardReachShare - 1) * tightening(score));
  return { rise: MAX_GAP_RISE * reach, drop: MAX_GAP_DROP * reach };
};

export const leastJump = (score: number) =>
  FLAPPY.leastJumpShare * variety(score) + FLAPPY.hardJumpShare * tightening(score);

const nextGapTop = (state: FlappyState, gap: number) => {
  const top = 60;
  const bottom = Math.max(61, state.height - FLAPPY.groundHeight - 60 - gap);
  const previous = state.pipes.at(-1)?.gapTop;
  if (previous === undefined) return between(state, top, bottom);
  const most = gapReach(state.space, state.score);
  const rise = Math.max(0, Math.min(previous - top, most.rise));
  const drop = Math.max(0, Math.min(bottom - previous, most.drop));
  const up = random(state) * (rise + drop) < rise;
  const jump = (up ? rise : drop) * between(state, leastJump(state.score), 1);
  return Math.max(top, Math.min(bottom, previous + (up ? -jump : jump)));
};

const newPipe = (state: FlappyState): Pipe => {
  const gap = gapHeight(state.score);
  const gapTop = nextGapTop(state, gap);
  return { id: state.nextId++, x: state.width + 4 + Math.min(0, state.nextIn), gapTop, gapHeight: gap, passed: false };
};

const hitsPipe = (state: FlappyState, pipe: Pipe) => {
  const x = birdX(state);
  const r = FLAPPY.radius - 2;
  if (x + r < pipe.x || x - r > pipe.x + FLAPPY.pipeWidth) return false;
  return state.y - r < pipe.gapTop || state.y + r > pipe.gapTop + pipe.gapHeight;
};

export const flappyAt = (width: number, height: number, seed: number, score: number): FlappyState => {
  const gaps = Math.floor(score / (FLAPPY.pointsPerGap + 1));
  const time = score - gaps * FLAPPY.pointsPerGap;
  return { ...newFlappy(width, height, seed), gaps, time, score };
};

export const stepFlappy = (previous: FlappyState, dt: number): FlappyState => {
  if (previous.over) return previous;
  const state: FlappyState = { ...previous };
  state.time += dt;
  state.vy += FLAPPY.gravity * dt;
  state.y += state.vy * dt;
  if (state.y < FLAPPY.radius) {
    state.y = FLAPPY.radius;
    state.vy = Math.max(0, state.vy);
  }

  const travelled = pipeSpeed(state.score) * dt;
  const x = birdX(state);
  const pipes = previous.pipes
    .map((pipe) => ({ ...pipe, x: pipe.x - travelled }))
    .filter((pipe) => pipe.x + FLAPPY.pipeWidth > -4);
  for (const pipe of pipes) {
    if (!pipe.passed && pipe.x + FLAPPY.pipeWidth < x - FLAPPY.radius) {
      pipe.passed = true;
      state.gaps += 1;
    }
  }
  state.nextIn -= travelled;
  if (state.nextIn <= 0) {
    pipes.push(newPipe(state));
    state.space = nextSpace(state);
    state.nextIn += state.space;
  }
  state.pipes = pipes;

  const hitGround = state.y + FLAPPY.radius >= state.height - FLAPPY.groundHeight;
  state.over = hitGround || pipes.some((pipe) => hitsPipe(state, pipe));
  if (hitGround) state.y = state.height - FLAPPY.groundHeight - FLAPPY.radius;
  state.score = flappyScore(state.gaps, state.time);
  return state;
};

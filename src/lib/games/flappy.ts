// Flap: tap to flap through the gaps in the pipes. Ten points a gap, and a
// point a second for staying alive. Pure: each step takes a state and returns
// the next. y grows downward, as on screen.
import { between } from "./random";

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
  nextId: 1,
  seed,
});

export const birdX = (state: FlappyState) => state.width * FLAPPY.xShare;

export const flap = (state: FlappyState): FlappyState =>
  state.over ? state : { ...state, vy: -FLAPPY.flapSpeed };

/** From 0 at the start towards 1, levelling off so a high score stays playable. */
const ramp = (score: number) => 1 - Math.exp(-Math.max(0, score) / FLAPPY.rampScore);
export const pipeSpeed = (score: number) => FLAPPY.startSpeed + (FLAPPY.topSpeed - FLAPPY.startSpeed) * ramp(score);
export const gapHeight = (score: number) => FLAPPY.widestGap - (FLAPPY.widestGap - FLAPPY.narrowestGap) * ramp(score);

const flappyScore = (gaps: number, time: number) => gaps * FLAPPY.pointsPerGap + Math.floor(time);

/**
 * How far a gap may sit above the one before it. Between two pipes the bird
 * can climb about 320, so this leaves room to react; falling is easy.
 */
export const MAX_GAP_RISE = 240;
export const MAX_GAP_DROP = 320;

const newPipe = (state: FlappyState): Pipe => {
  const gap = gapHeight(state.score);
  const floor = state.height - FLAPPY.groundHeight;
  const previous = state.pipes.at(-1)?.gapTop;
  let low = 60;
  let high = Math.max(61, floor - 60 - gap);
  if (previous !== undefined) {
    low = Math.max(low, previous - MAX_GAP_RISE);
    high = Math.max(low + 1, Math.min(high, previous + MAX_GAP_DROP));
  }
  const gapTop = between(state, low, high);
  return { id: state.nextId++, x: state.width + 4, gapTop, gapHeight: gap, passed: false };
};

const hitsPipe = (state: FlappyState, pipe: Pipe) => {
  const x = birdX(state);
  const r = FLAPPY.radius - 2;
  if (x + r < pipe.x || x - r > pipe.x + FLAPPY.pipeWidth) return false;
  return state.y - r < pipe.gapTop || state.y + r > pipe.gapTop + pipe.gapHeight;
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
    state.nextIn += FLAPPY.spacing;
  }
  state.pipes = pipes;

  const hitGround = state.y + FLAPPY.radius >= state.height - FLAPPY.groundHeight;
  state.over = hitGround || pipes.some((pipe) => hitsPipe(state, pipe));
  if (hitGround) state.y = state.height - FLAPPY.groundHeight - FLAPPY.radius;
  state.score = flappyScore(state.gaps, state.time);
  return state;
};

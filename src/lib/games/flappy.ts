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

export const pipeSpeed = (time: number) => Math.min(240, 150 + time * 1.5);
/** The gap narrows from 180 to 130 over the first forty seconds. */
export const gapHeight = (time: number) => Math.max(130, 180 - time * 1.25);

export const flappyScore = (gaps: number, time: number) => gaps * FLAPPY.pointsPerGap + Math.floor(time);

const newPipe = (state: FlappyState): Pipe => {
  const gap = gapHeight(state.time);
  const floor = state.height - FLAPPY.groundHeight;
  const gapTop = between(state, 60, Math.max(61, floor - 60 - gap));
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

  const travelled = pipeSpeed(state.time) * dt;
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

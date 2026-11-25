// Flap: tap to flap through the gaps in the pipes. Ten points a gap, and a
// point a second for staying alive. Pure: each step takes a state and returns
// the next. y grows downward, as on screen.
import { FLAPPY_V2 } from "./flappyTuning";
import { blend } from "./glider";
import { between, random } from "./random";

export const FLAPPY = {
  /** The bird's x, as a share of the board's width. */
  xShare: 0.28,
  radius: 13,
  gravity: 1500,
  flapSpeed: 470,
  pipeWidth: 62,
  groundHeight: 56,
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
  pipeShadeSince: number;
  skySince: number;
};

const LONG_AGO = -1e9;

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
  pipeShadeSince: LONG_AGO,
  skySince: LONG_AGO,
});

export const birdX = (state: FlappyState) => state.width * FLAPPY.xShare;

export const flap = (state: FlappyState): FlappyState =>
  state.over ? state : { ...state, vy: -FLAPPY.flapSpeed };

export const pipeSpeed = (pipes: number) =>
  Math.min(FLAPPY_V2.topSpeed, FLAPPY_V2.startSpeed + FLAPPY_V2.speedPerPipe * Math.max(0, pipes));

export const gapHeight = (pipes: number) =>
  Math.max(FLAPPY_V2.minGap, FLAPPY_V2.startGap - FLAPPY_V2.gapShrinkPerPipe * Math.max(0, pipes));

export const flappyScore = (pipes: number) => pipes * FLAPPY_V2.pointsPerPipe;

/**
 * How far a gap may sit above the one before it. Between two pipes the bird
 * can climb about 320, so this leaves room to react; falling is easy.
 */
export const MAX_GAP_RISE = 240;
export const MAX_GAP_DROP = 320;

const reachShare = (speed: number) =>
  Math.min(1, (FLAPPY_V2.spacing - FLAPPY.pipeWidth) / speed / FLAPPY_V2.reachSeconds);

export const gapReach = (pipes: number) => {
  const reach = reachShare(pipeSpeed(pipes + 1));
  return { rise: MAX_GAP_RISE * reach, drop: MAX_GAP_DROP * reach };
};

export const leastJump = (pipes: number) =>
  FLAPPY_V2.mostJumpShare * (1 - Math.exp(-Math.max(0, pipes) / FLAPPY_V2.jumpVarietyPipes));

const nextGapTop = (state: FlappyState, gap: number) => {
  const top = 60;
  const bottom = Math.max(61, state.height - FLAPPY.groundHeight - 60 - gap);
  const previous = state.pipes.at(-1)?.gapTop;
  if (previous === undefined) return between(state, top, bottom);
  const most = gapReach(state.gaps);
  const rise = Math.max(0, Math.min(previous - top, most.rise));
  const drop = Math.max(0, Math.min(bottom - previous, most.drop));
  const up = random(state) * (rise + drop) < rise;
  const jump = (up ? rise : drop) * between(state, leastJump(state.gaps), 1);
  return Math.max(top, Math.min(bottom, previous + (up ? -jump : jump)));
};

const newPipe = (state: FlappyState): Pipe => {
  const gap = gapHeight(state.gaps);
  const gapTop = nextGapTop(state, gap);
  return { id: state.nextId++, x: state.width + 4 + Math.min(0, state.nextIn), gapTop, gapHeight: gap, passed: false };
};

const hitsPipe = (state: FlappyState, pipe: Pipe) => {
  const x = birdX(state);
  const r = FLAPPY.radius - 2;
  if (x + r < pipe.x || x - r > pipe.x + FLAPPY.pipeWidth) return false;
  return state.y - r < pipe.gapTop || state.y + r > pipe.gapTop + pipe.gapHeight;
};

export const pipeShadeStep = (pipes: number) =>
  Math.min(FLAPPY_V2.pipeShadeSteps, Math.floor(Math.max(0, pipes) / FLAPPY_V2.pipeShadeEvery));

export const skyStep = (pipes: number) => Math.min(FLAPPY_V2.skySteps, Math.floor(Math.max(0, pipes) / FLAPPY_V2.skyEvery));

const fading = (step: number, since: number, time: number) =>
  step - 1 + Math.min(1, Math.max(0, (time - since) / FLAPPY_V2.fadeSeconds));

export const shades = (state: Pick<FlappyState, "gaps" | "time" | "pipeShadeSince" | "skySince">) => {
  const pipe = pipeShadeStep(state.gaps);
  const sky = skyStep(state.gaps);
  const skyShare = sky === 0 ? 0 : fading(sky, state.skySince, state.time) / FLAPPY_V2.skySteps;
  return {
    pipe: pipe === 0 ? 0 : fading(pipe, state.pipeShadeSince, state.time) / FLAPPY_V2.pipeShadeSteps,
    sky: skyShare,
    ground: skyShare,
    stars: sky >= FLAPPY_V2.starsFromSkyStep,
  };
};

export const skyStops = (colours: readonly string[]) =>
  FLAPPY_V2.skyStopsAt.map((at, i) => [at, colours[Math.min(i, colours.length - 1)]] as const);

export const pipeRim = (body: string, light: string) => blend(body, light, FLAPPY_V2.rimLift);

export const flappyAt = (width: number, height: number, seed: number, pipes: number): FlappyState => {
  const gaps = Math.max(0, Math.floor(pipes));
  const time = (gaps * FLAPPY_V2.spacing) / pipeSpeed(gaps);
  return { ...newFlappy(width, height, seed), gaps, time, score: flappyScore(gaps) };
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

  const travelled = pipeSpeed(state.gaps) * dt;
  const x = birdX(state);
  const pipes = previous.pipes
    .map((pipe) => ({ ...pipe, x: pipe.x - travelled }))
    .filter((pipe) => pipe.x + FLAPPY.pipeWidth > -4);
  for (const pipe of pipes) {
    if (!pipe.passed && pipe.x + FLAPPY.pipeWidth < x - FLAPPY.radius) {
      pipe.passed = true;
      state.gaps += 1;
      if (pipeShadeStep(state.gaps) > pipeShadeStep(state.gaps - 1)) state.pipeShadeSince = state.time;
      if (skyStep(state.gaps) > skyStep(state.gaps - 1)) state.skySince = state.time;
    }
  }
  state.nextIn -= travelled;
  if (state.nextIn <= 0) {
    pipes.push(newPipe(state));
    state.nextIn += FLAPPY_V2.spacing;
  }
  state.pipes = pipes;

  const hitGround = state.y + FLAPPY.radius >= state.height - FLAPPY.groundHeight;
  state.over = hitGround || pipes.some((pipe) => hitsPipe(state, pipe));
  if (hitGround) state.y = state.height - FLAPPY.groundHeight - FLAPPY.radius;
  state.score = flappyScore(state.gaps);
  return state;
};

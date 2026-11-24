// Swoop: hold to make the bird heavy and dive into the valleys, let go to
// fly off the next slope. Reach the end of each world before the sun goes
// down. Pure: each step takes a state and returns the next.
//
// Unlike the other games, y grows upward here: it's the height above the
// bottom of the world. The scene turns it over when it draws.
import { random } from "./random";

export const GLIDER = {
  /** Gravity while light (let go) and heavy (held), in world units a second squared. */
  lightGravity: 450,
  heavyGravity: 1800,
  /** Slowing on the ground and in the air, times the speed squared. */
  groundDrag: 0.00012,
  airDrag: 0.00006,
  /** The bird always waddles on at least this, so it can't get stuck in a valley. */
  minSpeed: 120,
  maxSpeed: 1500,
  startSpeed: 220,
  /** The bird's size, for drawing. Its body sits on its lowest point. */
  radius: 16,
  /** Each world starts and ends on a hilltop this high. */
  peak: 280,
  floor: 20,
  ceiling: 560,
  /** Steepest slope a hill may have, rise over run. */
  maxSlope: 1.55,
  /** In the air at least this long before a landing can be perfect. */
  perfectAir: 0.3,
  /** A landing this much faster than the ground's own slope would give. */
  perfectBoost: 0.06,
  /** A rough landing keeps this share of its speed along the ground. */
  roughKeep: 0.85,
  /** Landing on an upslope while heavy keeps this share on top. */
  heavyUpslopeKeep: 0.8,
  /** Seconds of daylight a perfect landing and a long flight give back. */
  perfectTime: 0.8,
  flightTime: 0.6,
  /** A flight at least this long is a long one. */
  longFlight: 1.4,
  perfectPoints: 20,
  flightPoints: 30,
  /** The longest perfect streak that still raises its points. */
  maxStreak: 5,
  worldPoints: 250,
  /** Points for each second of daylight left at the end of a world. */
  daylightPoints: 10,
  /** Ten world units are a metre: a point. */
  unitsPerPoint: 10,
  popupSeconds: 1.3,
} as const;

/** The camera: what part of the world is on screen. */
export const VIEW = {
  /** World units shown top to bottom at the closest zoom. */
  height: 440,
  /** At least this many shown across, on a narrow board. */
  minWidth: 640,
  /** The bird sits this share of the view in from the left. */
  lead: 0.3,
  /** Room kept above the bird and below the lowest ground in view. */
  margin: 60,
  minZoom: 0.42,
  /** How quickly the camera catches up, each second. */
  rate: 5,
} as const;

/** How hard world n is. Every world is longer, steeper, bumpier and has a shorter day. */
type WorldRules = {
  world: number;
  /** About how long the world is, in world units. */
  length: number;
  /** Seconds from sunrise to night. */
  day: number;
  /** The most daylight good flying can win back in one world. */
  bonusCap: number;
  /** The usual distance from a hilltop to the next valley. */
  span: number;
  /** How much shorter the climb out of a valley is than the run into it. */
  squeeze: number;
  /** The usual drop from a hilltop to a valley. */
  drop: number;
  /** How far spans and drops may stray from the usual, as a share. */
  bumpiness: number;
  /** The widest angle, in radians, between the bird and the slope for a perfect landing. */
  tolerance: number;
};

const degrees = (d: number) => (d * Math.PI) / 180;

export const worldRules = (world: number): WorldRules => {
  const n = Math.max(1, Math.floor(world)) - 1;
  const day = Math.max(18, 34 - 2 * n);
  return {
    world: n + 1,
    length: 8000 + 1200 * n,
    day,
    bonusCap: day * 0.35,
    span: Math.max(200, 330 - 15 * n),
    squeeze: Math.min(0.35, 0.04 * n),
    drop: Math.min(360, 200 + 20 * n),
    bumpiness: Math.min(0.5, 0.12 + 0.05 * n),
    tolerance: degrees(Math.max(10, 30 - 2 * n)),
  };
};

/** A hilltop or a valley floor. The ground between two is a smooth half wave. */
export type HillPoint = { x: number; y: number };

const worldSeed = (seed: number, world: number) => (seed ^ Math.imul(world, 0x9e3779b1)) | 0;

/**
 * One world's ground, from its first hilltop at `start` to the last, both
 * at the standard height, so worlds join without a seam. The same seed and
 * world always give the same hills.
 */
export const worldHills = (seed: number, world: number, start: number): HillPoint[] => {
  const rules = worldRules(world);
  const rng = { seed: worldSeed(seed, world) };
  const vary = (value: number) => value * (1 + (random(rng) * 2 - 1) * rules.bumpiness);
  const points: HillPoint[] = [{ x: start, y: GLIDER.peak }];
  let x: number = start;
  let y: number = GLIDER.peak;
  // Valley and hilltop pairs until the world is long enough; the pair that
  // gets there climbs back to the standard height.
  for (let last = false; !last; ) {
    // A run down into a valley, then a climb out of it, shorter by the squeeze.
    const down = Math.max(120, vary(rules.span));
    const up = Math.max(100, vary(rules.span) * (1 - rules.squeeze));
    last = x + down + up >= start + rules.length;
    let valley = Math.max(GLIDER.floor, Math.min(y - 40, y - vary(rules.drop)));
    if (last) valley = Math.min(valley, GLIDER.peak - 60);
    x += Math.max(down, slopeRun(y - valley));
    y = valley;
    points.push({ x, y });
    const top = last ? GLIDER.peak : Math.min(GLIDER.ceiling, Math.max(y + 40, y + vary(rules.drop)));
    x += Math.max(up, slopeRun(top - y));
    y = top;
    points.push({ x, y });
  }
  return points;
};

/** The shortest run a half wave of this height can have and stay under the steepest slope. */
const slopeRun = (rise: number) => (Math.abs(rise) * Math.PI) / (2 * GLIDER.maxSlope);

/** The index of the point at or before x: the start of x's half wave. */
const spanAt = (points: readonly HillPoint[], x: number) => {
  let low = 0;
  let high = points.length - 2;
  if (high < 0 || x <= points[0].x) return 0;
  if (x >= points[high + 1].x) return high;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (points[mid].x <= x) low = mid;
    else high = mid - 1;
  }
  return low;
};

type Ground = { y: number; slope: number; curve: number };

/**
 * The ground at x: its height, its slope (rise over run) and how sharply it
 * bends (the second derivative). Flat beyond the first and last points.
 */
export const groundAt = (points: readonly HillPoint[], x: number): Ground => {
  if (points.length === 0) return { y: 0, slope: 0, curve: 0 };
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1 || x <= first.x) return { y: first.y, slope: 0, curve: 0 };
  if (x >= last.x) return { y: last.y, slope: 0, curve: 0 };
  const i = spanAt(points, x);
  const a = points[i];
  const b = points[i + 1];
  const run = b.x - a.x;
  const t = (x - a.x) / run;
  const rise = b.y - a.y;
  const w = Math.PI / run;
  return {
    y: a.y + (rise * (1 - Math.cos(Math.PI * t))) / 2,
    slope: (rise / 2) * w * Math.sin(Math.PI * t),
    curve: (rise / 2) * w * w * Math.cos(Math.PI * t),
  };
};

/** The lowest ground between two xs: valleys are the low points of the waves. */
export const lowestGround = (points: readonly HillPoint[], from: number, to: number): number => {
  let low = Math.min(groundAt(points, from).y, groundAt(points, to).y);
  for (let i = spanAt(points, from) + 1; i < points.length && points[i].x < to; i++) low = Math.min(low, points[i].y);
  return low;
};

/** A landing this much wider than the perfect one is rough. */
const ROUGH_MARGIN = degrees(25);

type Landing = "perfect" | "smooth" | "rough";

/**
 * Touching down: the speed the bird keeps along the ground, and how well it
 * landed. Coming down along a downslope keeps the speed (and a long enough
 * flight that lands perfectly gives a little more); coming down against the
 * slope, or onto an upslope while heavy, loses some.
 */
export const land = (
  vx: number,
  vy: number,
  slope: number,
  heavy: boolean,
  tolerance: number,
  airTime: number
): { speed: number; landing: Landing } => {
  const length = Math.hypot(1, slope);
  const along = (vx + vy * slope) / length;
  const into = (vx * slope - vy) / length;
  const angle = Math.atan2(Math.max(0, into), Math.abs(along));
  let speed = along;
  let landing: Landing = "smooth";
  if (angle <= tolerance && slope < -0.05 && airTime >= GLIDER.perfectAir) {
    landing = "perfect";
    speed *= 1 + GLIDER.perfectBoost;
  } else if (angle > tolerance + ROUGH_MARGIN) {
    landing = "rough";
    speed *= GLIDER.roughKeep;
    if (heavy && slope > 0) speed *= GLIDER.heavyUpslopeKeep;
  }
  return { speed: clampSpeed(speed), landing };
};

const clampSpeed = (speed: number) => Math.max(GLIDER.minSpeed, Math.min(GLIDER.maxSpeed, speed));

/**
 * Whether the ground falls away faster than the bird can follow it: on a
 * hilltop's curve, gravity can't bend the bird's path as sharply as the
 * ground bends, so it takes off.
 */
export const leavesGround = (ground: Ground, speed: number, gravity: number): boolean => {
  const length = Math.hypot(1, ground.slope);
  const bend = ground.curve / (length * length * length);
  return bend * speed * speed < -gravity / length;
};

export type Popup = { id: number; text: string; born: number; kind: "perfect" | "flight" | "world" | "rough" };

export type Camera = { x: number; y: number; zoom: number };

export type GliderState = {
  over: boolean;
  /** Why the run ended. */
  ended: "night" | null;
  /** Seconds since the run started. */
  time: number;
  score: number;
  seed: number;
  world: number;
  worldStart: number;
  worldEnd: number;
  /** This world's hills and the next one's, so the far side of the finish is drawn. */
  hills: HillPoint[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Speed along the ground while on it. */
  speed: number;
  grounded: boolean;
  /** Seconds in the air on this flight. */
  air: number;
  heavy: boolean;
  /** Seconds of daylight left in this world. */
  daylight: number;
  /** Daylight won back so far in this world. */
  regained: number;
  streak: number;
  bonus: number;
  perfects: number;
  popups: Popup[];
  nextPopup: number;
  camera: Camera;
  /** The board's width over its height, for the camera. */
  aspect: number;
};

const hillsFrom = (seed: number, world: number, start: number) => {
  const current = worldHills(seed, world, start);
  const end = current[current.length - 1].x;
  return { end, hills: [...current, ...worldHills(seed, world + 1, end).slice(1)] };
};

/** What the camera would show around the bird: a wider view when it flies high. */
export const viewSize = (aspect: number, zoom: number) => {
  const height = Math.max(VIEW.height, VIEW.minWidth / Math.max(0.1, aspect)) / zoom;
  return { width: height * aspect, height };
};

/** Where the camera wants to be: the bird in from the left, the valleys and the bird both in view. */
export const cameraTarget = (state: Pick<GliderState, "x" | "y" | "hills" | "aspect">): Camera => {
  const near = viewSize(state.aspect, 1);
  const from = state.x - near.width * VIEW.lead;
  const low = lowestGround(state.hills, from, from + near.width) - VIEW.margin;
  const needed = state.y + GLIDER.radius * 2 + VIEW.margin - low;
  const zoom = Math.max(VIEW.minZoom, Math.min(1, near.height / needed));
  const view = viewSize(state.aspect, zoom);
  // Low ground at the bottom, unless the bird is higher than the view reaches.
  const bottom = Math.max(low, state.y + GLIDER.radius * 2 + VIEW.margin - view.height);
  return { x: state.x - view.width * VIEW.lead, y: bottom, zoom };
};

const ease = (from: number, to: number, dt: number) => from + (to - from) * (1 - Math.exp(-VIEW.rate * dt));

/**
 * Moves the camera toward its target. Up, down and the zoom ease in; sideways
 * it keeps the bird exactly where it should be, so the bird never drifts.
 */
const followCamera = (
  camera: Camera,
  state: Pick<GliderState, "x" | "y" | "hills" | "aspect">,
  dt: number
): Camera => {
  const target = cameraTarget(state);
  const zoom = ease(camera.zoom, target.zoom, dt);
  const view = viewSize(state.aspect, zoom);
  // However fast the bird climbs or drops, it stays inside the view.
  const lowest = state.y + GLIDER.radius * 2 + VIEW.margin - view.height;
  const highest = state.y - VIEW.margin / 3;
  const y = Math.max(lowest, Math.min(highest, ease(camera.y, target.y, dt)));
  return { x: state.x - view.width * VIEW.lead, y, zoom };
};

export const newGlider = (seed: number, aspect = 2): GliderState => {
  const { end, hills } = hillsFrom(seed, 1, 0);
  const start = groundAt(hills, 0);
  const base = {
    x: 0,
    y: start.y,
    hills,
    aspect,
  };
  return {
    over: false,
    ended: null,
    time: 0,
    score: 0,
    seed,
    world: 1,
    worldStart: 0,
    worldEnd: end,
    ...base,
    vx: GLIDER.startSpeed,
    vy: 0,
    speed: GLIDER.startSpeed,
    grounded: true,
    air: 0,
    heavy: false,
    daylight: worldRules(1).day,
    regained: 0,
    streak: 0,
    bonus: 0,
    perfects: 0,
    popups: [],
    nextPopup: 1,
    camera: cameraTarget(base),
  };
};

/** Holding makes the bird heavy; letting go makes it light. */
export const hold = (state: GliderState, heavy: boolean): GliderState =>
  state.over || state.heavy === heavy ? state : { ...state, heavy };

export const resize = (state: GliderState, aspect: number): GliderState =>
  aspect > 0 && Math.abs(state.aspect - aspect) > 1e-3 ? { ...state, aspect } : state;

/** How far through the day it is, from 0 at sunrise to 1 at nightfall. */
export const dayProgress = (state: Pick<GliderState, "daylight" | "world">) =>
  Math.max(0, Math.min(1, 1 - state.daylight / worldRules(state.world).day));

/** How far through the world the bird is, from 0 to 1. */
export const worldProgress = (state: Pick<GliderState, "x" | "worldStart" | "worldEnd">) =>
  Math.max(0, Math.min(1, (state.x - state.worldStart) / (state.worldEnd - state.worldStart)));

export const gliderScore = (state: Pick<GliderState, "x" | "bonus">) =>
  Math.floor(Math.max(0, state.x) / GLIDER.unitsPerPoint) + state.bonus;

const popup = (state: GliderState, kind: Popup["kind"], text: string) => {
  state.popups = [...state.popups, { id: state.nextPopup, text, born: state.time, kind }];
  state.nextPopup += 1;
};

const regain = (state: GliderState, seconds: number) => {
  const rules = worldRules(state.world);
  const gained = Math.max(0, Math.min(seconds, rules.bonusCap - state.regained, rules.day - state.daylight));
  state.daylight += gained;
  state.regained += gained;
  return gained;
};

const touchDown = (state: GliderState, ground: Ground) => {
  const rules = worldRules(state.world);
  const { speed, landing } = land(state.vx, state.vy, ground.slope, state.heavy, rules.tolerance, state.air);
  const air = state.air;
  state.grounded = true;
  state.speed = speed;
  state.y = ground.y;
  state.air = 0;
  if (landing === "perfect") {
    state.streak = Math.min(GLIDER.maxStreak, state.streak + 1);
    state.perfects += 1;
    state.bonus += GLIDER.perfectPoints * state.streak;
    regain(state, GLIDER.perfectTime);
    popup(state, "perfect", state.streak > 1 ? `Perfect ×${state.streak}` : "Perfect!");
  } else if (landing === "rough") {
    state.streak = 0;
    popup(state, "rough", "Bump");
  }
  if (air >= GLIDER.longFlight && landing !== "rough") {
    state.bonus += GLIDER.flightPoints * Math.floor(air / 0.5);
    regain(state, GLIDER.flightTime);
    popup(state, "flight", `Big flight ${air.toFixed(1)}s`);
  }
};

const moveOnGround = (state: GliderState, dt: number) => {
  const gravity = state.heavy ? GLIDER.heavyGravity : GLIDER.lightGravity;
  const here = groundAt(state.hills, state.x);
  const length = Math.hypot(1, here.slope);
  const pull = (-gravity * here.slope) / length;
  state.speed = clampSpeed(state.speed + (pull - GLIDER.groundDrag * state.speed * state.speed) * dt);
  state.x += (state.speed / length) * dt;
  const there = groundAt(state.hills, state.x);
  const along = Math.hypot(1, there.slope);
  state.y = there.y;
  state.vx = state.speed / along;
  state.vy = (state.speed * there.slope) / along;
  if (leavesGround(there, state.speed, gravity)) {
    state.grounded = false;
    state.air = 0;
  }
};

const moveInAir = (state: GliderState, dt: number) => {
  const gravity = state.heavy ? GLIDER.heavyGravity : GLIDER.lightGravity;
  const speed = Math.hypot(state.vx, state.vy);
  const slow = GLIDER.airDrag * speed * dt;
  state.vx = Math.max(GLIDER.minSpeed * 0.8, state.vx - slow * state.vx);
  state.vy -= gravity * dt + slow * state.vy;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.air += dt;
  const ground = groundAt(state.hills, state.x);
  if (state.y <= ground.y) touchDown(state, ground);
};

const nextWorld = (state: GliderState) => {
  const rules = worldRules(state.world);
  const left = Math.max(0, state.daylight);
  const earned = GLIDER.worldPoints * rules.world + Math.round(left * GLIDER.daylightPoints);
  state.bonus += earned;
  state.world += 1;
  state.worldStart = state.worldEnd;
  const { end, hills } = hillsFrom(state.seed, state.world, state.worldStart);
  state.worldEnd = end;
  // The old world's ground stays under the bird until it's out of view.
  const behind = state.hills.filter((point) => point.x < state.worldStart);
  state.hills = [...behind.slice(-6), ...hills];
  state.daylight = worldRules(state.world).day;
  state.regained = 0;
  popup(state, "world", `World ${rules.world} done +${earned.toLocaleString()}`);
};

/** One step of the run. Steps longer than a 120th of a second are split. */
export const stepGlider = (previous: GliderState, dt: number): GliderState => {
  if (previous.over) return previous;
  const state: GliderState = { ...previous };
  const steps = Math.max(1, Math.ceil(dt * 120 - 1e-9));
  const slice = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.time += slice;
    if (state.grounded) moveOnGround(state, slice);
    else moveInAir(state, slice);
  }
  if (state.x >= state.worldEnd) nextWorld(state);
  state.daylight -= dt;
  state.popups = state.popups.filter((p) => state.time - p.born < GLIDER.popupSeconds);
  state.camera = followCamera(state.camera, state, dt);
  state.score = gliderScore(state);
  if (state.daylight <= 0) {
    state.daylight = 0;
    state.over = true;
    state.ended = "night";
  }
  return state;
};

/**
 * The farthest any run could get: past the world where even flying at top
 * speed all day, with every second of daylight won back, can't reach the
 * end. The server's score limit is set above what this allows.
 */
export const lastReachableWorld = () => {
  let world = 1;
  while (world < 1000) {
    const rules = worldRules(world);
    if (rules.length > GLIDER.maxSpeed * (rules.day + rules.bonusCap)) return world - 1;
    world += 1;
  }
  return world;
};

/** Points no run can beat, from the rules: every reachable world, at top speed, with every bonus. */
export const maxGliderScore = () => {
  let points = 0;
  for (let world = 1; world <= lastReachableWorld() + 1; world++) {
    const rules = worldRules(world);
    const seconds = rules.day + rules.bonusCap;
    // A world's hills run a little past its length; allow for a whole extra span.
    const distance = (rules.length + rules.span * 4) / GLIDER.unitsPerPoint;
    // A perfect landing needs a flight of its own first; a long flight's
    // points add up to no more than one for each half second in the air.
    const perfects = (seconds / GLIDER.perfectAir) * GLIDER.perfectPoints * GLIDER.maxStreak;
    const flights = (seconds / 0.5) * GLIDER.flightPoints;
    points += distance + perfects + flights + GLIDER.worldPoints * world + rules.day * GLIDER.daylightPoints;
  }
  return Math.ceil(points);
};

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** The colour part way between two "#rrggbb" colours. */
export const blend = (from: string, to: string, t: number): string => {
  const a = channels(from);
  const b = channels(to);
  const share = Math.max(0, Math.min(1, t));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * share).toString(16).padStart(2, "0")).join("")}`;
};

/** The colour at a point through a list of [where, colour] stops, in order. */
export const colourAt = (stops: readonly (readonly [number, string])[], at: number): string => {
  const next = stops.findIndex(([where]) => where >= at);
  if (next <= 0) return stops[next === 0 ? 0 : stops.length - 1][1];
  const [fromAt, from] = stops[next - 1];
  const [toAt, to] = stops[next];
  return blend(from, to, (at - fromAt) / (toAt - fromAt));
};

/**
 * A simple way to play: heavy whenever the ground below runs downhill. It
 * gets through the first world and no further, so it is what the tests
 * and the screenshots use.
 */
export const autoHold = (state: GliderState): boolean => groundAt(state.hills, state.x).slope < 0;

export const GLIDER_PREVIEWS = ["dive", "launch", "world", "night"] as const;
export type GliderPreview = (typeof GLIDER_PREVIEWS)[number];

export const isGliderPreview = (value: string): value is GliderPreview =>
  (GLIDER_PREVIEWS as readonly string[]).includes(value);

const previewDone: Record<GliderPreview, (state: GliderState, before: GliderState) => boolean> = {
  dive: (state) => state.grounded && state.heavy && state.speed > 650 && groundAt(state.hills, state.x).slope < -0.6,
  launch: (state, before) => before.grounded && !state.grounded && state.vy > 250,
  world: (state, before) => state.world > before.world,
  night: (state) => state.over,
};

/**
 * A still moment of a run played by `autoHold`, for screenshots: diving
 * into a valley, taking off, just past a world's finish, or nightfall.
 */
export const previewGlider = (kind: GliderPreview, aspect = 2): GliderState => {
  let state = newGlider(1, aspect);
  const done = previewDone[kind];
  for (let i = 0; i < 60 * 600; i++) {
    const before = hold(state, autoHold(state));
    state = stepGlider(before, 1 / 60);
    // A little after the moment, so the camera and the popups have caught up.
    if (done(state, before)) {
      if (kind === "night") return state;
      for (let j = 0; j < 12; j++) state = stepGlider(hold(state, kind === "dive"), 1 / 60);
      return state;
    }
  }
  return state;
};

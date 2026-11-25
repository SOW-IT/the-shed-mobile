// Swoop: hold to make the bird heavy and dive into the valleys, let go to
// fly off the next slope. Reach the end of each world before the sun goes
// down. Pure: each step takes a state and returns the next.
//
// Unlike the other games, y grows upward here: it's the height above the
// bottom of the world. The scene turns it over when it draws.
import { random } from "./random";
import { GLIDER_V2, ramp } from "./gliderTuning";

export const GLIDER = {
  /** Gravity while light (let go) and heavy (held), in world units a second squared. */
  lightGravity: 480,
  heavyGravity: 1850,
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
  maxSlope: 2.2,
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
  pointedWorlds: 10,
  /** Points for each second of daylight left at the end of a world. */
  daylightPoints: 10,
  /** Ten world units are a metre: a point. */
  unitsPerPoint: 10,
  popupSeconds: 1.3,
} as const;

/** The camera: what part of the world is on screen. */
export const VIEW = {
  width: 1000,
  /** The bird sits this share of the view in from the left. */
  lead: 0.3,
  /** Room kept above the bird and below the lowest ground in view. */
  margin: 60,
  footing: 20,
  minZoom: 0.09,
  /** How quickly the camera catches up, each second. */
  rate: 5,
  zoomRate: 2.5,
  window: 2,
  holdWide: 3,
  narrowing: 2,
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
  oddity: number;
  steepest: number;
  harsh: number;
};

const degrees = (d: number) => (d * Math.PI) / 180;

const V2 = GLIDER_V2;
export const HARDEST_WORLD = V2.hardestWorld;
export const FLOOR_DAY = V2.day.floorSeconds;

const wholeWorld = (world: number) => Math.max(1, Math.floor(world));

export const difficulty = (world: number) => V2.difficulty.a + V2.difficulty.b * wholeWorld(world);

const steps = (world: number) => difficulty(world) - difficulty(1);

export const harshness = (world: number) => steps(world) / steps(HARDEST_WORLD);

export const dayLength = (world: number) => {
  const left = Math.max(0, 1 - Math.log(wholeWorld(world)) / Math.log(V2.day.floorWorld));
  return Math.round((FLOOR_DAY + (V2.day.firstSeconds - FLOOR_DAY) * left ** V2.day.curve) * 10) / 10;
};

export const worldLength = (world: number) => {
  const n = wholeWorld(world) - 1;
  return Math.round((dayLength(world) * Math.min(ramp(V2.pace, n), ramp(V2.latePace, n))) / 100) * 100;
};

export const worldRules = (world: number): WorldRules => {
  const whole = wholeWorld(world);
  const n = steps(whole);
  const day = dayLength(whole);
  return {
    world: whole,
    length: worldLength(whole),
    day,
    bonusCap: day * 0.35,
    span: ramp(V2.span, n),
    squeeze: ramp(V2.squeeze, n),
    drop: ramp(V2.drop, n),
    bumpiness: ramp(V2.bumpiness, n),
    tolerance: degrees(ramp(V2.perfectLandingDegrees, n)),
    oddity: oddShapeShare(whole),
    steepest: Math.min(GLIDER.maxSlope, ramp(V2.steepest, n)),
    harsh: harshness(whole),
  };
};

/** A hilltop or a valley floor. The ground between two is a smooth half wave. */
export type HillPoint = { x: number; y: number };

const worldSeed = (seed: number, world: number) => (seed ^ Math.imul(world, 0x9e3779b1)) | 0;

export const HILL_SHAPES = ["plateau", "double", "ramp", "cliff", "uneven", "gorge", "drop", "wall", "jagged"] as const;
type HillShape = (typeof HILL_SHAPES)[number];
type ShapedStretch = { shape: HillShape; from: number; to: number };

export const FIRST_WORLD = Object.fromEntries(HILL_SHAPES.map((shape) => [shape, V2.features[shape].firstWorld])) as Record<HillShape, number>;

const EASY_SHAPES: readonly HillShape[] = ["ramp", "plateau"];

export const shapeChance = (shape: HillShape, world: number) => {
  const feature = V2.features[shape];
  if (wholeWorld(world) < feature.firstWorld) return 0;
  return ramp(feature.chance, difficulty(world) - difficulty(feature.firstWorld));
};

const oddShapeShare = (world: number) =>
  Math.min(V2.oddShapeLimit, HILL_SHAPES.reduce((sum, shape) => sum + shapeChance(shape, world), 0));

export const levelSwing = (world: number) => ramp(V2.levelSwing, steps(world));

type Knot = { x: number; level: number };

const levelKnots = (seed: number, world: number, start: number, length: number): Knot[] => {
  const swing = levelSwing(world);
  const rng = { seed: worldSeed(seed, world) ^ 0x5bd1e995 };
  const settled = start + length * V2.levelSettle;
  const knots: Knot[] = [{ x: start, level: 0 }];
  let up = random(rng) < 0.75;
  const wave = length * V2.levelWavelength;
  for (let x = start + wave; x < settled - wave / 2; x += wave) {
    const share = up ? V2.levelHigh + (1 - V2.levelHigh) * random(rng) : -V2.levelBelow * random(rng);
    knots.push({ x, level: swing * share });
    up = !up;
  }
  knots.push({ x: settled, level: 0 });
  return knots;
};

const levelAt = (knots: readonly Knot[], x: number) => {
  const next = knots.findIndex((knot) => knot.x >= x);
  if (next <= 0) return next === 0 ? knots[0].level : 0;
  const a = knots[next - 1];
  const b = knots[next];
  return a.level + ((b.level - a.level) * (1 - Math.cos((Math.PI * (x - a.x)) / (b.x - a.x)))) / 2;
};

const pickShape = (roll: number, world: number, hard = false): HillShape => {
  const weights = HILL_SHAPES.map((shape) => (hard && EASY_SHAPES.includes(shape) ? 0 : shapeChance(shape, world)));
  let left = roll * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < HILL_SHAPES.length; i++) {
    left -= weights[i];
    if (left < 0) return HILL_SHAPES[i];
  }
  return HILL_SHAPES[1];
};

const buildWorld = (seed: number, world: number, start: number) => {
  const rules = worldRules(world);
  const n = steps(rules.world);
  const rng = { seed: worldSeed(seed, world) };
  const vary = (value: number) => value * (1 + (random(rng) * 2 - 1) * rules.bumpiness);
  const points: HillPoint[] = [{ x: start, y: GLIDER.peak }];
  const shapes: ShapedStretch[] = [];
  let x: number = start;
  let y: number = GLIDER.peak;
  let steepDown = false;
  let previousShape: HillShape | null = null;
  let level = 0;
  const knots = levelKnots(seed, world, start, rules.length);
  const run = (rise: number) => Math.max(slopeRun(rise, rules.steepest), bendRun(rise));
  const flat = ramp(V2.landingZone, n);
  const room = Math.max(0, ramp(V2.featureRoom, n));
  const backToBack = ramp(V2.backToBackShare, n);
  const to = (nextX: number, nextY: number) => {
    const rise = nextY - y;
    const room = V2.levelShare * Math.abs(rise);
    const shift = rise === 0 ? 0 : Math.max(-room, Math.min(room, levelAt(knots, nextX) - level));
    x = rise === 0 ? nextX : Math.max(nextX, x + run(rise + shift));
    y = nextY;
    level += shift;
    points.push({ x, y: y + level });
  };
  const climb = (top: number, up: number, steps: number) => {
    const dip = Math.min(ramp(V2.jaggedDip, n), (top - y) / (steps + 1));
    const rise = (top - y + dip * (steps - 1)) / steps;
    for (let i = 0; i < steps; i++) {
      const crest = i === steps - 1 ? top : y + rise;
      to(x + Math.max(up / steps, run(crest - y)), crest);
      if (i < steps - 1) to(x + run(dip) * 1.1, y - dip);
    }
  };
  for (let last = false; !last; ) {
    const down = Math.max(120, vary(rules.span));
    const up = Math.max(100, vary(rules.span) * (1 - rules.squeeze));
    last = x + down + up >= start + rules.length && Math.abs(level) <= V2.levelLanding;
    const roomy = x + 3 * (down + up) < start + rules.length;
    const again: boolean = previousShape !== null && roomy && random(rng) < backToBack;
    const shape: HillShape | null = again
      ? pickShape(random(rng), rules.world, true)
      : roomy && rules.oddity > 0 && random(rng) < rules.oddity
        ? pickShape(random(rng), rules.world)
        : null;
    previousShape = shape;
    const from = x;
    const deep = ramp(V2.deepValley, n);
    const deepness = shape === "uneven" ? (random(rng) < 0.5 ? 0.45 : deep) : shape === "gorge" || shape === "drop" ? deep : 1;
    let valley = Math.max(GLIDER.floor - room, Math.min(y - 40, y - vary(rules.drop) * deepness));
    if (last) valley = Math.min(valley, GLIDER.peak - 60);
    const steep = steepDown || shape === "cliff" || shape === "gorge" || shape === "drop";
    steepDown = false;
    to(x + (steep ? run(y - valley) * 1.05 : Math.max(down, run(y - valley))), valley);
    if (shape === "cliff") to(x + down * 0.8 * flat, y);
    const tall = shape === "wall" ? ramp(V2.wallHeight, n) : shape === "drop" ? 0.45 : 1;
    const top = last ? GLIDER.peak : Math.min(GLIDER.ceiling + room, Math.max(y + 40, y + vary(rules.drop) * tall));
    if (shape === "jagged") climb(top, up, Math.floor(ramp(V2.jaggedSteps, n) + 1e-9));
    else if (shape === "gorge" || shape === "wall") to(x + run(top - y) * 1.02, top);
    else to(x + Math.max(shape === "ramp" ? up * 2.2 : up, run(top - y)), top);
    if (shape === "ramp") steepDown = true;
    if (shape === "plateau") to(x + up * 0.9 * flat, y);
    if (shape === "double") {
      const dip = Math.min(ramp(V2.doubleDip, n), (top - valley) * ramp(V2.doubleDipShare, n));
      const hump = Math.max(up * 0.6 * flat, run(dip), 90 * flat);
      to(x + hump, top - dip);
      to(x + hump, top);
    }
    if (shape) shapes.push({ shape, from, to: x });
  }
  return { points, shapes };
};

/**
 * One world's ground, from its first hilltop at `start` to the last, both
 * at the standard height, so worlds join without a seam. The same seed and
 * world always give the same hills.
 */
export const worldHills = (seed: number, world: number, start: number): HillPoint[] =>
  buildWorld(seed, world, start).points;

export const worldShapes = (seed: number, world: number, start: number): ShapedStretch[] =>
  buildWorld(seed, world, start).shapes;

/** The shortest run a half wave of this height can have and stay under the steepest slope. */
const slopeRun = (rise: number, steepest: number) => (Math.abs(rise) * Math.PI) / (2 * steepest);

const bendRun = (rise: number) => Math.sqrt((Math.abs(rise) * Math.PI * Math.PI) / (2 * V2.sharpestBend));

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

export type Camera = { x: number; y: number; zoom: number; zoomSpeed?: number; ySpeed?: number; span?: number; wideFor?: number };

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
  daySeen: number;
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
  const width = VIEW.width / zoom;
  return { width, height: width / Math.max(0.1, aspect) };
};

export const highestFlight = (highestGround: number = GLIDER.ceiling) => {
  const climb = GLIDER.maxSpeed * Math.sin(Math.atan(GLIDER.maxSlope));
  return highestGround + (climb * climb) / (2 * GLIDER.lightGravity);
};

type Framed = Pick<GliderState, "x" | "y" | "hills" | "aspect"> & Partial<Pick<GliderState, "vy" | "grounded">>;

const roomAbove = (state: Framed) => state.y + GLIDER.radius * 2 + VIEW.margin;

const footing = (state: Framed) => groundAt(state.hills, state.x).y - VIEW.footing;

export const WIDEST_BOARD = 2.3;

const steadyHeight = () => VIEW.width / WIDEST_BOARD;

const fitZoom = (state: Framed) =>
  Math.max(VIEW.minZoom, Math.min(1, steadyHeight() / (roomAbove(state) - footing(state))));

const highestGround = (points: readonly HillPoint[], from: number, to: number): number => {
  let high = Math.max(groundAt(points, from).y, groundAt(points, to).y);
  for (const point of points) if (point.x > from && point.x < to) high = Math.max(high, point.y);
  return high;
};

const flightTop = (state: Framed) => {
  const rising = state.grounded === false && (state.vy ?? 0) > 0 ? (state.vy ?? 0) ** 2 / (2 * GLIDER.lightGravity) : 0;
  return state.y + rising;
};

const lookWindow = (state: Framed) => {
  const from = state.x - VIEW.width * VIEW.lead;
  return { from, to: from + VIEW.width * VIEW.window };
};

/** Where the camera wants to be: the bird in from the left, the valleys and the bird both in view. */
export const cameraTarget = (state: Framed): Camera => {
  const { from, to } = lookWindow(state);
  const low = lowestGround(state.hills, from, to) - VIEW.margin;
  const high = Math.max(flightTop(state), highestGround(state.hills, from, to)) + GLIDER.radius * 2 + VIEW.margin;
  const zoom = Math.max(VIEW.minZoom, Math.min(1, steadyHeight() / (Math.max(high, roomAbove(state)) - low)));
  const view = viewSize(state.aspect, zoom);
  // Low ground at the bottom, unless the bird is higher than the view reaches.
  const bottom = Math.max(low, roomAbove(state) - view.height);
  return { x: state.x - view.width * VIEW.lead, y: bottom, zoom };
};

const settle = (value: number, speed: number, target: number, rate: number, dt: number) => {
  const off = value - target;
  const lean = speed + rate * off;
  const fade = Math.exp(-rate * dt);
  return { value: target + (off + lean * dt) * fade, speed: (speed - rate * lean * dt) * fade };
};

/**
 * Moves the camera toward its target. Up, down and the zoom ease in; sideways
 * it keeps the bird exactly where it should be, so the bird never drifts.
 */
const followCamera = (camera: Camera, state: Framed, dt: number): Camera => {
  const target = cameraTarget(state);
  const needed = steadyHeight() / target.zoom;
  const before = camera.span ?? needed;
  const wideFor = needed >= before ? 0 : (camera.wideFor ?? 0) + dt;
  const span =
    needed >= before || wideFor < VIEW.holdWide ? Math.max(needed, before) : needed + (before - needed) * Math.exp(-dt / VIEW.narrowing);
  const wanted = Math.max(VIEW.minZoom, Math.min(1, steadyHeight() / span));
  const eased = settle(Math.log(camera.zoom), camera.zoomSpeed ?? 0, Math.log(wanted), VIEW.zoomRate, dt);
  const fit = fitZoom(state);
  const zoom = Math.min(Math.exp(eased.value), fit);
  const zoomSpeed = zoom < Math.exp(eased.value) ? Math.min(0, eased.speed) : eased.speed;
  const view = viewSize(state.aspect, zoom);
  const goal = Math.max(Math.min(target.y, footing(state)), roomAbove(state) - view.height);
  const rise = settle(camera.y, camera.ySpeed ?? 0, goal, VIEW.rate, dt);
  // However fast the bird climbs or drops, it stays inside the view.
  const lowest = roomAbove(state) - view.height;
  const highest = footing(state);
  const y = Math.max(lowest, Math.min(highest, rise.value));
  return { x: state.x - view.width * VIEW.lead, y, zoom, zoomSpeed, ySpeed: y === rise.value ? rise.speed : 0, span, wideFor };
};

export const newGlider = (seed: number, aspect = 2, world = 1): GliderState => {
  const { end, hills } = hillsFrom(seed, world, 0);
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
    world,
    worldStart: 0,
    worldEnd: end,
    ...base,
    vx: GLIDER.startSpeed,
    vy: 0,
    speed: GLIDER.startSpeed,
    grounded: true,
    air: 0,
    heavy: false,
    daylight: worldRules(world).day,
    daySeen: 0,
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

/** A finished run stays the very same state, so it's never taken for a new finished run. */
export const resize = (state: GliderState, aspect: number): GliderState =>
  !state.over && aspect > 0 && Math.abs(state.aspect - aspect) > 1e-3 ? { ...state, aspect } : state;

/** How far through the day it is, from 0 at sunrise to 1 at nightfall. */
export const dayProgress = (state: Pick<GliderState, "daylight" | "world">) =>
  Math.max(0, Math.min(1, 1 - state.daylight / worldRules(state.world).day));

const PARALLAX = { far: 0.04, near: 0.09 } as const;

export const parallaxShift = (cameraX: number, layer: keyof typeof PARALLAX) => cameraX * PARALLAX[layer];

export const parallaxAnchor = (state: Pick<GliderState, "x">) => state.x - VIEW.width * VIEW.lead;

export const farHillTiles = (shift: number, width: number, gap: number) => {
  const first = Math.floor(shift / gap) - 1;
  return Array.from({ length: Math.ceil(width / gap) + 3 }, (_, i) => ({
    tile: first + i,
    left: (first + i) * gap - shift,
    stagger: (((first + i) % 3) + 3) % 3,
  }));
};

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

export const worldBonus = (world: number) => GLIDER.worldPoints * Math.min(world, GLIDER.pointedWorlds);

const nextWorld = (state: GliderState) => {
  const rules = worldRules(state.world);
  const left = Math.max(0, state.daylight);
  const earned = worldBonus(rules.world) + Math.round(left * GLIDER.daylightPoints);
  state.bonus += earned;
  state.world += 1;
  state.worldStart = state.worldEnd;
  const { end, hills } = hillsFrom(state.seed, state.world, state.worldStart);
  state.worldEnd = end;
  // The old world's ground stays under the bird until it's out of view.
  const behind = state.hills.filter((point) => point.x < state.worldStart);
  state.hills = [...behind.slice(-6), ...hills];
  state.daylight = worldRules(state.world).day;
  state.daySeen = 0;
  state.regained = 0;
  popup(state, "world", `Day ${rules.world} done +${earned.toLocaleString()}`);
};

/** The longest piece a step is moved in. */
const SUBSTEP = 1 / 120;

/**
 * One step of the run, moved in pieces no longer than SUBSTEP. Daylight runs
 * down piece by piece, and a piece stops at sunset, so reaching the flag
 * counts only when it happens before night falls.
 */
export const stepGlider = (previous: GliderState, dt: number): GliderState => {
  if (previous.over) return previous;
  const state: GliderState = { ...previous };
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-9));
  const slice = dt / steps;
  let left = dt;
  while (left > 1e-9 && !state.over) {
    const piece = Math.min(slice, left, state.daylight);
    state.time += piece;
    if (state.grounded) moveOnGround(state, piece);
    else moveInAir(state, piece);
    state.daylight -= piece;
    left -= piece;
    if (state.x >= state.worldEnd) nextWorld(state);
    else if (state.daylight <= 1e-9) {
      state.daylight = 0;
      state.over = true;
      state.ended = "night";
    }
  }
  state.popups = state.popups.filter((p) => state.time - p.born < GLIDER.popupSeconds);
  state.camera = followCamera(state.camera, state, dt);
  state.daySeen = Math.max(state.daySeen, dayProgress(state));
  state.score = gliderScore(state);
  return state;
};

export const maxWorldScore = (world: number) => {
  const rules = worldRules(world);
  const seconds = rules.day + rules.bonusCap;
  const distance = (rules.length + rules.span * 4) / GLIDER.unitsPerPoint;
  const perfects = (seconds / GLIDER.perfectAir) * GLIDER.perfectPoints * GLIDER.maxStreak;
  const flights = (seconds / 0.5) * GLIDER.flightPoints;
  return Math.ceil(distance + perfects + flights + worldBonus(world) + rules.day * GLIDER.daylightPoints);
};

export const maxGliderScore = (worlds: number) =>
  Array.from({ length: worlds }, (_, i) => maxWorldScore(i + 1)).reduce((sum, points) => sum + points, 0);

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

export const GLIDER_PREVIEWS = ["dive", "launch", "high", "world", "world3", "world6", "night"] as const;
export type GliderPreview = (typeof GLIDER_PREVIEWS)[number];

export const isGliderPreview = (value: string): value is GliderPreview =>
  (GLIDER_PREVIEWS as readonly string[]).includes(value);

const previewDone: Record<GliderPreview, (state: GliderState, before: GliderState) => boolean> = {
  dive: (state) => state.grounded && state.heavy && state.speed > 650 && groundAt(state.hills, state.x).slope < -0.4,
  launch: (state, before) => before.grounded && !state.grounded && state.vy > 250,
  high: (state, before) => before.vy > 0 && state.vy <= 0,
  world: (state, before) => state.world > before.world,
  world3: (state) => state.time > 4,
  world6: (state) => state.time > 4,
  night: (state) => state.over,
};

const BIG_THROW = { vx: 800, vy: 900 } as const;

/**
 * A still moment of a run played by `autoHold`, for screenshots: diving
 * into a valley, taking off, just past a world's finish, or nightfall.
 */
export const previewGlider = (kind: GliderPreview, aspect = 2): GliderState => {
  const start = newGlider(1, aspect, kind === "world3" ? 3 : kind === "world6" ? 6 : 1);
  let state = kind === "high" ? { ...start, ...BIG_THROW, grounded: false } : start;
  const done = previewDone[kind];
  for (let i = 0; i < 60 * 600; i++) {
    const before = hold(state, kind !== "high" && autoHold(state));
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

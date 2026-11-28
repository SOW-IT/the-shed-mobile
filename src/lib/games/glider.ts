// Swoop: hold to make the bird heavy and dive into the valleys, let go to
// fly off the next slope. Reach the end of each world before the sun goes
// down. Pure: each step takes a state and returns the next.
//
// Unlike the other games, y grows upward here: it's the height above the
// bottom of the world. The scene turns it over when it draws.
import { random } from "./random";
import { GLIDER_V3, ramp } from "./gliderTuning";

export const GLIDER = {
  /** Gravity while light (let go) and heavy (held), in world units a second squared. */
  lightGravity: GLIDER_V3.speed.lightGravity,
  heavyGravity: GLIDER_V3.speed.heavyGravity,
  /** Slowing on the ground and in the air, times the speed squared. */
  groundDrag: GLIDER_V3.speed.groundDrag,
  airDrag: GLIDER_V3.speed.airDrag,
  /** The bird always waddles on at least this, so it can't get stuck in a valley. */
  minSpeed: GLIDER_V3.speed.min,
  maxSpeed: GLIDER_V3.speed.max,
  /** Top speed during Fever (3 swoops) and Double Fever (3 consecutive Fevers = 6 swoops). */
  feverMaxSpeed: GLIDER_V3.speed.feverMax,
  doubleFeverMaxSpeed: GLIDER_V3.speed.doubleFeverMax,
  feverStreak: GLIDER_V3.speed.feverStreak,
  doubleFeverStreak: GLIDER_V3.speed.doubleFeverStreak,
  feverBoost: GLIDER_V3.speed.feverBoost,
  doubleFeverBoost: GLIDER_V3.speed.doubleFeverBoost,
  feverDragScale: GLIDER_V3.speed.feverDragScale,
  doubleFeverDragScale: GLIDER_V3.speed.doubleFeverDragScale,
  feverMultiplier: 2,
  doubleFeverMultiplier: 3,
  startSpeed: GLIDER_V3.speed.start,
  /** The bird's size, for drawing. Its body sits on its lowest point. */
  radius: 16,
  /** Each world starts and ends on a hilltop this high. */
  peak: 280,
  floor: 20,
  ceiling: 560,
  /** Height above nearby mountain peaks where the cloud band starts and tops out. */
  cloudAbovePeaks: GLIDER_V3.speed.cloudAbovePeaks,
  maxAbovePeaks: GLIDER_V3.speed.maxAbovePeaks,
  /** Steepest slope a hill may have, rise over run. */
  maxSlope: 2.03,
  /** In the air at least this long before a landing can be perfect. */
  perfectAir: GLIDER_V3.speed.perfectAir,
  /** A landing this much faster than the ground's own slope would give. */
  perfectBoost: GLIDER_V3.speed.perfectBoost,
  /** A rough landing keeps this share of its speed along the ground. */
  roughKeep: 0.72,
  /** Landing on an upslope while heavy keeps this share on top. */
  heavyUpslopeKeep: 0.75,
  /** Seconds of daylight a perfect landing, long flight, and cloudtouch give back. */
  perfectTime: GLIDER_V3.speed.perfectTime,
  flightTime: GLIDER_V3.speed.flightTime,
  cloudTime: GLIDER_V3.speed.cloudTime,
  /** A flight at least this long is a long one. */
  longFlight: GLIDER_V3.speed.longFlight,
  perfectPoints: 20,
  flightPoints: 30,
  cloudPoints: 50,
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
  /** Only a numerical floor: real hills and flights never hit it, so the ground always stays in view. */
  minZoom: 0.05,
  /** How quickly the camera catches up, each second. */
  rate: 4,
  yCatchUpRate: 9,
  zoomRate: 3.5,
  catchUpRate: 6.2,
  behind: 0.15,
  ahead: 0.7,
  planAhead: 1.3,
  lookSeconds: 1.5,
  holdWide: 1.8,
  narrowing: 1.4,
  holdLow: 1.2,
  rising: 1.4,
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
  roughKeep: number;
  harsh: number;
};

const degrees = (d: number) => (d * Math.PI) / 180;

const V2 = GLIDER_V3;
export const HARDEST_WORLD = V2.hardestWorld;
export const FLOOR_DAY = V2.day.floorSeconds;

const wholeWorld = (world: number) => Math.max(1, Math.floor(world));

/**
 * Pure logarithmic terrain difficulty curve:
 * - Day 1: 0 steps (gentle warmup).
 * - Day 8: 9 steps (1× old Day 10 difficulty).
 * - Day 32: 27 steps (3× old Day 10 difficulty), plateauing cleanly for Day 32+.
 */
export const difficulty = (world: number) => {
  const w = Math.min(wholeWorld(world), V2.difficulty.plateauEnd);
  const { a, scale, logScale } = V2.difficulty;
  return a + scale * Math.log(1 + (w - 1) / logScale);
};

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
    roughKeep: ramp(V2.roughLandingKeep, n),
    harsh: harshness(whole),
  };
};

/** A hilltop or a valley floor. The ground between two is a smooth half wave. */
export type HillPoint = { x: number; y: number };

const worldSeed = (seed: number, world: number) => (seed ^ Math.imul(world, 0x9e3779b1)) | 0;

export const HILL_SHAPES = ["uneven", "double", "plateau", "ramp", "gorge", "wall", "drop", "cliff", "jagged"] as const;
type HillShape = (typeof HILL_SHAPES)[number];
type ShapedStretch = { shape: HillShape; from: number; to: number };

export const FIRST_WORLD = Object.fromEntries(HILL_SHAPES.map((shape) => [shape, V2.features[shape].firstWorld])) as Record<HillShape, number>;

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

const pickShape = (roll: number, world: number): HillShape => {
  const weights = HILL_SHAPES.map((shape) => shapeChance(shape, world));
  let left = roll * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < HILL_SHAPES.length; i++) {
    left -= weights[i];
    if (left < 0) return HILL_SHAPES[i];
  }
  return HILL_SHAPES[0];
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
  let previousShape: HillShape | null = null;
  let steepDown = false;
  let level = 0;
  const knots = levelKnots(seed, world, start, rules.length);
  const climbRoom = ramp(V2.longestClimb, n);
  const run = (rise: number) => Math.max(slopeRun(rise, rules.steepest), bendRun(rise));
  const flat = ramp(V2.landingZone, n);
  const room = Math.max(0, ramp(V2.featureRoom, n));
  const backToBack = ramp(V2.backToBackShare, n);
  const to = (nextX: number, nextY: number) => {
    const rise = nextY - y;
    const shiftRoom = V2.levelShare * Math.abs(rise);
    const shift = rise === 0 ? 0 : Math.max(-shiftRoom, Math.min(shiftRoom, levelAt(knots, nextX) - level));
    x = rise === 0 ? nextX : Math.max(nextX, x + run(rise + shift));
    y = nextY;
    level += shift;
    points.push({ x, y: y + level });
  };
  const climb = (top: number, up: number, stepsCount: number) => {
    const dip = Math.min(ramp(V2.jaggedDip, n), (top - y) / (stepsCount + 1));
    const rise = (top - y + dip * (stepsCount - 1)) / stepsCount;
    for (let i = 0; i < stepsCount; i++) {
      const crest = i === stepsCount - 1 ? top : y + rise;
      to(x + Math.max((up * 1.1) / stepsCount, run(crest - y)), crest);
      if (i < stepsCount - 1) to(x + run(dip) * 1.4, y - dip);
    }
  };
  for (let last = false; !last; ) {
    const down = Math.max(115, vary(rules.span));
    const up = Math.max(95, vary(rules.span) * (1 - rules.squeeze));
    last = x + down + up >= start + rules.length && Math.abs(level) <= V2.levelLanding;
    const roomy = x + 3 * (down + up) < start + rules.length;
    const again: boolean = previousShape !== null && roomy && random(rng) < backToBack;
    const shape: HillShape | null =
      (again || (roomy && rules.oddity > 0 && random(rng) < rules.oddity)) && rules.oddity > 0
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
    if (shape === "cliff") to(x + down * 0.72 * flat, y);
    const tall = shape === "wall" ? ramp(V2.wallHeight, n) : shape === "drop" ? 0.45 : 1;
    const top = last ? GLIDER.peak : Math.min(GLIDER.ceiling + room, y + climbRoom, Math.max(y + 40, y + vary(rules.drop) * tall));
    if (shape === "jagged") climb(top, up, Math.floor(ramp(V2.jaggedSteps, n) + 1e-9));
    else if (shape === "gorge" || shape === "wall") to(x + run(top - y) * 1.02, top);
    else to(x + Math.max(shape === "ramp" ? up * 1.9 : up, run(top - y)), top);
    if (shape === "ramp") steepDown = true;
    if (shape === "plateau") to(x + up * 0.85 * flat, y);
    if (shape === "double") {
      const dip = Math.min(ramp(V2.doubleDip, n), (top - valley) * ramp(V2.doubleDipShare, n));
      const hump = Math.max(up * 0.55 * flat, run(dip), 85 * flat);
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
type FeverLevel = 0 | 1 | 2;

const feverLevelOf = (fever: boolean | FeverLevel): FeverLevel => (fever === true ? 1 : fever === false ? 0 : fever);

const maxSpeedFor = (fever: boolean | FeverLevel) => {
  const level = feverLevelOf(fever);
  return level >= 2 ? GLIDER.doubleFeverMaxSpeed : level === 1 ? GLIDER.feverMaxSpeed : GLIDER.maxSpeed;
};

export const land = (
  vx: number,
  vy: number,
  slope: number,
  heavy: boolean,
  tolerance: number,
  airTime: number,
  roughKeep: number = GLIDER.roughKeep,
  fever: boolean | FeverLevel = 0
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
  } else if (slope >= -0.05 && angle > tolerance + ROUGH_MARGIN) {
    landing = "rough";
    speed *= roughKeep;
    if (heavy && slope > 0) speed *= GLIDER.heavyUpslopeKeep;
  }
  return { speed: clampSpeed(speed, fever), landing };
};

const clampSpeed = (speed: number, fever: boolean | FeverLevel = 0) =>
  Math.max(GLIDER.minSpeed, Math.min(maxSpeedFor(fever), speed));

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

export type Popup = {
  id: number;
  text: string;
  born: number;
  kind: "perfect" | "flight" | "world" | "rough" | "fever" | "doubleFever" | "cloud";
};

export type Camera = {
  x: number;
  y: number;
  zoom: number;
  zoomSpeed?: number;
  ySpeed?: number;
  span?: number;
  wideFor?: number;
  low?: number;
  lowFor?: number;
};

export type TrailPoint = { id: number; x: number; y: number };

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
  /** Active after 3 good swoops in a row (Gold Fever) and upgraded at 6 (Purple Double Fever). */
  fever: boolean;
  /** 0 = normal, 1 = Gold Fever (streak >= 3), 2 = Purple Double Fever (streak >= 6). */
  feverLevel: FeverLevel;
  /** Smoothed nearby hilltop height used to anchor the cloud band and max flight ceiling. */
  peakRef: number;
  /** Whether this flight has already touched the clouds. */
  cloudTouched: boolean;
  /**
   * Whether the bird was at or above the cloud band the last time it was
   * checked. The band follows `peakRef`, so it moves between frames; keeping
   * this flag (rather than comparing against a band that has since moved)
   * means crossing the band the player sees always counts as entering it.
   */
  inClouds: boolean;
  cloudTouches: number;
  /** 0..1 strength of how fast the bird entered the clouds (controls hang time and exit pickup). */
  cloudFloat: number;
  /** Smooth vertical parabola progression scale in/exiting clouds (1 below clouds on normal flights). */
  cloudPace: number;
  /** Stored exit boost that smoothly adds a Cloudtouch tailwind below the clouds. */
  cloudExitBoost: number;
  /** Short golden trail behind the bird while Fever is active. */
  trail: readonly TrailPoint[];
  trailClock: number;
  bonus: number;
  perfects: number;
  popups: Popup[];
  nextPopup: number;
  /** Smoothed body angle in radians, so touchdowns glide instead of snapping. */
  tilt: number;
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

/** Highest ground within a range, using binary search so it stays O(1) per frame. */
const highestGround = (points: readonly HillPoint[], from: number, to: number): number => {
  let high = Math.max(groundAt(points, from).y, groundAt(points, to).y);
  for (let i = spanAt(points, from) + 1; i < points.length && points[i].x < to; i++) high = Math.max(high, points[i].y);
  return high;
};

const LOCAL_PEAK_REACH = 700;

/** The tallest ridge near x: anchors the soft cloud ceiling not too far above the mountains. */
export const localPeak = (points: readonly HillPoint[], x: number): number =>
  Math.max(GLIDER.peak, highestGround(points, x - LOCAL_PEAK_REACH, x + LOCAL_PEAK_REACH));

export const cloudAltitude = (peakRef: number) => peakRef + GLIDER.cloudAbovePeaks;

export const maxFlightAltitude = (peakRef: number) => peakRef + GLIDER.maxAbovePeaks;

export const highestFlight = (highestGroundY: number = GLIDER.ceiling) =>
  Math.max(GLIDER.peak, highestGroundY) + GLIDER.maxAbovePeaks;

/** Adaptive terrain detail level: keeps curves smooth while bounding total mounted views when zoomed out. */
export const terrainLod = (zoom: number): { level: 0 | 1 | 2; strip: number; chunkStrips: number; chunk: number } => {
  if (zoom >= 0.72) return { level: 0, strip: 12, chunkStrips: 32, chunk: 384 };
  if (zoom >= 0.42) return { level: 1, strip: 18, chunkStrips: 24, chunk: 432 };
  return { level: 2, strip: 32, chunkStrips: 18, chunk: 576 };
};

type IslandPalette = { farHill: string; nearHill: string; ground: string; grass: string };

const hslHex = (hueDeg: number, sat: number, light: number): string => {
  const h = (((hueDeg % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Each island (day) gets its own vibrant palette: curated Tiny Wings colours first,
 * then a golden-angle hue sequence so mountain colours never repeat.
 */
export const islandPalette = (world: number, curated: readonly IslandPalette[]): IslandPalette => {
  const index = Math.max(1, Math.floor(world)) - 1;
  if (index < curated.length) return curated[index];
  const step = index - curated.length + 1;
  const hue = (27 + step * 137.507764) % 360;
  const grassHue = (hue + 28 + (step % 3) * 14) % 360;
  const sat = 0.48 + ((step % 4) * 0.05);
  return {
    farHill: hslHex(hue, sat * 0.65, 0.56),
    nearHill: hslHex(hue, sat * 0.78, 0.43),
    ground: hslHex(hue, sat, 0.31),
    grass: hslHex(grassHue, Math.min(0.82, sat + 0.2), 0.67),
  };
};

/** Which world owns ground at x: behind the start flag stays the previous island, past the end flag is already the next. */
export const worldAtX = (x: number, world: number, worldStart: number, worldEnd: number): number => {
  if (world > 1 && x < worldStart) return world - 1;
  if (x >= worldEnd) return world + 1;
  return world;
};

type Framed = Pick<GliderState, "x" | "y" | "hills" | "aspect"> & Partial<Pick<GliderState, "vx" | "vy" | "grounded" | "peakRef">>;

const roomAbove = (state: Framed) => state.y + GLIDER.radius * 2 + VIEW.margin;

const footing = (state: Framed) => groundAt(state.hills, state.x).y - VIEW.footing;

export const WIDEST_BOARD = 2.3;

const steadyHeight = () => VIEW.width / WIDEST_BOARD;

const visibleAhead = (zoom: number) => (VIEW.width / zoom) * (1 - VIEW.lead);

const lowVisible = (state: Framed, zoom: number, extraAhead = 0) => {
  const from = state.x - VIEW.width * VIEW.behind;
  const to = state.x + visibleAhead(zoom) + extraAhead;
  return Math.min(footing(state), lowestGround(state.hills, from, to) - VIEW.margin);
};

const fitFor = (state: Framed, top: number, extraAhead = 0, startZoom = 1) => {
  let zoom = Math.max(VIEW.minZoom, Math.min(1, startZoom));
  for (let i = 0; i < 12; i++) {
    const low = lowVisible(state, zoom, extraAhead);
    const next = Math.max(VIEW.minZoom, Math.min(zoom, steadyHeight() / Math.max(1, top - low)));
    if (next >= zoom - 1e-6) return zoom;
    zoom = next;
  }
  return zoom;
};

const CLOUD_GRAVITY_SPAN = 260;
const CLOUD_GRAVITY_GAIN = 1.35;

const flightTop = (state: Framed) => {
  const peak = state.peakRef ?? localPeak(state.hills, state.x);
  if (state.grounded !== false || (state.vy ?? 0) <= 0) return Math.min(maxFlightAltitude(peak), state.y);
  const vy = state.vy ?? 0;
  // Exact integral of pure lightGravity below cloudY and the smooth parabola shortening above cloudY.
  const cloudY = cloudAltitude(peak);
  const g0 = GLIDER.lightGravity;
  let energy = (vy * vy) / 2;
  let y = state.y;
  if (y < cloudY) {
    const gap = cloudY - y;
    const needed = g0 * gap;
    if (energy <= needed) return y + energy / g0;
    energy -= needed;
    y = cloudY;
  }
  const h0 = Math.max(0, y - cloudY);
  const k = (g0 * CLOUD_GRAVITY_GAIN) / CLOUD_GRAVITY_SPAN;
  // Integrate (g0 + k * h) dh from h0 to h1 = energy => 0.5*k*(h1^2 - h0^2) + g0*(h1 - h0) = energy
  const rhs = energy + g0 * h0 + 0.5 * k * h0 * h0;
  const h1 = (-g0 + Math.sqrt(g0 * g0 + 2 * k * rhs)) / k;
  return Math.min(maxFlightAltitude(peak), cloudY + h1);
};

const extraReach = (state: Framed) => Math.max(VIEW.width * VIEW.planAhead, Math.max(0, state.vx ?? 0) * VIEW.lookSeconds);

/** Where the camera wants to be: the bird in from the left, the valleys and the bird both in view. */
export const cameraTarget = (state: Framed): Camera => {
  const from = state.x - VIEW.width * VIEW.behind;
  const to = state.x + VIEW.width * VIEW.ahead;
  const high = Math.max(flightTop(state), highestGround(state.hills, from, to)) + GLIDER.radius * 2 + VIEW.margin;
  const zoom = fitFor(state, Math.max(high, roomAbove(state)), 0);
  const view = viewSize(state.aspect, zoom);
  const low = lowVisible(state, zoom, 0);
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
  const extra = extraReach(state);
  const from = state.x - VIEW.width * VIEW.behind;
  const high = Math.max(flightTop(state), highestGround(state.hills, from, state.x + VIEW.width * VIEW.ahead)) + GLIDER.radius * 2 + VIEW.margin;
  const plan = fitFor(state, Math.max(high, roomAbove(state)), extra);
  const needed = steadyHeight() / plan;
  const before = camera.span ?? needed;
  const wideFor = needed >= before ? 0 : (camera.wideFor ?? 0) + dt;
  const span =
    needed >= before || wideFor < VIEW.holdWide ? Math.max(needed, before) : needed + (before - needed) * Math.exp(-dt / VIEW.narrowing);
  const strict = fitFor(state, roomAbove(state), 0);
  const wanted = Math.min(strict, Math.max(VIEW.minZoom, Math.min(1, steadyHeight() / span)));
  const behind = Math.min(1, Math.max(0, (camera.zoom / (strict * 0.9) - 1) * 4));
  const rate = VIEW.zoomRate + (VIEW.catchUpRate - VIEW.zoomRate) * behind;
  const eased = settle(Math.log(camera.zoom), camera.zoomSpeed ?? 0, Math.log(wanted), rate, dt);
  const rawZoom = Math.exp(eased.value);
  const zoom = fitFor(state, roomAbove(state), 0, Math.min(rawZoom, strict));
  const zoomSpeed = zoom === rawZoom ? eased.speed : Math.min(eased.speed, 0);
  const view = viewSize(state.aspect, zoom);
  const lowNow = lowVisible(state, zoom, 0);
  const lowLook = lowVisible(state, zoom, extra);
  // Hold the lowest valley floor smoothly and ease back up slowly once it passes,
  // so the camera glides down early and never snaps when a valley enters or leaves.
  const lowBefore = camera.low ?? lowLook;
  const lowFor = lowLook <= lowBefore ? 0 : (camera.lowFor ?? 0) + dt;
  const lowHeld =
    lowLook <= lowBefore || lowFor < VIEW.holdLow
      ? Math.min(lowLook, lowBefore)
      : lowLook + (lowBefore - lowLook) * Math.exp(-dt / VIEW.rising);
  // However fast the bird climbs or drops, both it and the lowest ground in view stay on screen.
  const lowest = roomAbove(state) - view.height;
  const highest = lowNow;
  const goal = Math.max(lowest, Math.min(highest, lowHeld));
  const yGap = Math.max(0, camera.y - (highest - VIEW.margin * 0.5));
  const yUrgency = Math.min(1, yGap / Math.max(1, VIEW.margin * 2));
  const yRate = VIEW.rate + (VIEW.yCatchUpRate - VIEW.rate) * yUrgency;
  const rise = settle(camera.y, camera.ySpeed ?? 0, goal, yRate, dt);
  const y = Math.max(lowest, Math.min(highest, rise.value));
  const ySpeed = y === rise.value ? rise.speed : dt > 0 ? (y - camera.y) / dt : 0;
  return { x: state.x - view.width * VIEW.lead, y, zoom, zoomSpeed, ySpeed, span, wideFor, low: lowHeld, lowFor };
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
    fever: false,
    feverLevel: 0,
    peakRef: localPeak(hills, 0),
    cloudTouched: false,
    inClouds: false,
    cloudTouches: 0,
    cloudFloat: 0,
    cloudPace: 1,
    cloudExitBoost: 0,
    trail: [],
    trailClock: 0,
    bonus: 0,
    perfects: 0,
    popups: [],
    nextPopup: 1,
    tilt: Math.max(-1.1, Math.min(1.1, Math.atan(start.slope))),
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

export const unitPixels = (board: { width: number; height: number }, zoom: number) =>
  board.height / viewSize(board.width / board.height, zoom).height;

export const birdPixels = (unit: number) => unit * GLIDER.radius * 2.4;

const EARTH_DEPTH = 1400;

export const earthFloor = (hills: readonly HillPoint[]) => {
  let lowest = 0;
  for (const point of hills) lowest = Math.min(lowest, point.y);
  return Math.floor((lowest - EARTH_DEPTH) / 1000) * 1000;
};

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

const feverMultiplierOf = (level: FeverLevel) =>
  level >= 2 ? GLIDER.doubleFeverMultiplier : level === 1 ? GLIDER.feverMultiplier : 1;

const touchDown = (state: GliderState, ground: Ground) => {
  const rules = worldRules(state.world);
  const prevLevel: FeverLevel = state.feverLevel ?? (state.fever ? 1 : 0);
  const { speed, landing } = land(
    state.vx,
    state.vy * state.cloudPace,
    ground.slope,
    state.heavy,
    rules.tolerance,
    state.air,
    rules.roughKeep,
    prevLevel
  );
  const air = state.air;
  state.grounded = true;
  state.speed = speed;
  state.y = ground.y;
  state.air = 0;
  state.cloudTouched = false;
  state.inClouds = false;
  state.cloudFloat = 0;
  state.cloudPace = 1;
  state.cloudExitBoost = 0;
  if (landing === "perfect") {
    state.streak += 1;
    state.perfects += 1;
    const nextLevel: FeverLevel =
      state.streak >= GLIDER.doubleFeverStreak ? 2 : state.streak >= GLIDER.feverStreak ? 1 : 0;
    state.feverLevel = nextLevel;
    state.fever = nextLevel > 0;
    if (nextLevel === 1 && prevLevel === 0) state.speed = clampSpeed(state.speed * 1.09, 1);
    else if (nextLevel === 2 && prevLevel < 2) state.speed = clampSpeed(state.speed * 1.1, 2);
    const mult = feverMultiplierOf(nextLevel);
    const streakFactor = Math.min(state.streak, GLIDER.maxStreak);
    state.bonus += GLIDER.perfectPoints * streakFactor * mult;
    if (nextLevel === 2) popup(state, "doubleFever", prevLevel < 2 ? "Double Fever!" : `Double Fever ×${state.streak}`);
    else if (nextLevel === 1) popup(state, "fever", prevLevel === 0 ? "Fever!" : `Fever ×${state.streak}`);
    else popup(state, "perfect", state.streak > 1 ? `Perfect ×${state.streak}` : "Perfect!");
  } else if (landing === "rough") {
    state.streak = 0;
    state.fever = false;
    state.feverLevel = 0;
    state.trail = [];
    popup(state, "rough", "Bump");
  }
  if (air >= GLIDER.longFlight && landing !== "rough") {
    const level: FeverLevel = state.feverLevel ?? (state.fever ? 1 : 0);
    const mult = feverMultiplierOf(level);
    state.bonus += GLIDER.flightPoints * Math.floor(air / 0.5) * mult;
    popup(state, "flight", `Big flight ${air.toFixed(1)}s`);
  }
};

const moveOnGround = (state: GliderState, dt: number) => {
  const level: FeverLevel = state.feverLevel ?? (state.fever ? 1 : 0);
  const gravity = state.heavy ? GLIDER.heavyGravity : GLIDER.lightGravity;
  const here = groundAt(state.hills, state.x);
  const length = Math.hypot(1, here.slope);
  const pull = (-gravity * here.slope) / length;
  const boost = level >= 2 ? GLIDER.doubleFeverBoost : level === 1 ? GLIDER.feverBoost : 0;
  const drive = pull > 0 && boost > 0 ? pull * (1 + boost) : pull;
  const dragScale = level >= 2 ? GLIDER.doubleFeverDragScale : level === 1 ? GLIDER.feverDragScale : 1;
  const drag = GLIDER.groundDrag * dragScale;
  state.speed = clampSpeed(state.speed + (drive - drag * state.speed * state.speed) * dt, level);
  if (state.fever && state.speed < GLIDER.startSpeed * 1.05) {
    state.fever = false;
    state.feverLevel = 0;
    state.streak = 0;
    state.trail = [];
  }
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

const levelOf = (state: GliderState): FeverLevel => state.feverLevel ?? (state.fever ? 1 : 0);

/**
 * Entering or leaving the cloud band at `cloudY`. Entering scores Cloudtouch
 * once per flight and records the entry speed for hang time and the pickup on
 * the way down; velocity and curvature stay continuous.
 */
const crossClouds = (state: GliderState, cloudY: number) => {
  const inBand = state.y >= cloudY;
  if (inBand && !state.inClouds) {
    if (!state.cloudTouched) {
      state.cloudTouched = true;
      state.cloudTouches += 1;
      state.bonus += GLIDER.cloudPoints * feverMultiplierOf(levelOf(state));
      popup(state, "cloud", "Cloudtouch!");
    }
    if (!state.heavy && state.vy > 0) {
      const entrySpeed = Math.hypot(state.vx, state.vy);
      const strength = Math.max(0, Math.min(1, (entrySpeed - 500) / 850));
      state.cloudFloat = Math.max(state.cloudFloat, strength);
      state.cloudExitBoost = Math.max(state.cloudExitBoost, 0.3 + 0.7 * strength);
    }
  } else if (!inBand && state.inClouds) {
    state.cloudFloat = 0;
  }
  state.inClouds = inBand;
};

const moveInAir = (state: GliderState, dt: number) => {
  const level = levelOf(state);
  const cloudY = cloudAltitude(state.peakRef);
  const maxY = maxFlightAltitude(state.peakRef);
  // Holding to dive clears cloud float immediately for crisp drop-ins.
  if (state.heavy) {
    state.cloudFloat = 0;
    state.cloudPace = 1;
    state.cloudExitBoost = 0;
  }
  // Below the clouds on a normal flight: 100% pure lightGravity parabola (cloudPace = 1).
  // Above the clouds (!heavy): smoothly shorten the parabola height with continuous curvature
  // at cloudY and slow vertical parabola progression (cloudPace < 1, longer for faster entries)
  // while keeping full horizontal speed vx. Dropping back below cloudY after a Cloudtouch
  // gradually ramps cloudPace back up to 1 so you can prepare for descent.
  let gravity: number = state.heavy ? GLIDER.heavyGravity : GLIDER.lightGravity;
  if (!state.heavy && state.inClouds) {
    const above = Math.max(0, state.y - cloudY);
    gravity = GLIDER.lightGravity * (1 + CLOUD_GRAVITY_GAIN * Math.min(1.8, above / CLOUD_GRAVITY_SPAN));
    const minPace = 0.78 - 0.2 * state.cloudFloat;
    let targetPace = minPace;
    if (state.vy > 0) {
      const s = Math.min(1, above / 160);
      const smooth = s * s * (3 - 2 * s);
      targetPace = 1 - (1 - minPace) * smooth;
    }
    state.cloudPace += (targetPace - state.cloudPace) * Math.min(1, dt * 6);
  } else if (!state.heavy && state.cloudTouched) {
    state.cloudPace = Math.min(1, state.cloudPace + dt * 0.72);
  } else {
    state.cloudPace = 1;
  }
  const speed = Math.hypot(state.vx, state.vy);
  const dragScale = level >= 2 ? GLIDER.doubleFeverDragScale : level === 1 ? GLIDER.feverDragScale : 1;
  const drag = GLIDER.airDrag * dragScale;
  const slow = drag * speed * dt;
  const top = maxSpeedFor(level);
  state.vx = Math.max(GLIDER.minSpeed * 0.8, Math.min(top, state.vx - slow * state.vx));
  const vertDt = dt * state.cloudPace;
  state.vy -= gravity * vertDt + slow * state.vy * state.cloudPace;
  state.x += state.vx * dt;
  state.y += state.vy * vertDt;
  state.air += dt;

  crossClouds(state, cloudY);
  if (state.y < cloudY) {
    // Coming back below the clouds after Cloudtouch: brisker-yet-smooth speed pickup.
    if (!state.heavy && state.cloudTouched && state.cloudExitBoost > 0 && state.vy < 0) {
      const spend = Math.min(state.cloudExitBoost, 1.15 * dt);
      state.vx = Math.min(top, state.vx + 115 * spend);
      state.vy -= 70 * spend;
      state.cloudExitBoost = Math.max(0, state.cloudExitBoost - spend);
    }
  }

  // Far safety bound only; smooth parabola naturally crests below maxY.
  if (state.y > maxY) {
    state.y = maxY;
    if (state.vy > 0) state.vy = 0;
  }
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
  let first = Math.max(0, behind.length - 6);
  const keepFrom = state.camera.x - 1000;
  while (first > 0 && behind[first].x > keepFrom) first--;
  state.hills = [...behind.slice(first), ...hills];
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
  const targetPeak = localPeak(state.hills, state.x);
  const peakRate = targetPeak > state.peakRef ? 4 : 1.2;
  state.peakRef = state.peakRef + (targetPeak - state.peakRef) * (1 - Math.exp(-peakRate * dt));
  // The band just moved with peakRef; check the bird against the band that is drawn this frame.
  if (!state.grounded && !state.over) crossClouds(state, cloudAltitude(state.peakRef));
  if (state.fever) {
    state.trailClock += dt;
    if (state.trailClock >= 0.035) {
      state.trailClock = 0;
      const nextId = (state.trail.at(-1)?.id ?? 0) + 1;
      state.trail = [...state.trail.slice(-6), { id: nextId, x: state.x, y: state.y }];
    }
  } else if (state.trail.length > 0) {
    state.trail = [];
    state.trailClock = 0;
  }
  const rawAngle = state.grounded
    ? Math.atan(groundAt(state.hills, state.x).slope)
    : Math.atan2(state.vy * state.cloudPace, state.vx);
  const targetTilt = Math.max(-1.1, Math.min(1.1, rawAngle));
  state.tilt = previous.tilt + (targetTilt - previous.tilt) * (1 - Math.exp(-16 * dt));
  state.camera = followCamera(state.camera, state, dt);
  state.daySeen = Math.max(state.daySeen, dayProgress(state));
  state.score = gliderScore(state);
  return state;
};

export const maxWorldScore = (world: number) => {
  const rules = worldRules(world);
  const seconds = rules.day;
  const distance = (rules.length + rules.span * 4) / GLIDER.unitsPerPoint;
  const perfects = (seconds / GLIDER.perfectAir) * GLIDER.perfectPoints * GLIDER.maxStreak * GLIDER.doubleFeverMultiplier;
  const flights = (seconds / 0.5) * GLIDER.flightPoints * GLIDER.doubleFeverMultiplier;
  const clouds = (seconds / GLIDER.perfectAir) * GLIDER.cloudPoints * GLIDER.doubleFeverMultiplier;
  return Math.ceil(distance + perfects + flights + clouds + worldBonus(world) + rules.day * GLIDER.daylightPoints);
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

const BIG_THROW = { vx: 1100, vy: 1300 } as const;

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
      if (kind === "night" || kind === "dive") return state;
      for (let j = 0; j < 12; j++) state = stepGlider(hold(state, false), 1 / 60);
      return state;
    }
  }
  return state;
};

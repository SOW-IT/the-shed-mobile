// Hop: bounce up a sketchbook page, steering left and right. You bounce on
// your own; the score is the highest you've climbed. Pure: each step takes a
// state and returns the next, with no clock, network or React. Altitude goes
// up (the board turns it over to draw it), and x wraps around the board's
// sides.
import { GAME_VERSION, SCORE_LIMITS } from "../../../shared/games";
import { blend } from "./glider";
import { HOP, HOP_DIFFICULTY, HOP_LEVELS, HOP_STAGES } from "./hopTuning";
import { between, random } from "./random";

export type PlatformKind = "normal" | "moving" | "breakable" | "oneBounce";
export type BoostKind = "propeller" | "jetpack";

export type HopPlatform = {
  id: number;
  kind: PlatformKind;
  /** The middle of its top edge. */
  x: number;
  y: number;
  /** A moving platform's track: its middle, how far either side it goes, and how fast. */
  track?: { centre: number; range: number; speed: number; dir: 1 | -1 };
  spring?: { offset: number; firedAt: number | null };
  item?: { kind: BoostKind; offset: number };
  /** Part of the climb that's always possible. Only the tests read it. */
  route: boolean;
  landedAt: number | null;
};

type EffectAt = { x: number; y: number; at: number };
type EffectBody =
  | (EffectAt & { kind: "break" })
  | (EffectAt & { kind: "chalk" })
  | (EffectAt & { kind: "pickup"; boost: BoostKind })
  | (EffectAt & { kind: "drop"; boost: BoostKind; vx: number; facing: -1 | 1 });
/** Something played out over a moment: when it started, so a pause holds it too. */
export type HopEffect = EffectBody & { id: number };

export type Corridor = { from: number; to: number };

export type HopState = {
  width: number;
  height: number;
  seed: number;
  over: boolean;
  /** Seconds played, counting the fall at the end. */
  time: number;
  score: number;
  /** Where you started, so a practice run from higher up scores from there. */
  base: number;
  x: number;
  /** Your feet. */
  y: number;
  vx: number;
  vy: number;
  /** The steering held: left, nothing or right. */
  steer: -1 | 0 | 1;
  facing: -1 | 1;
  /** The altitude at the bottom of the board. */
  camera: number;
  /** The highest your feet have been. */
  top: number;
  landedAt: number | null;
  springAt: number | null;
  flight: { kind: BoostKind; at: number } | null;
  dying: { at: number; camera: number } | null;
  platforms: HopPlatform[];
  effects: HopEffect[];
  nextId: number;
  /** The last platform on the route, and how far either side of x you might be when on it. */
  gen: { y: number; x: number; spread: number };
  corridors: Corridor[];
  /** No spring or boost below here: one's landing corridor is still ahead. */
  boostClearAt: number;
  /** Your best when the run started, frozen for the run, and when you passed it. */
  best: number;
  bestAt: number | null;
};

/** The most a run can score: the leaderboard's cap. Past it the score stays put. */
export const HOP_MAX_SCORE = SCORE_LIMITS[GAME_VERSION].hop.max;

const g = HOP.gravity;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = ([from, to]: readonly [number, number], t: number) => from + (to - from) * t;

export const wrapX = (x: number, width: number) => ((x % width) + width) % width;

/** How far apart two x's are, the short way round the seam. */
export const seamDistance = (a: number, b: number, width: number) => {
  const d = Math.abs(wrapX(a, width) - wrapX(b, width));
  return Math.min(d, width - d);
};

/** How high a bounce at this speed rises: v² / 2g. */
const riseOf = (speed: number) => (speed * speed) / (2 * g);
export const JUMP_RISE = riseOf(HOP.jumpSpeed);
export const SPRING_RISE = riseOf(HOP.springSpeed);
/** The tallest gap the route may leave, keeping a margin below the top of the jump. */
export const MAX_ROUTE_GAP = JUMP_RISE - HOP.landingMargin;

/** Seconds from a bounce until you come down past a top dy above it, or null when it's out of reach. */
export const landingTime = (dy: number, speed: number = HOP.jumpSpeed) => {
  const disc = speed * speed - 2 * g * dy;
  return disc < 0 ? null : (speed + Math.sqrt(disc)) / g;
};

/**
 * How far sideways you can get in t seconds at worst: moving full speed the
 * wrong way to begin with, turning, then going flat out.
 */
export const sideReach = (t: number) => {
  const v = HOP.maxSpeed;
  const turn = v / HOP.reverse;
  const back = (v * v) / (2 * HOP.reverse);
  if (t <= turn) return -(v * t - 0.5 * HOP.reverse * t * t);
  const u = t - turn;
  const speedUp = v / HOP.accel;
  const ahead = u <= speedUp ? 0.5 * HOP.accel * u * u : (v * v) / (2 * HOP.accel) + v * (u - speedUp);
  return ahead - back;
};

/** How far sideways the route may ask you to go to reach a platform dy above. */
export const routeReach = (dy: number) => {
  if (dy > MAX_ROUTE_GAP) return -Infinity;
  const t = landingTime(dy);
  return t === null ? -Infinity : sideReach(t) - HOP.reachMargin;
};

/** The worst sideways trip from anywhere on one span to anywhere on another. */
export const worstTrip = (a: number, aSpread: number, b: number, bSpread: number, width: number) =>
  Math.min(width / 2, seamDistance(a, b, width) + aSpread + bSpread);

/** Steering for one step: quick to start, quicker to turn round, a short glide when let go. */
export const steerSpeed = (vx: number, steer: -1 | 0 | 1, dt: number) => {
  if (steer === 0) return Math.sign(vx) * Math.max(0, Math.abs(vx) - HOP.glide * dt);
  const push = vx * steer < 0 ? HOP.reverse : HOP.accel;
  return Math.max(-HOP.maxSpeed, Math.min(HOP.maxSpeed, vx + steer * push * dt));
};

const flightOf = (kind: BoostKind) => HOP[kind];
const fadeFrom = (kind: BoostKind) => flightOf(kind).seconds - HOP.boostFade.seconds;

/** Your climbing speed this far into a flight. */
const flightSpeed = (kind: BoostKind, age: number) => {
  const { speed } = flightOf(kind);
  const from = fadeFrom(kind);
  if (age <= from) return speed;
  return speed + (HOP.boostFade.endSpeed - speed) * clamp01((age - from) / HOP.boostFade.seconds);
};

/** How far a flight has climbed this far in. */
export const flightClimb = (kind: BoostKind, age: number) => {
  const { speed, seconds } = flightOf(kind);
  const a = Math.max(0, Math.min(seconds, age));
  const from = fadeFrom(kind);
  if (a <= from) return speed * a;
  const u = a - from;
  return speed * a + ((HOP.boostFade.endSpeed - speed) * u * u) / (2 * HOP.boostFade.seconds);
};

/** A whole flight's climb, and the coast up after it until you start to fall. */
export const flightRise = (kind: BoostKind) => flightClimb(kind, flightOf(kind).seconds) + riseOf(HOP.boostFade.endSpeed);

/**
 * How far below the top of a flight or spring jump a landing corridor runs.
 * Falling that far still leaves you on the board.
 */
export const CORRIDOR_DEPTH = 380;

const pointsAt = (altitude: number) => Math.max(0, altitude) / HOP.unitsPerPoint;
const levelAt = (points: number) => clamp01(points / HOP_LEVELS.peak);
const after = (points: number, from: number, range: readonly [number, number]) =>
  points < from ? 0 : lerp(range, clamp01((points - from) / (HOP_LEVELS.peak - from)));

/** How hard the climb is at this many points: the gap range and each platform's chance. */
export const hopDifficulty = (points: number) => {
  const t = levelAt(points);
  return {
    gapMin: lerp(HOP_DIFFICULTY.gapMin, t),
    gapMax: Math.min(MAX_ROUTE_GAP, lerp(HOP_DIFFICULTY.gapMax, t)),
    moving: after(points, HOP_LEVELS.moving, HOP_DIFFICULTY.movingChance),
    movingSpeed: lerp(HOP_DIFFICULTY.movingSpeed, t),
    movingRange: lerp(HOP_DIFFICULTY.movingRange, t),
    breakable: after(points, HOP_LEVELS.breakable, HOP_DIFFICULTY.breakableChance),
    oneBounce: after(points, HOP_LEVELS.oneBounce, HOP_DIFFICULTY.oneBounceChance),
    oneBounceDecoy: after(points, HOP_LEVELS.oneBounce, HOP_DIFFICULTY.oneBounceDecoyChance),
    spring: lerp(HOP_DIFFICULTY.springChance, t),
    propeller: points < HOP_LEVELS.propeller ? 0 : HOP_DIFFICULTY.propellerChance,
    jetpack: points < HOP_LEVELS.jetpack ? 0 : HOP_DIFFICULTY.jetpackChance,
  };
};

const PW = HOP.platform.width;

const addPlatform = (state: HopState, platform: Omit<HopPlatform, "id" | "landedAt">) => {
  const made: HopPlatform = { ...platform, id: state.nextId++, landedAt: null };
  state.platforms.push(made);
  return made;
};

const inCorridor = (state: HopState, y: number) => state.corridors.some((c) => y >= c.from && y <= c.to);

/** Far enough from a platform (and its whole track) not to crowd it. */
const clearOf = (state: HopState, x: number, platform: { x: number; track?: HopPlatform["track"] }) => {
  const centre = platform.track?.centre ?? platform.x;
  const range = platform.track?.range ?? 0;
  return seamDistance(x, centre, state.width) > PW + 8 + range;
};

const addCorridor = (state: HopState, corridor: Corridor) => {
  state.corridors.push(corridor);
  state.boostClearAt = Math.max(state.boostClearAt, corridor.to + 200);
};

/** Maybe a spring or a boost on a route platform, with the corridor to land in after it. */
const addExtras = (state: HopState, platform: HopPlatform, points: number) => {
  const level = hopDifficulty(points);
  if (platform.y < state.boostClearAt) return;
  const roll = random(state);
  const offset = between(state, -PW / 2 + 14, PW / 2 - 14);
  if (roll < level.jetpack || roll < level.jetpack + level.propeller) {
    const kind: BoostKind = roll < level.jetpack ? "jetpack" : "propeller";
    platform.item = { kind, offset };
    const rise = flightRise(kind);
    // You might take it with your head (box height below its top) or your feet (at its top).
    addCorridor(state, { from: platform.y - HOP.box.height + rise - CORRIDOR_DEPTH, to: platform.y + HOP.item.size + rise });
  } else if (roll < level.jetpack + level.propeller + level.spring) {
    platform.spring = { offset, firedAt: null };
    const apex = platform.y + HOP.spring.height + SPRING_RISE;
    addCorridor(state, { from: apex - CORRIDOR_DEPTH, to: apex });
  }
};

/** The next platform you can always reach, and the decoys and twins around it. */
const addRouteStep = (state: HopState) => {
  const prev = state.gen;
  const { width } = state;
  const points = pointsAt(prev.y);
  const level = hopDifficulty(points);
  let dy = between(state, level.gapMin, level.gapMax);
  const corridor = inCorridor(state, prev.y + dy) || inCorridor(state, prev.y + level.gapMin);
  if (corridor) dy = between(state, HOP_DIFFICULTY.corridorGap[0], HOP_DIFFICULTY.corridorGap[1]);
  const roll = random(state);
  let kind: PlatformKind = "normal";
  if (!corridor && roll < level.moving) kind = "moving";
  else if (!corridor && roll < level.moving + level.oneBounce) kind = "oneBounce";

  let placed: { x: number; range: number } | null = null;
  for (let attempt = 0; attempt < 12 && placed === null; attempt++) {
    const range = kind === "moving" ? between(state, level.movingRange * 0.6, level.movingRange) : 0;
    const x = corridor ? between(state, 0, width) : between(state, PW / 2 + range, width - PW / 2 - range);
    if (worstTrip(prev.x, prev.spread, x, range, width) <= routeReach(dy)) placed = { x, range };
    else if (attempt % 2 === 1) dy = Math.max(level.gapMin * 0.5, dy * 0.88);
  }
  if (placed === null) {
    // Straight above, low enough that any jump reaches it from anywhere.
    kind = "normal";
    dy = Math.min(dy, 60);
    placed = { x: prev.x, range: 0 };
  }
  const y = prev.y + dy;
  const platform = addPlatform(state, {
    kind,
    x: placed.x,
    y,
    route: true,
    ...(kind === "moving"
      ? {
          track: {
            centre: placed.x,
            range: placed.range,
            speed: level.movingSpeed * between(state, 0.8, 1.1),
            dir: random(state) < 0.5 ? -1 : 1,
          },
        }
      : {}),
  });
  if (platform.track) platform.x = platform.track.centre + between(state, -platform.track.range, platform.track.range);
  let spread = placed.range;

  if (corridor) {
    // A twin across the board: falling from anywhere, one of the two is close.
    addPlatform(state, { kind: "normal", x: wrapX(placed.x + width / 2, width), y, route: true });
    spread = width / 2;
  } else {
    if (kind === "normal") addExtras(state, platform, points);
    if (random(state) < level.breakable) {
      const decoyY = y + between(state, -24, 24);
      for (let attempt = 0; attempt < 6; attempt++) {
        const x = between(state, PW / 2, width - PW / 2);
        if (clearOf(state, x, platform) && seamDistance(x, prev.x, width) > PW + 8 + prev.spread) {
          addPlatform(state, { kind: "breakable", x, y: decoyY, route: false });
          break;
        }
      }
    }
    if (random(state) < level.oneBounceDecoy && dy > 70) {
      const decoyY = prev.y + dy * between(state, 0.35, 0.65);
      for (let attempt = 0; attempt < 6; attempt++) {
        const x = between(state, PW / 2, width - PW / 2);
        // Bouncing off it by accident must still reach the route.
        const reaches = worstTrip(x, 0, placed.x, placed.range, width) <= routeReach(y - decoyY);
        if (reaches && clearOf(state, x, platform) && seamDistance(x, prev.x, width) > PW + 8 + prev.spread) {
          addPlatform(state, { kind: "oneBounce", x, y: decoyY, route: false });
          break;
        }
      }
    }
  }
  state.gen = { y, x: placed.x, spread };
};

/** Platforms up to a little above the board; nothing kept far below it. */
const fill = (state: HopState) => {
  while (state.gen.y < state.camera + state.height + HOP.ahead) addRouteStep(state);
  const floor = state.camera - HOP.behind;
  if (state.platforms.some((p) => p.y < floor)) state.platforms = state.platforms.filter((p) => p.y >= floor);
  if (state.corridors.some((c) => c.to < floor)) state.corridors = state.corridors.filter((c) => c.to >= floor);
};

/** The camera starts with you this share of the board above its bottom. */
const START_SHARE = 0.22;

/** A run starting at `points` (0 for a normal run). */
export const hopAt = (width: number, height: number, seed: number, points: number, best = 0): HopState => {
  const base = Math.max(0, Math.floor(points)) * HOP.unitsPerPoint;
  const state: HopState = {
    width,
    height,
    seed,
    over: false,
    time: 0,
    score: Math.floor(base / HOP.unitsPerPoint),
    base,
    x: width / 2,
    y: base,
    vx: 0,
    vy: HOP.jumpSpeed,
    steer: 0,
    facing: 1,
    camera: base - height * START_SHARE,
    top: base,
    landedAt: 0,
    springAt: null,
    flight: null,
    dying: null,
    platforms: [],
    effects: [],
    nextId: 1,
    gen: { y: base, x: width / 2, spread: 0 },
    corridors: [],
    boostClearAt: base + 120,
    best: Math.max(0, Math.floor(best)),
    bestAt: null,
  };
  addPlatform(state, { kind: "normal", x: width / 2, y: base, route: true });
  fill(state);
  return state;
};

export const newHop = (width: number, height: number, seed: number, best = 0): HopState => hopAt(width, height, seed, 0, best);

/** Everything a run would lay up to this altitude, with nothing dropped below. */
export const layRoute = (width: number, height: number, seed: number, upTo: number): HopState => {
  const state = newHop(width, height, seed);
  while (state.gen.y < upTo) addRouteStep(state);
  return state;
};

export const withSteer = (state: HopState, steer: -1 | 0 | 1): HopState => (state.steer === steer ? state : { ...state, steer });

/** The score for how high you've been. */
export const hopScore = (top: number) =>
  Math.min(HOP_MAX_SCORE, Math.max(0, Math.floor(top / HOP.unitsPerPoint)));

const addEffect = (state: HopState, effect: EffectBody) => {
  state.effects = [...state.effects, { ...effect, id: state.nextId++ }].slice(-HOP.maxEffects);
};

/** Where a moving platform will be in t seconds, bouncing off the ends of its track. */
const trackAt = (platform: HopPlatform, t: number) => {
  const track = platform.track;
  if (!track) return platform.x;
  const span = 2 * track.range;
  const left = track.centre - track.range;
  const along = track.dir > 0 ? platform.x - left : 2 * span - (platform.x - left);
  const where = (((along + track.speed * t) % (2 * span)) + 2 * span) % (2 * span);
  return left + (where <= span ? where : 2 * span - where);
};


const moveTrack = (platform: HopPlatform, dt: number): HopPlatform => {
  const track = platform.track;
  if (!track) return platform;
  let x = platform.x + track.dir * track.speed * dt;
  let dir = track.dir;
  const right = track.centre + track.range;
  const left = track.centre - track.range;
  if (x > right) {
    x = right - (x - right);
    dir = -1;
  } else if (x < left) {
    x = left + (left - x);
    dir = 1;
  }
  return { ...platform, x, track: { ...track, dir } };
};

type Contact = { tau: number; top: number; platform: HopPlatform; spring: boolean };

/** The first top you come down onto in the next `rest` seconds, if any. */
const firstContact = (
  state: HopState,
  from: { x: number; y: number; vy: number; elapsed: number },
  rest: number,
  before: ReadonlyMap<number, HopPlatform>,
  skip: ReadonlySet<number>
): Contact | null => {
  let best: Contact | null = null;
  const half = HOP.box.width / 2;
  for (const platform of state.platforms) {
    if (skip.has(platform.id)) continue;
    const surfaces = platform.spring ? [true, false] : [false];
    for (const spring of surfaces) {
      const top = platform.y + (spring ? HOP.spring.height : 0);
      // Only coming down onto a top: rising through one from below passes it.
      if (from.y < top) continue;
      const tau = (from.vy + Math.sqrt(from.vy * from.vy + 2 * g * (from.y - top))) / g;
      if (tau > rest) continue;
      const at = from.elapsed + tau;
      const feet = from.x + state.vx * tau;
      // Where it was at that moment: from where and which way it was going at
      // the start of the step, turning at the end of its track if it got there.
      const centre = trackAt(before.get(platform.id) ?? platform, at) + (spring && platform.spring ? platform.spring.offset : 0);
      const reach = (spring ? HOP.spring.width : PW) / 2 + half;
      if (seamDistance(feet, centre, state.width) > reach) continue;
      const better =
        best === null ||
        tau < best.tau - 1e-9 ||
        (Math.abs(tau - best.tau) <= 1e-9 && (top > best.top || (top === best.top && platform.id < best.platform.id)));
      if (better) best = { tau, top, platform, spring };
    }
  }
  return best;
};

/** Falling: gravity, and every top you come down on in the step, in order. */
const fall = (state: HopState, dt: number, x0: number, before: ReadonlyMap<number, HopPlatform>, startTime: number) => {
  let rest = dt;
  let elapsed = 0;
  let { y, vy } = state;
  let x = x0;
  const hit = new Set<number>();
  const gone = new Set<number>();
  for (let contacts = 0; contacts < 8; contacts++) {
    const contact = firstContact(state, { x, y, vy, elapsed }, rest, before, hit);
    if (contact === null) break;
    const { tau, platform } = contact;
    const at = startTime + elapsed + tau;
    x += state.vx * tau;
    vy -= g * tau;
    y = contact.top;
    elapsed += tau;
    rest -= tau;
    hit.add(platform.id);
    const index = state.platforms.indexOf(platform);
    if (contact.spring && platform.spring) {
      vy = HOP.springSpeed;
      state.springAt = at;
      state.landedAt = at;
      state.platforms[index] = { ...platform, spring: { ...platform.spring, firedAt: at } };
    } else if (platform.kind === "breakable") {
      // Snaps under you: no bounce, and you keep falling.
      gone.add(platform.id);
      addEffect(state, { kind: "break", x: platform.x, y: platform.y, at });
    } else {
      vy = HOP.jumpSpeed;
      state.landedAt = at;
      if (platform.kind === "oneBounce") {
        gone.add(platform.id);
        addEffect(state, { kind: "chalk", x: platform.x, y: platform.y, at });
      } else state.platforms[index] = { ...platform, landedAt: at };
    }
  }
  state.y = y + vy * rest - 0.5 * g * rest * rest;
  state.vy = vy - g * rest;
  if (gone.size > 0) state.platforms = state.platforms.filter((p) => !gone.has(p.id));
};

/** Flying: the boost's own climb, then gravity again once it's spent. */
const fly = (state: HopState, dt: number) => {
  const flight = state.flight;
  if (!flight) return;
  const { seconds } = flightOf(flight.kind);
  const age0 = state.time - dt - flight.at;
  const age1 = age0 + dt;
  if (age1 < seconds) {
    state.y += flightClimb(flight.kind, age1) - flightClimb(flight.kind, age0);
    state.vy = flightSpeed(flight.kind, age1);
    return;
  }
  const left = age1 - seconds;
  state.y += flightClimb(flight.kind, seconds) - flightClimb(flight.kind, age0);
  const vy = HOP.boostFade.endSpeed;
  state.y += vy * left - 0.5 * g * left * left;
  state.vy = vy - g * left;
  state.flight = null;
  const kind = flight.kind;
  addEffect(state, { kind: "drop", boost: kind, x: state.x, y: state.y, vx: -state.facing * 90, facing: state.facing, at: state.time - left });
};

/** Touching a boost sitting on a platform puts it on. One at a time. */
const pickUp = (state: HopState) => {
  if (state.flight) return;
  const { width: bw, height: bh } = HOP.box;
  const size = HOP.item.size;
  for (let i = 0; i < state.platforms.length; i++) {
    const platform = state.platforms[i];
    const item = platform.item;
    if (!item) continue;
    const near = seamDistance(state.x, platform.x + item.offset, state.width) <= (size + bw) / 2;
    if (!near || state.y > platform.y + size || state.y + bh < platform.y) continue;
    state.platforms[i] = { ...platform, item: undefined };
    state.flight = { kind: item.kind, at: state.time };
    state.vy = flightOf(item.kind).speed;
    addEffect(state, { kind: "pickup", boost: item.kind, x: platform.x + item.offset, y: platform.y, at: state.time });
    return;
  }
};

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export const stepHop = (previous: HopState, dt: number): HopState => {
  if (previous.over) return previous;
  // Its own corridor list: laying platforms below adds to it, and the state before must stay as it was.
  const state: HopState = { ...previous, time: previous.time + dt, corridors: [...previous.corridors] };
  const startTime = previous.time;

  if (state.dying) {
    // Falling off: no landings, pickups or points, only the tumble.
    const age = state.time - state.dying.at;
    state.platforms = previous.platforms.map((platform) => moveTrack(platform, dt));
    state.vx = steerSpeed(state.vx, 0, dt);
    state.x = wrapX(state.x + state.vx * dt, state.width);
    state.y += state.vy * dt - 0.5 * g * dt * dt;
    state.vy -= g * dt;
    state.camera = state.dying.camera - HOP.dyingPan * easeOut(clamp01(age / HOP.dyingSeconds));
    if (age >= HOP.dyingSeconds) state.over = true;
    return state;
  }

  state.vx = steerSpeed(previous.vx, previous.steer, dt);
  if (previous.steer !== 0) state.facing = previous.steer;
  const before = new Map<number, HopPlatform>();
  state.platforms = previous.platforms.map((platform) => {
    if (!platform.track) return platform;
    before.set(platform.id, platform);
    return moveTrack(platform, dt);
  });

  if (state.flight) fly(state, dt);
  else fall(state, dt, previous.x, before, startTime);
  state.x = wrapX(previous.x + state.vx * dt, state.width);
  pickUp(state);

  state.camera = Math.max(state.camera, state.y - state.height * HOP.cameraShare);
  state.top = Math.max(state.top, state.y);
  state.score = hopScore(state.top);
  if (state.best > 0 && state.bestAt === null && state.score > state.best) state.bestAt = state.time;
  state.effects = state.effects.filter((effect) => state.time - effect.at < HOP.effectSeconds);

  if (state.y + HOP.box.height < state.camera) {
    state.dying = { at: state.time, camera: state.camera };
    state.steer = 0;
  }
  fill(state);
  return state;
};

// Test builds can play a run on their own, for checks that need one to
// climb and end.

/**
 * Steering a careful player would hold now: for the highest route platform
 * it can still reach on the way down, matching the speed that gets there.
 */
export const autoSteer = (state: HopState): -1 | 0 | 1 => {
  if (state.flight || state.dying || state.over) return 0;
  const half = PW / 2 + HOP.box.width / 2;
  let target: { x: number; y: number; t: number } | null = null;
  for (const platform of state.platforms) {
    if (!platform.route) continue;
    const disc = state.vy * state.vy + 2 * g * (state.y - platform.y);
    if (disc < 0) continue;
    const t = (state.vy + Math.sqrt(disc)) / g;
    if (t < 0.02) continue;
    const x = trackAt(platform, t);
    const reachable = seamDistance(state.x, x, state.width) - half + 8 <= sideReach(t) + Math.abs(state.vx) * 0.1;
    if (reachable && (target === null || platform.y > target.y)) target = { x, y: platform.y, t };
  }
  if (!target) return 0;
  let dx = wrapX(target.x - state.x, state.width);
  if (dx > state.width / 2) dx -= state.width;
  const wanted = dx / target.t;
  return wanted > state.vx + 25 ? 1 : wanted < state.vx - 25 ? -1 : 0;
};

/** Every platform taken away and nothing more laid: you fall off. */
export const dropFloor = (state: HopState): HopState => ({
  ...state,
  platforms: [],
  gen: { ...state.gen, y: Infinity },
  flight: null,
});

// The page's colours as you climb.

export type HopStage = (typeof HOP_STAGES)[number]["stage"];

export type HopPage = {
  paper: string;
  grid: string;
  margin: string;
  ink: string;
  mark: string;
  sketch: string;
};

export type HopPalette = Record<HopStage, HopPage>;

const smooth = (t: number) => t * t * (3 - 2 * t);

const stageMix = (points: number) => {
  const next = HOP_STAGES.findIndex((stop) => stop.at > points);
  if (next === -1) return { from: HOP_STAGES[HOP_STAGES.length - 1].stage, to: HOP_STAGES[HOP_STAGES.length - 1].stage, t: 0 };
  if (next === 0) return { from: HOP_STAGES[0].stage, to: HOP_STAGES[0].stage, t: 0 };
  const a = HOP_STAGES[next - 1];
  const b = HOP_STAGES[next];
  return { from: a.stage, to: b.stage, t: smooth((points - a.at) / (b.at - a.at)) };
};

/** How much of each stage's look shows at this many points; they add up to 1. */
export const stageWeights = (points: number): Record<HopStage, number> => {
  const { from, to, t } = stageMix(points);
  const weights: Record<HopStage, number> = { morning: 0, clouds: 0, dusk: 0, night: 0 };
  weights[from] += 1 - t;
  weights[to] += t;
  return weights;
};

/** The page at this many points, blended from the stages either side. */
export const hopPage = (points: number, palette: HopPalette): HopPage & { dark: boolean } => {
  const { from, to, t } = stageMix(points);
  const a = palette[from];
  const b = palette[to];
  const mixed = {
    paper: blend(a.paper, b.paper, t),
    grid: blend(a.grid, b.grid, t),
    margin: blend(a.margin, b.margin, t),
    ink: blend(a.ink, b.ink, t),
    mark: blend(a.mark, b.mark, t),
    sketch: blend(a.sketch, b.sketch, t),
  };
  return { ...mixed, dark: stageWeights(points).night > 0.5 };
};

/** The points the page's colour follows: the middle of the board. */
export const pagePoints = (state: Pick<HopState, "camera" | "height">) => pointsAt(state.camera + state.height / 2);

// Still moments, for screenshots in test builds.

export const HOP_PREVIEWS = [
  "opening",
  "clouds",
  "dusk",
  "night",
  "best",
  "crossed",
  "break",
  "onebounce",
  "spring",
  "propeller",
  "jetpack",
  "drop",
] as const;
export type HopPreview = (typeof HOP_PREVIEWS)[number];

export const isHopPreview = (value: string): value is HopPreview => (HOP_PREVIEWS as readonly string[]).includes(value);

const PREVIEW_POINTS: Record<HopPreview, number> = {
  opening: 0,
  clouds: 1300,
  dusk: 2300,
  night: 3500,
  best: 1150,
  crossed: 1150,
  break: 700,
  onebounce: 1000,
  spring: 400,
  propeller: 600,
  jetpack: 1800,
  drop: 900,
};

/**
 * A still moment of a run. Each is the opening of a run that far up, with
 * the thing it shows set just above you, part way through its animation.
 */
export const previewHop = (preview: HopPreview, width: number, height: number): HopState => {
  const points = PREVIEW_POINTS[preview];
  const best = preview === "best" ? points + 60 : preview === "crossed" ? points - 10 : 0;
  const state = hopAt(width, height, 7, points, best);
  // Mid-jump, a little way up the board.
  state.time = 1;
  state.y = state.base + 120;
  state.top = state.y;
  state.score = hopScore(state.top);
  state.vy = 200;
  state.landedAt = null;
  const mid = state.time - 0.22;
  const nearby = (y: number) => ({ x: width * 0.7, y });
  if (preview === "crossed") state.bestAt = state.time - 0.2;
  if (preview === "break") addEffect(state, { kind: "break", ...nearby(state.y - 20), at: mid });
  if (preview === "onebounce") addEffect(state, { kind: "chalk", ...nearby(state.y - 10), at: mid });
  if (preview === "spring") {
    const under = { kind: "normal" as const, x: state.x, y: state.y - 60, route: true, spring: { offset: 0, firedAt: state.time - 0.08 } };
    addPlatform(state, under);
    state.springAt = state.time - 0.08;
    state.vy = HOP.springSpeed * 0.9;
  }
  if (preview === "propeller" || preview === "jetpack") {
    state.flight = { kind: preview, at: state.time - 0.6 };
    state.vy = flightOf(preview).speed;
    state.steer = 1;
    state.facing = 1;
  }
  if (preview === "drop") {
    addEffect(state, { kind: "drop", boost: "propeller", x: state.x + 30, y: state.y + 40, vx: -90, facing: 1, at: state.time - 0.25 });
    addEffect(state, { kind: "drop", boost: "jetpack", x: state.x - 60, y: state.y + 10, vx: 90, facing: -1, at: state.time - 0.4 });
  }
  return state;
};

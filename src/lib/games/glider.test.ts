import { describe, expect, test } from "vitest";
import { GAME_VERSION, SCORE_LIMITS, scoreProblem } from "../../../shared/games";
import { random } from "./random";
import {
  autoHold,
  blend,
  cameraTarget,
  colourAt,
  dayProgress,
  dayLength,
  FIRST_WORLD,
  FLOOR_DAY,
  GLIDER,
  GLIDER_PREVIEWS,
  gliderScore,
  groundAt,
  HARDEST_WORLD,
  harshness,
  highestFlight,
  HILL_SHAPES,
  hold,
  isGliderPreview,
  land,
  leavesGround,
  lowestGround,
  maxGliderScore,
  maxWorldScore,
  parallaxShift,
  WIDEST_BOARD,
  newGlider,
  previewGlider,
  resize,
  stepGlider,
  viewSize,
  VIEW,
  worldBonus,
  worldHills,
  worldLength,
  worldProgress,
  worldShapes,
  worldRules,
  type GliderState,
  type HillPoint,
} from "./glider";

const FRAME = 1 / 60;

type Pilot = (state: GliderState) => boolean;

/** Plays a run with a pilot deciding, every frame, whether to hold. */
const fly = (pilot: Pilot, seed = 1, until: (state: GliderState) => boolean = () => false, limit = 600) => {
  let state = newGlider(seed, 2);
  const frames: GliderState[] = [];
  while (!state.over && state.time < limit) {
    state = stepGlider(hold(state, pilot(state)), FRAME);
    frames.push(state);
    if (until(state)) break;
  }
  return { state, frames };
};

const never: Pilot = () => false;

const diveAndRelease: Pilot = (state) =>
  groundAt(state.hills, state.x).slope < 0 && (state.grounded || state.vy < 0);

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** A pilot that looks ahead and holds when that lands it better: what a practised player does. */
const landingOf = (state: GliderState, heavy: boolean) => {
  let next = hold(state, heavy);
  for (let i = 0; i < 240 && !next.grounded; i++) next = stepGlider(next, FRAME);
  return { slope: groundAt(next.hills, next.x).slope, speed: next.speed, perfect: next.perfects > state.perfects };
};
const practised: Pilot = (state) => {
  if (state.grounded) return groundAt(state.hills, state.x).slope < -0.02;
  const light = landingOf(state, false);
  if (light.perfect) return false;
  const heavy = landingOf(state, true);
  if (heavy.perfect) return true;
  if (light.slope < -0.05) return false;
  return heavy.speed > light.speed;
};

const PERFECT_WORTH = 480;
const gained = (from: GliderState, to: GliderState) => to.x + PERFECT_WORTH * (to.perfects - from.perfects);
const following = (state: GliderState, frames: number) => {
  let next = state;
  for (let i = 0; i < frames; i++) next = stepGlider(hold(next, autoHold(next)), FRAME);
  return next;
};
const planned = (state: GliderState, plan: readonly boolean[], step: number) => {
  let next = state;
  for (let i = 0; i < step * plan.length; i++) next = stepGlider(hold(next, plan[Math.floor(i / step)]), FRAME);
  return following(next, 40);
};
const bestMove = (state: GliderState, plans: readonly (readonly boolean[])[], step: number) => {
  const start = { ...state, popups: [] };
  let furthest = gained(start, following(start, step * plans[0].length + 40));
  let choice = autoHold(state);
  for (const plan of plans) {
    const reached = gained(start, planned(start, plan, step));
    if (reached > furthest) {
      furthest = reached;
      choice = plan[0];
    }
  }
  return choice;
};
const PAIRS = [true, false].flatMap((a) => [true, false].map((b) => [a, b]));
const TRIPLES = PAIRS.flatMap((pair) => [true, false].map((c) => [...pair, c]));

const lookahead = (plans: readonly (readonly boolean[])[], step: number, every: number, late = 0, lateFrames = 0, seed = 1): Pilot => {
  const rng = { seed: seed * 7919 };
  let choice = false;
  let frame = 0;
  let stuck = 0;
  return (state) => {
    frame++;
    if (stuck > 0) {
      stuck--;
      return choice;
    }
    if (frame % every !== 0) return choice;
    const wanted = bestMove(state, plans, step);
    if (wanted !== choice && late > 0 && random(rng) < late) {
      stuck = lateFrames;
      return choice;
    }
    choice = wanted;
    return choice;
  };
};

const reading = () => lookahead(PAIRS, 15, 4);
const careful = () => lookahead(TRIPLES, 15, 3);
const good = (seed: number) => lookahead(PAIRS, 15, 5, 0.08, 10, seed);
const withMistakes = (pilot: Pilot, seed: number): Pilot => {
  const rng = { seed: seed * 104729 };
  const at = [0, 1, 2].map((i) => 2 + i * 5 + random(rng) * 3);
  return (state) => {
    const choice = pilot(state);
    return at.some((t) => state.time >= t && state.time < t + 0.6) ? !choice : choice;
  };
};

const finishWorld = (world: number, seed: number, pilot: Pilot) => {
  let state = newGlider(seed, 2, world);
  while (!state.over) {
    const before = state;
    state = stepGlider(hold(state, pilot(state)), FRAME);
    if (state.world > world) return 1 - before.daylight / worldRules(world).day;
  }
  return null;
};

const perfectRun = (world: number, seed: number) => finishWorld(world, seed, reading()) ?? finishWorld(world, seed, careful());

/** One valley between two hilltops, for the physics tests. */
const VALLEY: HillPoint[] = [
  { x: 0, y: 300 },
  { x: 400, y: 60 },
  { x: 700, y: 300 },
  { x: 1100, y: 60 },
];
const onValley = (overrides: Partial<GliderState>): GliderState => ({
  ...newGlider(1, 2),
  hills: VALLEY,
  worldEnd: 1e9,
  ...overrides,
});

describe("Swoop's hills", () => {
  test("are the same for the same seed and world, and differ for another", () => {
    expect(worldHills(7, 1, 0)).toEqual(worldHills(7, 1, 0));
    expect(worldHills(8, 1, 0)).not.toEqual(worldHills(7, 1, 0));
    expect(worldHills(7, 2, 0)).not.toEqual(worldHills(7, 1, 0));
  });

  test("start and end on a hilltop of the same height, so worlds join without a seam", () => {
    for (const world of [1, 2, 5, 12]) {
      const hills = worldHills(3, world, 5000);
      expect(hills[0]).toEqual({ x: 5000, y: GLIDER.peak });
      expect(hills.at(-1)?.y).toBe(GLIDER.peak);
      expect(hills.at(-1)!.x - 5000).toBeGreaterThanOrEqual(worldRules(world).length);
    }
  });

  test("go hilltop, valley, hilltop, with flat tops and floors, inside the world's floor and ceiling", () => {
    for (const world of [1, 3, 6, 12]) {
      const hills = worldHills(11, world, 0);
      hills.forEach((point, i) => {
        expect(point.y).toBeGreaterThanOrEqual(GLIDER.floor);
        expect(point.y).toBeLessThanOrEqual(GLIDER.ceiling);
        if (i === 0) return;
        expect(point.x).toBeGreaterThan(hills[i - 1].x);
        if (i === hills.length - 1) return;
        const before = Math.sign(point.y - hills[i - 1].y);
        const after = Math.sign(hills[i + 1].y - point.y);
        expect(before !== 0 && before === after).toBe(false);
      });
    }
  });

  test("are smooth: no jumps, no corners, and never steeper than the limit", () => {
    for (const world of [1, 4, 9, 20, 30]) {
      const hills = worldHills(5, world, 0);
      const end = hills.at(-1)!.x;
      let previous = groundAt(hills, 0);
      for (let x = 1; x <= end; x += 1) {
        const ground = groundAt(hills, x);
        expect(Math.abs(ground.y - previous.y)).toBeLessThan(GLIDER.maxSlope + 0.01);
        expect(Math.abs(ground.slope - previous.slope)).toBeLessThan(0.08);
        expect(Math.abs(ground.slope)).toBeLessThanOrEqual(GLIDER.maxSlope + 1e-9);
        previous = ground;
      }
    }
  });

  test("give a slope and a bend that match the height", () => {
    const hills = worldHills(2, 3, 0);
    for (const x of [37, 410, 1234, 2500]) {
      const e = 0.01;
      const at = groundAt(hills, x);
      const before = groundAt(hills, x - e);
      const after = groundAt(hills, x + e);
      expect(at.slope).toBeCloseTo((after.y - before.y) / (2 * e), 4);
      expect(at.curve).toBeCloseTo((after.slope - before.slope) / (2 * e), 4);
    }
  });

  test("are flat beyond either end, and no hills at all is flat ground", () => {
    expect(groundAt(VALLEY, -50)).toEqual({ y: 300, slope: 0, curve: 0 });
    expect(groundAt(VALLEY, 5000)).toEqual({ y: 60, slope: 0, curve: 0 });
    expect(groundAt([], 10)).toEqual({ y: 0, slope: 0, curve: 0 });
    expect(groundAt([{ x: 0, y: 9 }], 10)).toEqual({ y: 9, slope: 0, curve: 0 });
  });

  test("know the lowest ground in a stretch", () => {
    expect(lowestGround(VALLEY, 100, 600)).toBe(60);
    expect(lowestGround(VALLEY, 500, 650)).toBeCloseTo(groundAt(VALLEY, 500).y, 6);
  });
});

describe("each world is harder than the last", () => {
  test("every world is a steady step harder than the last: narrower, deeper, steeper, more odd shapes, a smaller landing window, up to the limits the physics allows", () => {
    const steps = (pick: (world: number) => number, from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => pick(from + i + 1) - pick(from + i));
    const even = (values: number[]) => values.every((value) => Math.abs(value - values[0]) < 1e-9);
    expect(even(steps(harshness, 1, 40))).toBe(true);
    expect(harshness(1)).toBe(0);
    expect(harshness(HARDEST_WORLD)).toBe(1);
    expect(harshness(30)).toBeGreaterThan(3);
    for (const [pick, until] of [
      [(w: number) => worldRules(w).span, 11],
      [(w: number) => worldRules(w).drop, 10],
      [(w: number) => worldRules(w).steepest, 10],
      [(w: number) => worldRules(w).tolerance, 10],
      [(w: number) => worldRules(w).oddity, 12],
      [(w: number) => worldRules(w).squeeze, 10],
      [(w: number) => worldRules(w).bumpiness, 10],
    ] as const) {
      const early = steps(pick, 1, until);
      expect(even(early.map((step) => Math.round(step * 1e6)))).toBe(true);
      expect(early[0]).not.toBe(0);
      const later = steps(pick, until, 40);
      expect(later.every((step) => Math.sign(step) === Math.sign(early[0]) || step === 0)).toBe(true);
    }
    expect(worldRules(HARDEST_WORLD).steepest).toBe(GLIDER.maxSlope);
    for (let world = 1; world < 60; world++) {
      expect(worldRules(world).length / worldRules(world).day).toBeLessThan(GLIDER.maxSpeed);
      expect(worldRules(world + 1).length).toBeLessThanOrEqual(worldRules(world).length);
    }
    expect(worldRules(0)).toEqual(worldRules(1));
  });

  test("the day shortens fastest at first, by the log of the world, to a floor reached by world 9", () => {
    const days = Array.from({ length: 60 }, (_, i) => dayLength(i + 1));
    expect(days[0]).toBe(26);
    expect(days.indexOf(FLOOR_DAY) + 1).toBeLessThanOrEqual(9);
    expect(days.indexOf(FLOOR_DAY) + 1).toBeGreaterThanOrEqual(8);
    for (let world = 2; world <= 60; world++) expect(days[world - 1]).toBeLessThanOrEqual(days[world - 2]);
    expect(days[0] - days[1]).toBeGreaterThan(days[4] - days[5]);
    expect(days.slice(9).every((day) => day === FLOOR_DAY)).toBe(true);
    for (let world = 1; world <= 60; world++) expect(worldRules(world).day).toBe(dayLength(world));
    expect(worldLength(1)).toBeGreaterThan(2 * worldLength(HARDEST_WORLD));
  });
});

describe("landing", () => {
  const tolerance = worldRules(1).tolerance;

  test("along a downslope after a real flight is perfect, and a little faster", () => {
    const slope = -0.8;
    const { speed, landing } = land(500, 500 * slope, slope, false, tolerance, 1);
    expect(landing).toBe("perfect");
    expect(speed).toBeGreaterThan(Math.hypot(500, 400));
  });

  test("a hop that barely left the ground is only smooth", () => {
    expect(land(500, -400, -0.8, false, tolerance, 0.1).landing).toBe("smooth");
  });

  test("onto an upslope is rough and costs speed, more so while heavy", () => {
    const light = land(600, -400, 0.5, false, tolerance, 1);
    const heavy = land(600, -400, 0.5, true, tolerance, 1);
    expect(light.landing).toBe("rough");
    expect(light.speed).toBeLessThan(Math.hypot(600, 400) * 0.6);
    expect(heavy.speed).toBeLessThan(light.speed);
  });

  test("never stops the bird", () => {
    expect(land(200, -900, 1.4, true, tolerance, 1).speed).toBe(GLIDER.minSpeed);
  });
});

describe("taking off", () => {
  const crest = groundAt(VALLEY, 690);

  test("a fast bird leaves a hilltop's curve; a slow one follows it", () => {
    expect(crest.curve).toBeLessThan(0);
    expect(leavesGround(crest, 900, GLIDER.lightGravity)).toBe(true);
    expect(leavesGround(crest, 150, GLIDER.lightGravity)).toBe(false);
  });

  test("holding keeps the bird down at speeds where letting go would fly", () => {
    const speed = Math.sqrt(GLIDER.lightGravity / -crest.curve) * 1.2;
    expect(leavesGround(crest, speed, GLIDER.lightGravity)).toBe(true);
    expect(leavesGround(crest, speed, GLIDER.heavyGravity)).toBe(false);
  });

  test("a valley floor never throws the bird off", () => {
    expect(leavesGround(groundAt(VALLEY, 400), 1500, GLIDER.lightGravity)).toBe(false);
  });
});

describe("momentum", () => {
  const slideFor = (state: GliderState, heavy: boolean, seconds: number) => {
    let current = hold(state, heavy);
    for (let t = 0; t < seconds; t += FRAME) current = stepGlider(current, FRAME);
    return current;
  };

  test("heavy on a downslope speeds up faster than light", () => {
    const start = onValley({ x: 120, y: groundAt(VALLEY, 120).y, speed: 300 });
    expect(slideFor(start, true, 0.3).speed).toBeGreaterThan(slideFor(start, false, 0.3).speed + 100);
  });

  test("heavy on an upslope slows down faster than light", () => {
    const start = onValley({ x: 450, y: groundAt(VALLEY, 450).y, speed: 700 });
    expect(slideFor(start, true, 0.2).speed).toBeLessThan(slideFor(start, false, 0.2).speed - 60);
  });

  test("diving into the valley and letting go at the bottom launches the bird off the next hill", () => {
    let state = hold(onValley({ x: 20, y: groundAt(VALLEY, 20).y, speed: 300 }), true);
    while (state.x < 400) state = stepGlider(state, FRAME);
    state = hold(state, false);
    let highest = 0;
    let launched: GliderState | null = null;
    while (state.x < 1000) {
      state = stepGlider(state, FRAME);
      if (!state.grounded && !launched) launched = state;
      highest = Math.max(highest, state.y);
    }
    expect(launched).not.toBeNull();
    expect(launched!.x).toBeGreaterThan(400);
    expect(launched!.x).toBeLessThan(700);
    expect(launched!.vy).toBeGreaterThan(0);
    // Higher than the hilltop it flew off.
    expect(highest).toBeGreaterThan(400);
    expect(highest - launched!.y).toBeLessThanOrEqual(launched!.vy ** 2 / (2 * GLIDER.lightGravity));
  });

  const OVER = 300;
  const crestSpeeds = (pilot: Pilot, seed: number, count: number) => {
    let state = newGlider(seed, 2);
    const crests = state.hills.filter((_, i) => i % 2 === 0).slice(1, count + 1);
    const speeds: number[] = [];
    while (!state.over && speeds.length < crests.length) {
      const before = state;
      state = stepGlider(hold(state, pilot(state)), FRAME);
      if (before.x < crests[speeds.length].x && state.x >= crests[speeds.length].x) {
        speeds.push(Math.hypot(state.vx, state.vy));
      }
    }
    return speeds;
  };
  test("diving down each slope and letting go at the bottom carries the bird over world 1's first two hills on nearly every seed", () => {
    const over = SEEDS.filter((seed) => crestSpeeds(diveAndRelease, seed, 2).every((speed) => speed > OVER));
    expect(over.length).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  test("the same diving carries it over at least four of world 1's first five hills", () => {
    for (const seed of SEEDS) {
      expect(crestSpeeds(diveAndRelease, seed, 5).filter((speed) => speed > OVER).length).toBeGreaterThanOrEqual(4);
    }
  });

  test("without diving, the bird only waddles over the hills", () => {
    for (const seed of SEEDS) {
      for (const speed of crestSpeeds(never, seed, 5)) expect(speed).toBeLessThan(OVER);
    }
  });

  test("never stalls, and never goes past top speed", () => {
    const { frames } = fly(autoHold, 4);
    for (const frame of frames) {
      expect(frame.vx).toBeGreaterThan(0);
      expect(frame.grounded ? frame.speed : 0).toBeLessThanOrEqual(GLIDER.maxSpeed);
      expect(frame.vx).toBeLessThanOrEqual(GLIDER.maxSpeed);
    }
  });
});

describe("the day", () => {
  test("night falls on a bird that never dives, before it finishes the first world", () => {
    const { state } = fly(never, 1);
    expect(state.over).toBe(true);
    expect(state.ended).toBe("night");
    expect(state.world).toBe(1);
    expect(state.time).toBeCloseTo(worldRules(1).day, 1);
    expect(state.daylight).toBe(0);
    expect(dayProgress(state)).toBe(1);
    expect(worldProgress(state)).toBeLessThan(1);
  });

  test("the sun moves from sunrise toward night", () => {
    const start = newGlider(1);
    expect(dayProgress(start)).toBe(0);
    const later = stepGlider(start, worldRules(1).day / 2);
    expect(dayProgress(later)).toBeCloseTo(0.5, 5);
  });

  test("perfect landings and long flights win daylight back, up to the world's cap", () => {
    const { frames } = fly(practised, 2, (state) => state.world > 1);
    const firstWorld = frames.filter((frame) => frame.world === 1);
    const regained = Math.max(...firstWorld.map((frame) => frame.regained));
    expect(firstWorld.some((frame) => frame.perfects > 0)).toBe(true);
    expect(regained).toBeGreaterThan(0);
    expect(regained).toBeLessThanOrEqual(worldRules(1).bonusCap + 1e-9);
    for (const frame of frames) expect(frame.daylight).toBeLessThanOrEqual(worldRules(frame.world).day);
  });
});

describe("worlds", () => {
  test("simple diving finishes the first world before night falls", () => {
    const { state, frames } = fly(autoHold, 1);
    const done = frames.findIndex((frame) => frame.world === 2);
    expect(done).toBeGreaterThan(0);
    const next = frames[done];
    expect(next.worldStart).toBe(frames[done - 1].worldEnd);
    expect(next.daylight).toBeGreaterThan(worldRules(2).day - FRAME - 1e-9);
    expect(next.daylight).toBeLessThanOrEqual(worldRules(2).day);
    expect(next.regained).toBe(0);
    expect(next.bonus - frames[done - 1].bonus).toBeGreaterThanOrEqual(GLIDER.worldPoints);
    expect(next.popups.some((p) => p.kind === "world" && p.text.startsWith("World 1 done"))).toBe(true);
    expect(state.ended).toBe("night");
    expect(state.world).toBeGreaterThanOrEqual(2);
  });

  test("reaching the flag counts only before night falls, even inside one frame", () => {
    const start = newGlider(1, 2);
    const atFlag = (daylight: number): GliderState => ({
      ...start,
      x: start.worldEnd - 1,
      y: groundAt(start.hills, start.worldEnd - 1).y,
      speed: 220,
      daylight,
    });
    // One unit at 220 a second takes under 5 ms: a frame is 17.
    const late = stepGlider(atFlag(0.001), FRAME);
    expect(late.over).toBe(true);
    expect(late.ended).toBe("night");
    expect(late.world).toBe(1);
    const inTime = stepGlider(atFlag(0.01), FRAME);
    expect(inTime.over).toBe(false);
    expect(inTime.world).toBe(2);
    expect(inTime.daylight).toBeGreaterThan(worldRules(2).day - FRAME);
  });

  test("a perfect run, timing dives and flights, gets several worlds further in one go", () => {
    const { state } = fly(reading(), 1, (now) => now.world > 4, 400);
    expect(state.world).toBeGreaterThanOrEqual(4);
    expect(state.perfects).toBeGreaterThan(20);
  }, 60_000);

  test("the ground under the bird is always there across a world's edge", () => {
    const { frames } = fly(autoHold, 3);
    expect(frames.some((frame) => frame.world > 1)).toBe(true);
    for (const frame of frames.filter((frame, i) => frame.world > 1 && i % 10 === 0)) {
      expect(frame.hills[0].x).toBeLessThanOrEqual(frame.camera.x);
      expect(frame.hills.at(-1)!.x).toBeGreaterThan(frame.worldEnd);
    }
  });
});

describe("wide hills first, odd shapes later", () => {
  const sloppy = (early: number, late: number): Pilot => {
    const wanted: boolean[] = [];
    return (state) => {
      wanted.push(groundAt(state.hills, state.x).slope < -early && (state.grounded || state.vy < 0));
      return wanted.length > late ? wanted[wanted.length - 1 - late] : true;
    };
  };
  const reached = (pilot: Pilot, seed: number) => fly(pilot, seed, () => false, 600).state.world;
  const crestGap = (world: number) => {
    let length = 0;
    let crests = 0;
    for (const seed of SEEDS) {
      const hills = worldHills(seed, world, 0);
      length += hills.at(-1)!.x;
      crests += 1 + hills.filter((point, i) => i > 0 && i < hills.length - 1 && point.y >= hills[i - 1].y && point.y > hills[i + 1].y).length;
    }
    return length / crests;
  };

  test("the hills narrow every world to world 12, then stay that narrow", () => {
    const gaps = [1, 3, 5, 7, 9, 12].map(crestGap);
    gaps.slice(1).forEach((gap, i) => expect(gap).toBeLessThan(gaps[i]));
    expect(gaps[0]).toBeGreaterThan(2 * gaps[5]);
    for (const world of [13, 20, 50]) expect(worldRules(world).span).toBe(worldRules(12).span);
  });

  test("the ground gets harsher by a similar step every world to world 10: more odd shapes, steeper, more climbing; after that every world adds more bumps", () => {
    const harshIndex = (world: number) => {
      let length = 0;
      let shaped = 0;
      let relief = 0;
      let steep = 0;
      let samples = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const hills = worldHills(seed, world, 0);
        length += hills.at(-1)!.x;
        for (const stretch of worldShapes(seed, world, 0)) shaped += (stretch.to - stretch.from) * (1 + FIRST_WORLD[stretch.shape] / 4);
        for (let i = 1; i < hills.length; i++) relief += Math.abs(hills[i].y - hills[i - 1].y);
        for (let x = 0; x < hills.at(-1)!.x; x += 10) {
          samples++;
          if (Math.abs(groundAt(hills, x).slope) > 1.2) steep++;
        }
      }
      return shaped / length + steep / samples + relief / length;
    };
    const early = Array.from({ length: 10 }, (_, i) => harshIndex(i + 1));
    const steps = early.slice(1).map((value, i) => value - early[i]);
    const mean = steps.reduce((sum, step) => sum + step, 0) / steps.length;
    for (const step of steps) {
      expect(step).toBeGreaterThan(0.3 * mean);
      expect(step).toBeLessThan(2.5 * mean);
    }
    const bumps = (world: number) => {
      let length = 0;
      let turns = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const hills = worldHills(seed, world, 0);
        length += hills.at(-1)!.x;
        turns += hills.length;
      }
      return turns / length;
    };
    const later = [10, 15, 20, 30].map(bumps);
    later.slice(1).forEach((value, i) => expect(value).toBeGreaterThan(later[i]));
    expect(later[3]).toBeGreaterThan(1.3 * later[0]);
    expect(harshIndex(30)).toBeGreaterThan(harshIndex(10));
  }, 60_000);

  test("diving that is always a little early or late runs out of daylight by world 2", () => {
    const through = (pilot: () => Pilot) => SEEDS.filter((seed) => reached(pilot(), seed) >= 3).length;
    expect(through(() => sloppy(0, 10))).toBe(0);
    expect(through(() => sloppy(0.3, 0))).toBe(0);
  }, 60_000);

  test("a perfect run finishes every world from 1 to 30 in time", () => {
    for (let world = 1; world <= 30; world++) {
      for (const seed of [1, 2, 3]) {
        const used = perfectRun(world, seed);
        expect(used, `world ${world}, seed ${seed}`).not.toBeNull();
        expect(used!).toBeLessThan(1);
      }
    }
  }, 240_000);

  test("a good run, with the odd late move, uses three quarters of the day or more from world 8 on, and a run with a few real mistakes mostly runs out of daylight", () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const world of [8, 15, 25]) {
      const used = seeds.map((seed) => finishWorld(world, seed, good(seed)) ?? 1).sort((a, b) => a - b);
      expect(used[1], `world ${world}`).toBeGreaterThan(0.75);
      const sloppyDone = seeds.filter((seed) => finishWorld(world, seed, withMistakes(good(seed), seed)) !== null).length;
      expect(sloppyDone, `world ${world}`).toBeLessThanOrEqual(2);
    }
    const first = seeds.map((seed) => finishWorld(1, seed, good(seed)));
    expect(first.every((used) => used !== null && used < 0.9)).toBe(true);
  }, 240_000);

  test("each odd shape first turns up in its own world, from world 2 to 7, then more often, and a perfect run gets over each", () => {
    expect(HILL_SHAPES.map((shape) => FIRST_WORLD[shape])).toEqual([2, 2, 2, 3, 3, 4, 5, 6, 7]);
    for (const seed of SEEDS) expect(worldShapes(seed, 1, 0)).toEqual([]);
    const share = (shape: (typeof HILL_SHAPES)[number], world: number) => {
      let length = 0;
      let shaped = 0;
      for (const seed of SEEDS) {
        length += worldHills(seed, world, 0).at(-1)!.x;
        for (const stretch of worldShapes(seed, world, 0)) if (stretch.shape === shape) shaped += stretch.to - stretch.from;
      }
      return shaped / length;
    };
    for (const shape of HILL_SHAPES) {
      expect(share(shape, FIRST_WORLD[shape] - 1)).toBe(0);
      expect(share(shape, FIRST_WORLD[shape])).toBeGreaterThan(0);
    }
    for (const shape of ["cliff", "uneven", "gorge", "jagged", "drop", "wall"] as const) {
      expect(share(shape, 20)).toBeGreaterThan(share(shape, FIRST_WORLD[shape]));
    }
    const over: Record<string, number> = {};
    const met: Record<string, number> = {};
    for (const seed of SEEDS.slice(0, 3)) {
      for (const world of [4, 8, 14]) {
        const pilot = reading();
        const stretches = worldShapes(seed, world, 0);
        let state = newGlider(seed, 2, world);
        let next = 0;
        while (!state.over && state.world === world) {
          const before = state;
          state = stepGlider(hold(state, pilot(state)), FRAME);
          while (next < stretches.length && before.x < stretches[next].to && state.x >= stretches[next].to) {
            const { shape } = stretches[next];
            met[shape] = (met[shape] ?? 0) + 1;
            if (Math.hypot(state.vx, state.vy) > 2 * GLIDER.minSpeed) over[shape] = (over[shape] ?? 0) + 1;
            next++;
          }
        }
      }
    }
    for (const shape of HILL_SHAPES.filter((shape) => met[shape])) {
      expect((over[shape] ?? 0) / met[shape], shape).toBeGreaterThanOrEqual(0.7);
    }
    expect(Object.keys(met).length).toBeGreaterThanOrEqual(7);
  }, 120_000);
});

describe("score", () => {
  test("is the distance in metres plus bonuses, and only goes up", () => {
    const { frames, state } = fly(autoHold, 2);
    let last = 0;
    for (const frame of frames) {
      expect(frame.score).toBe(Math.floor(frame.x / GLIDER.unitsPerPoint) + frame.bonus);
      expect(frame.score).toBeGreaterThanOrEqual(last);
      last = frame.score;
    }
    expect(gliderScore({ x: -5, bonus: 3 })).toBe(3);
    expect(
      scoreProblem(
        { runId: "run-swoop-1", game: "glider", score: state.score, durationMs: state.time * 1000, playedAt: Date.now() },
        Date.now()
      )
    ).toBeNull();
  });

  test("the server's limits sit above anything the rules allow, per second, and above any believable run in all", () => {
    const limit = SCORE_LIMITS[GAME_VERSION].glider;
    expect(GAME_VERSION).toBe(2);
    expect(worldBonus(3)).toBe(3 * GLIDER.worldPoints);
    expect(worldBonus(500)).toBe(worldBonus(GLIDER.pointedWorlds));
    expect(maxWorldScore(1000)).toBe(maxWorldScore(200));
    expect(maxGliderScore(15)).toBeLessThanOrEqual(limit.max);
    const worldBonusPerSecond = Math.max(
      ...Array.from({ length: 300 }, (_, i) => {
        const rules = worldRules(i + 1);
        return (worldBonus(rules.world) + rules.day * GLIDER.daylightPoints) / (rules.length / GLIDER.maxSpeed);
      })
    );
    const perSecond =
      GLIDER.maxSpeed / GLIDER.unitsPerPoint +
      (GLIDER.perfectPoints * GLIDER.maxStreak) / GLIDER.perfectAir +
      GLIDER.flightPoints / 0.5 +
      worldBonusPerSecond;
    expect(perSecond).toBeLessThanOrEqual(limit.perSecond);
    const pilot = reading();
    let state = newGlider(1, 2, 20);
    while (!state.over && state.world === 20) state = stepGlider(hold(state, pilot(state)), FRAME);
    expect(state.world).toBe(21);
    const fastest = state.score / state.time;
    expect(fastest).toBeLessThan(limit.perSecond / 2);
    const perWorld = state.score;
    expect(limit.max / perWorld).toBeGreaterThan(300);
    expect((limit.max / perWorld) * state.time).toBeGreaterThan(60 * 60);
  }, 60_000);
});

describe("the camera", () => {
  test("keeps the bird in view, in from the left, all run", () => {
    const { frames } = fly(practised, 3, () => false, 90);
    for (const frame of frames) {
      const view = viewSize(frame.aspect, frame.camera.zoom);
      const across = (frame.x - frame.camera.x) / view.width;
      expect(across).toBeCloseTo(VIEW.lead, 5);
      const up = (frame.y - frame.camera.y) / view.height;
      expect(up).toBeGreaterThan(0);
      expect(up).toBeLessThan(1);
    }
  }, 60_000);

  const inView = (camera: { y: number; zoom: number }, aspect: number, y: number) =>
    y >= camera.y && y <= camera.y + viewSize(aspect, camera.zoom).height;

  test("no run flies higher than the highest flight there can be", () => {
    for (const pilot of [practised, autoHold, never]) {
      const { frames } = fly(pilot, 5, () => false, 150);
      expect(Math.max(...frames.map((frame) => frame.y))).toBeLessThan(highestFlight());
    }
  }, 60_000);

  test("keeps the hills under the bird in view however high it flies, even before it has caught up", () => {
    const top = highestFlight();
    for (const aspect of [1.38, 1.8, 2.3]) {
      for (const world of [1, 6]) {
        const hills = worldHills(4, world, 0);
        for (let x = 0; x < hills.at(-1)!.x; x += 337) {
          const ground = groundAt(hills, x).y;
          for (let y = ground; y <= top + 1; y += Math.max(1, (top - ground) / 24)) {
            const state: GliderState = { ...newGlider(1, aspect), hills, worldEnd: 1e9, x, y, grounded: false, vx: 600, vy: 0 };
            const target = cameraTarget(state);
            expect(inView(target, aspect, ground)).toBe(true);
            expect(inView(target, aspect, y)).toBe(true);
            const next = stepGlider({ ...state, camera: { x: 0, y: ground - VIEW.margin, zoom: 1 } }, FRAME);
            expect(inView(next.camera, aspect, groundAt(hills, next.x).y)).toBe(true);
            expect(inView(next.camera, aspect, next.y)).toBe(true);
          }
        }
      }
    }
  }, 60_000);

  test("zooms smoothly, with the ground under the bird in view all run", () => {
    const { frames } = fly(practised, 3, () => false, 120);
    expect(Math.min(...frames.map((frame) => frame.camera.zoom))).toBeLessThan(0.7);
    frames.forEach((frame, i) => {
      expect(inView(frame.camera, frame.aspect, groundAt(frame.hills, frame.x).y)).toBe(true);
      if (i > 0) expect(Math.abs(Math.log(frame.camera.zoom / frames[i - 1].camera.zoom))).toBeLessThan(0.06);
    });
  }, 60_000);

  test("zooms out when the bird flies high, and not past its limit", () => {
    const low = onValley({ x: 400, y: 60 });
    const high = { ...low, y: 1400, grounded: false };
    expect(cameraTarget(low).zoom).toBe(1);
    expect(cameraTarget(high).zoom).toBeLessThan(1);
    expect(cameraTarget({ ...low, y: 1e6 }).zoom).toBe(VIEW.minZoom);
  });

  test("zooms to the same width on every supported board shape, so no shape sees further ahead", () => {
    const hills = worldHills(4, 6, 0);
    for (let x = 400; x < 9000; x += 977) {
      for (const height of [0, 300, 900]) {
        const widths = [1.38, 1.8, 2.3].map((aspect) => {
          const state: GliderState = { ...newGlider(1, aspect), hills, worldEnd: 1e9, x, y: groundAt(hills, x).y + height };
          return viewSize(aspect, cameraTarget(state).zoom).width;
        });
        for (const width of widths) expect(width).toBeCloseTo(widths[0], 6);
      }
    }
    expect(WIDEST_BOARD).toBeLessThan(2.35);
  });

  test("shows the same distance ahead on every board, and more sky and ground on a taller one", () => {
    for (const aspect of [1.38, 1.8, 2.3]) expect(viewSize(aspect, 1).width).toBe(VIEW.width);
    expect(viewSize(1.38, 1).height).toBeGreaterThan(viewSize(2.3, 1).height);
    expect(viewSize(760 / 334, 1).height).toBeCloseTo(440, -1);
    expect(viewSize(2, 0.5)).toEqual({ width: VIEW.width * 2, height: VIEW.width });
  });
});

describe("controls", () => {
  test("holding and letting go change nothing when already so, or after the run", () => {
    const state = newGlider(1);
    expect(hold(state, false)).toBe(state);
    expect(hold(state, true).heavy).toBe(true);
    const over = { ...state, over: true };
    expect(hold(over, true)).toBe(over);
    expect(stepGlider(over, FRAME)).toBe(over);
  });

  test("a new board shape changes the camera's shape, not the run", () => {
    const state = newGlider(1, 2);
    expect(resize(state, 2)).toBe(state);
    expect(resize(state, 0)).toBe(state);
    expect(resize(state, 0.6).aspect).toBe(0.6);
    // A finished run is never remade, or it would be recorded twice.
    const over = { ...state, over: true };
    expect(resize(over, 0.6)).toBe(over);
  });

  test("a long frame is split, so it lands the same as short ones", () => {
    const start = hold(newGlider(9), true);
    let short = start;
    for (let i = 0; i < 6; i++) short = stepGlider(short, FRAME / 2);
    const long = stepGlider(start, FRAME * 3);
    expect(long.x).toBeCloseTo(short.x, 3);
  });
});

/* eslint-disable no-restricted-syntax -- the colour maths is checked on plain black, red and white, not the app's palette */
describe("sky colours", () => {
  const STOPS = [
    [0, "#000000"],
    [0.5, "#ff0000"],
    [1, "#ffffff"],
  ] as const;

  test("blend between two colours", () => {
    expect(blend("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(blend("#102030", "#102030", 0.3)).toBe("#102030");
    expect(blend("#000000", "#ffffff", 2)).toBe("#ffffff");
  });

  test("follow the stops through the day", () => {
    expect(colourAt(STOPS, 0)).toBe("#000000");
    expect(colourAt(STOPS, 0.25)).toBe("#800000");
    expect(colourAt(STOPS, 0.75)).toBe("#ff8080");
    expect(colourAt(STOPS, 1)).toBe("#ffffff");
    expect(colourAt(STOPS, 1.5)).toBe("#ffffff");
    expect(colourAt(STOPS, -1)).toBe("#000000");
  });
});
/* eslint-enable no-restricted-syntax */

describe("previews", () => {
  test("each shows its moment", () => {
    expect(GLIDER_PREVIEWS.every(isGliderPreview)).toBe(true);
    expect(isGliderPreview("double")).toBe(false);
    const dive = previewGlider("dive");
    expect(dive.heavy && dive.grounded).toBe(true);
    expect(groundAt(dive.hills, dive.x).slope).toBeLessThan(0);
    const launch = previewGlider("launch");
    expect(launch.grounded).toBe(false);
    expect(launch.vy).toBeGreaterThan(0);
    const high = previewGlider("high");
    expect(high.grounded).toBe(false);
    expect(high.y - groundAt(high.hills, high.x).y).toBeGreaterThan(400);
    expect(high.vy).toBeLessThan(0);
    const world = previewGlider("world");
    expect(world.world).toBe(2);
    expect(world.popups.some((p) => p.kind === "world")).toBe(true);
    for (const [kind, number] of [["world3", 3], ["world6", 6]] as const) {
      const later = previewGlider(kind);
      expect(later.world).toBe(number);
      expect(later.daylight).toBeLessThan(worldRules(number).day);
      expect(later.x).toBeGreaterThan(0);
    }
    const night = previewGlider("night");
    expect(night.over && night.ended === "night").toBe(true);
  });
});

describe("the sun and the far hills", () => {
  test("the sun only moves forward or holds still in a world, even when good flying wins daylight back", () => {
    let state = newGlider(2, 2);
    let won = 0;
    for (let i = 0; i < 60 * 120 && !state.over; i++) {
      const before = state;
      state = stepGlider(hold(state, practised(state)), FRAME);
      if (state.world !== before.world) {
        expect(state.daySeen).toBeLessThan(0.05);
        continue;
      }
      if (dayProgress(state) < dayProgress(before)) won++;
      expect(state.daySeen).toBeGreaterThanOrEqual(before.daySeen);
      expect(state.daySeen).toBeGreaterThanOrEqual(dayProgress(state));
      expect(state.daySeen - before.daySeen).toBeLessThan(0.01);
    }
    expect(won).toBeGreaterThan(0);
  }, 60_000);

  test("the far hills slide the way the ground does, much slower, the farther ones slowest, whatever the zoom", () => {
    for (const layer of ["far", "near"] as const) {
      expect(parallaxShift(1000, layer)).toBeGreaterThan(parallaxShift(0, layer));
      expect(parallaxShift(2000, layer) - parallaxShift(1000, layer)).toBeCloseTo(parallaxShift(1000, layer) - parallaxShift(0, layer));
      expect(parallaxShift(1000, layer)).toBeLessThan(100);
    }
    expect(parallaxShift(1000, "far")).toBeLessThan(parallaxShift(1000, "near"));
  });
});


import { describe, expect, test } from "vitest";
import { CURRENT_GAME_VERSION, SCORE_LIMITS, scoreProblem } from "../../../shared/games";
import { random } from "./random";
import {
  autoHold,
  blend,
  cameraTarget,
  cloudAltitude,
  colourAt,
  dayProgress,
  dayLength,
  difficulty,
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
  islandPalette,
  land,
  leavesGround,
  localPeak,
  lowestGround,
  maxFlightAltitude,
  maxGliderScore,
  maxWorldScore,
  parallaxShift,
  terrainLod,
  worldAtX,
  WIDEST_BOARD,
  newGlider,
  previewGlider,
  resize,
  stepGlider,
  viewSize,
  VIEW,
  worldBonus,
  levelSwing,
  shapeChance,
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
const farSighted = () => lookahead(PAIRS, 30, 4);
const steady = () => lookahead(PAIRS, 45, 4);
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

const perfectRun = (world: number, seed: number) =>
  finishWorld(world, seed, reading()) ??
  finishWorld(world, seed, careful()) ??
  finishWorld(world, seed, farSighted()) ??
  finishWorld(world, seed, steady());

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

  test("go hilltop, valley, hilltop, with flat tops and floors, inside the world's floor and ceiling raised or lowered by its swing", () => {
    for (const world of [1, 3, 6, 12, 30]) {
      const hills = worldHills(11, world, 0);
      hills.forEach((point, i) => {
        const room = levelSwing(world) + 40 * world;
        expect(point.y).toBeGreaterThanOrEqual(GLIDER.floor - room);
        expect(point.y).toBeLessThanOrEqual(GLIDER.ceiling + room);
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
  test("difficulty follows a pure logarithmic curve from day 1 through day 8 (1× old day 10) to a 3× plateau at day 32", () => {
    const steps = (pick: (world: number) => number, from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => pick(from + i + 1) - pick(from + i));
    const diffs = steps(difficulty, 1, 32);
    expect(diffs.every((d) => d > 0)).toBe(true);
    // Purely logarithmic: strictly positive and strictly decreasing increments from day 1 to day 32.
    for (let i = 1; i < diffs.length; i++) expect(diffs[i]).toBeLessThan(diffs[i - 1]);
    // Plateaus cleanly from day 32 onward.
    for (const world of [33, 40, 60]) expect(difficulty(world)).toBeCloseTo(difficulty(32), 9);
    expect(harshness(1)).toBe(0);
    expect(harshness(HARDEST_WORLD)).toBeCloseTo(1, 6);
    expect(harshness(32)).toBeCloseTo(3, 6);
    expect(levelSwing(8)).toBeGreaterThan(levelSwing(1));
    expect(levelSwing(32)).toBeGreaterThan(levelSwing(16));
    for (const pick of [
      (w: number) => worldRules(w).span,
      (w: number) => worldRules(w).drop,
      (w: number) => worldRules(w).steepest,
      (w: number) => worldRules(w).tolerance,
      (w: number) => worldRules(w).squeeze,
      (w: number) => worldRules(w).bumpiness,
    ]) {
      const all = steps(pick, 1, 40);
      expect(all[0]).not.toBe(0);
      expect(all.every((step) => Math.sign(step) === Math.sign(all[0]) || step === 0)).toBe(true);
    }
    expect(worldRules(HARDEST_WORLD).steepest).toBeCloseTo(GLIDER.maxSlope, 6);
    expect(worldRules(1).oddity).toBe(0);
    for (let world = 1; world < 40; world++) expect(worldRules(world + 1).oddity).toBeGreaterThanOrEqual(worldRules(world).oddity);
    expect(worldRules(8).oddity).toBeGreaterThan(0.7);
    expect(worldRules(32).oddity).toBeGreaterThan(0.9);
    expect(worldRules(32).oddity).toBeLessThanOrEqual(0.97);
    for (let world = 1; world < 60; world++) expect(worldRules(world).length / worldRules(world).day).toBeLessThan(GLIDER.maxSpeed);
    expect(worldRules(0)).toEqual(worldRules(1));
  });

  test("the day starts at 35 s, hits 20 s at day 8, and curves logarithmically down to 15 s at day 32, then stays there", () => {
    const days = Array.from({ length: 60 }, (_, i) => dayLength(i + 1));
    expect(days[0]).toBe(35);
    expect(FLOOR_DAY).toBe(15);
    expect(days[7]).toBe(20);
    expect(days[31]).toBe(FLOOR_DAY);
    expect(days[27]).toBeGreaterThan(FLOOR_DAY);
    expect(days.slice(31).every((day) => day === FLOOR_DAY)).toBe(true);
    for (let world = 2; world <= 32; world++) expect(days[world - 1]).toBeLessThanOrEqual(days[world - 2]);
    expect(days[0] - days[1]).toBeGreaterThan(days[9] - days[10]);
    expect(days[1]).toBeCloseTo(29.3, 1);
    expect(days[3]).toBeCloseTo(24.2, 1);
    expect(days[15]).toBeCloseTo(16.8, 1);
    for (let world = 1; world <= 60; world++) expect(worldRules(world).day).toBe(dayLength(world));
  });

  test("world 1 is gentle and not much longer than before, and worlds get shorter from world 9 as the ground gets harder", () => {
    expect(worldLength(1)).toBeLessThan(1.7 * 8_938);
    for (let world = 9; world < 40; world++) expect(worldLength(world + 1)).toBeLessThanOrEqual(worldLength(world));
    expect(worldLength(30)).toBeLessThan(worldLength(10));
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

  const OVER = 450;
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
  test("diving down each slope and letting go in time, as a practised player does, carries the bird over world 1's first two hills on nearly every seed", () => {
    const over = SEEDS.filter((seed) => crestSpeeds(practised, seed, 2).every((speed) => speed > OVER));
    expect(over.length).toBeGreaterThanOrEqual(SEEDS.length - 1);
  });

  test("the same flying carries it over at least four of world 1's first five hills", () => {
    for (const seed of SEEDS) {
      expect(crestSpeeds(practised, seed, 5).filter((speed) => speed > OVER).length).toBeGreaterThanOrEqual(4);
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

  test("perfect landings and long flights never pause or rewind daylight progression", () => {
    const { frames } = fly(practised, 2, (state) => state.world > 1);
    const firstWorld = frames.filter((frame) => frame.world === 1);
    expect(firstWorld.some((frame) => frame.perfects > 0)).toBe(true);
    for (let i = 1; i < firstWorld.length; i++) {
      expect(firstWorld[i].regained).toBe(0);
      expect(firstWorld[i].daylight).toBeLessThan(firstWorld[i - 1].daylight);
    }
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
    expect(next.popups.some((p) => p.kind === "world" && p.text.startsWith("Day 1 done"))).toBe(true);
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
    const gaps = [1, 6, 11].map(crestGap);
    gaps.slice(1).forEach((gap, i) => expect(gap).toBeLessThan(gaps[i]));
    expect(gaps[0]).toBeGreaterThan(1.2 * gaps[2]);
    for (const world of [13, 20, 50]) expect(worldRules(world).span).toBe(worldRules(12).span);
  });

  test("the ground gets harsher logarithmically from day 1 through day 8 and keeps escalating to the day 32 plateau", () => {
    const harshIndex = (world: number) => {
      let length = 0;
      let shaped = 0;
      let relief = 0;
      let steep = 0;
      let samples = 0;
      let rise = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const hills = worldHills(seed, world, 0);
        length += hills.at(-1)!.x;
        rise += Math.max(...hills.map((point) => point.y)) - Math.min(...hills.map((point) => point.y));
        for (const stretch of worldShapes(seed, world, 0)) shaped += (stretch.to - stretch.from) * (1 + FIRST_WORLD[stretch.shape] / 4);
        for (let i = 1; i < hills.length; i++) relief += Math.abs(hills[i].y - hills[i - 1].y);
        for (let x = 0; x < hills.at(-1)!.x; x += 10) {
          samples++;
          if (Math.abs(groundAt(hills, x).slope) > 1.2) steep++;
        }
      }
      return shaped / length + steep / samples + relief / length + rise / 40 / 500;
    };
    const early = Array.from({ length: 8 }, (_, i) => harshIndex(i + 1));
    const steps = early.slice(1).map((value, i) => value - early[i]);
    const mean = steps.reduce((sum, step) => sum + step, 0) / steps.length;
    expect(mean).toBeGreaterThan(0.15);
    expect(early[7]).toBeGreaterThan(early[0] + 1.5);
    expect(early[3]).toBeGreaterThan(early[0] + 0.45);
    const later = [8, 16, 32].map(harshIndex);
    expect(later[1]).toBeGreaterThan(later[0]);
    expect(later[2]).toBeGreaterThan(later[1]);
    const range = (world: number) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const heights = worldHills(seed, world, 0).map((point) => point.y);
        total += Math.max(...heights) - Math.min(...heights);
      }
      return total / 40;
    };
    expect(range(16)).toBeGreaterThan(1.7 * range(1));
    expect(range(32)).toBeGreaterThan(range(16) * 1.1);
  }, 60_000);

  test("diving a little early still gets through world 1 on nearly every seed, diving a little late every time doesn't, and neither gets past world 5", () => {
    const early = SEEDS.map((seed) => reached(sloppy(0.3, 0), seed));
    const late = SEEDS.map((seed) => reached(sloppy(0, 10), seed));
    expect(early.filter((world) => world >= 2).length).toBeGreaterThanOrEqual(SEEDS.length - 2);
    expect(late.filter((world) => world === 1).length).toBeGreaterThanOrEqual(SEEDS.length / 2);
    expect(Math.max(...early, ...late)).toBeLessThanOrEqual(5);
  }, 60_000);

  // One test per world: as one test, all 30 took 172-230 s on CI against a
  // 240 s limit, and timed out now and then.
  test.each(Array.from({ length: 30 }, (_, i) => i + 1))("a perfect run finishes world %i in time", (world) => {
    for (const seed of [1, 2, 3]) {
      const used = perfectRun(world, seed);
      expect(used, `world ${world}, seed ${seed}`).not.toBeNull();
      expect(used!).toBeLessThan(1);
    }
  }, 60_000);

  test("in the middle worlds a good run, with the odd late move, uses most of the day, and a run with a few real mistakes mostly runs out of daylight", () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const world of [8, 12, 15]) {
      const used = seeds
        .map((seed) => finishWorld(world, seed, good(seed)))
        .filter((share): share is number => share !== null)
        .sort((a, b) => a - b);
      expect(used.length, `world ${world}`).toBeGreaterThanOrEqual(3);
      expect(used[1], `world ${world}`).toBeGreaterThan(0.7);
      const sloppyDone = seeds.filter((seed) => finishWorld(world, seed, withMistakes(good(seed), seed)) !== null).length;
      expect(sloppyDone, `world ${world}`).toBeLessThanOrEqual(2);
    }
    const first = seeds.map((seed) => finishWorld(1, seed, good(seed)));
    expect(first.every((used) => used !== null && used < 0.9)).toBe(true);
  }, 240_000);

  test("day 1 is smooth rolling waves; mountain shapes unlock progressively from day 2 to day 8 and stay clearable", () => {
    expect(HILL_SHAPES).toEqual(["uneven", "double", "plateau", "ramp", "gorge", "wall", "drop", "cliff", "jagged"]);
    for (const seed of SEEDS) expect(worldShapes(seed, 1, 0)).toEqual([]);
    for (const shape of HILL_SHAPES) {
      expect(shapeChance(shape, FIRST_WORLD[shape] - 1)).toBe(0);
      expect(shapeChance(shape, FIRST_WORLD[shape])).toBeGreaterThan(0);
    }
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
    const over: Record<string, number> = {};
    const met: Record<string, number> = {};
    for (const seed of SEEDS.slice(0, 3)) {
      for (const world of [3, 6, 9, 12]) {
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
    for (const shape of HILL_SHAPES) {
      expect(met[shape]).toBeGreaterThan(0);
      expect((over[shape] ?? 0) / met[shape], shape).toBeGreaterThanOrEqual(0.5);
    }
  }, 120_000);
});

describe("Tiny Wings fever, cloud ceiling, and terrain LOD", () => {
  test("3 good swoops trigger Gold Fever, 3 more consecutive Fevers trigger Purple Double Fever, and a rough bump ends it", () => {
    const downX = 120;
    const downGround = groundAt(VALLEY, downX);
    const makePerfectTouchdown = (base: GliderState): GliderState => {
      const speed = 700;
      const len = Math.hypot(1, downGround.slope);
      return stepGlider(
        {
          ...base,
          x: downX,
          y: downGround.y + 1,
          vx: speed / len,
          vy: (speed * downGround.slope) / len - 80,
          grounded: false,
          air: 0.6,
          heavy: true,
        },
        FRAME
      );
    };
    let state = onValley({});
    expect(state.fever).toBe(false);
    expect(state.feverLevel).toBe(0);
    const daylightStart = state.daylight;
    state = makePerfectTouchdown(state);
    expect(state.streak).toBe(1);
    expect(state.feverLevel).toBe(0);
    // Normal swoops do not pause or rewind daylight progression either.
    expect(state.daylight).toBeLessThan(daylightStart);
    state = makePerfectTouchdown(state);
    expect(state.streak).toBe(2);
    expect(state.feverLevel).toBe(0);
    state = makePerfectTouchdown(state);
    expect(state.streak).toBe(3);
    expect(state.fever).toBe(true);
    expect(state.feverLevel).toBe(1);
    expect(state.popups.some((p) => p.kind === "fever" && p.text === "Fever!")).toBe(true);
    // 3 consecutive Fever swoops (4, 5, 6) upgrade into Purple Double Fever.
    const daylightBefore = state.daylight;
    state = makePerfectTouchdown(state);
    expect(state.streak).toBe(4);
    expect(state.feverLevel).toBe(1);
    expect(state.daylight).toBeLessThan(daylightBefore);
    state = makePerfectTouchdown(state);
    expect(state.streak).toBe(5);
    expect(state.feverLevel).toBe(1);
    state = makePerfectTouchdown(state);
    expect(state.streak).toBe(6);
    expect(state.fever).toBe(true);
    expect(state.feverLevel).toBe(2);
    expect(state.popups.some((p) => p.kind === "doubleFever" && p.text === "Double Fever!")).toBe(true);

    // Speed progression: normal < Gold Fever < Purple Double Fever.
    expect(GLIDER.feverMaxSpeed).toBeGreaterThan(GLIDER.maxSpeed);
    expect(GLIDER.doubleFeverMaxSpeed).toBeGreaterThan(GLIDER.feverMaxSpeed);
    const normalRun = onValley({ x: 80, y: groundAt(VALLEY, 80).y, speed: GLIDER.maxSpeed, fever: false, feverLevel: 0, heavy: true });
    const feverRun = onValley({ x: 80, y: groundAt(VALLEY, 80).y, speed: GLIDER.maxSpeed, fever: true, feverLevel: 1, heavy: true });
    const doubleRun = onValley({ x: 80, y: groundAt(VALLEY, 80).y, speed: GLIDER.feverMaxSpeed, fever: true, feverLevel: 2, heavy: true });
    let normalNext = normalRun;
    let feverNext = feverRun;
    let doubleNext = doubleRun;
    for (let i = 0; i < 20; i++) {
      normalNext = stepGlider(normalNext, FRAME);
      feverNext = stepGlider(feverNext, FRAME);
      doubleNext = stepGlider(doubleNext, FRAME);
    }
    expect(normalNext.speed).toBeLessThanOrEqual(GLIDER.maxSpeed);
    expect(feverNext.speed).toBeGreaterThan(GLIDER.maxSpeed);
    expect(feverNext.speed).toBeLessThanOrEqual(GLIDER.feverMaxSpeed);
    expect(doubleNext.speed).toBeGreaterThan(GLIDER.feverMaxSpeed);
    expect(doubleNext.trail.length).toBeGreaterThan(0);

    // Slamming onto an upslope triggers a bump and ends Double Fever.
    const upX = 520;
    const upGround = groundAt(VALLEY, upX);
    const bumped = stepGlider(
      {
        ...doubleNext,
        x: upX,
        y: upGround.y + 1,
        vx: 700,
        vy: -600,
        grounded: false,
        air: 0.6,
        heavy: true,
      },
      FRAME
    );
    expect(bumped.fever).toBe(false);
    expect(bumped.feverLevel).toBe(0);
    expect(bumped.streak).toBe(0);
    expect(bumped.trail).toEqual([]);
  });

  test("cloud arc triggers on strong launches, slows parabola progression without losing horizontal speed, and only applies gradual pickup after Cloudtouch", () => {
    // A normal flight below the clouds keeps cloudPace === 1 and zero cloud exit pickup.
    let normal = onValley({ x: 200, y: 260, vx: 650, vy: 620, grounded: false, heavy: false });
    for (let i = 0; i < 240 && !normal.grounded; i++) {
      normal = stepGlider(normal, FRAME);
      expect(normal.cloudTouched).toBe(false);
      expect(normal.cloudPace).toBe(1);
      expect(normal.cloudExitBoost).toBe(0);
    }

    const runCloudEntry = (vx: number, vy: number) => {
      let state = onValley({ x: 200, y: 300, vx, vy, grounded: false, heavy: false });
      const peak = localPeak(state.hills, state.x);
      let maxY = state.y;
      let sawCloudPopup = false;
      let cloudFrames = 0;
      let minCloudPace = 1;
      let paceAtExit = 1;
      let paceAfterExit = 1;
      let speedAtExit = 0;
      let speedAfterExit = 0;
      let minVxInCloud = Infinity;
      let exitFrames = -1;
      let wasAbove = false;
      let entryVyBefore = 0;
      let entryVyAfter = 0;
      let regainedInAir = 0;
      const startDaylight = state.daylight;
      let daylightAtCloud = 0;
      let timeAtCloud = 0;
      for (let i = 0; i < 420 && !state.grounded; i++) {
        const prevVy = state.vy * state.cloudPace;
        state = stepGlider(state, FRAME);
        maxY = Math.max(maxY, state.y);
        expect(state.y).toBeLessThan(maxFlightAltitude(state.peakRef));
        const above = state.y >= cloudAltitude(state.peakRef);
        if (!wasAbove && above && entryVyBefore === 0) {
          entryVyBefore = prevVy;
          entryVyAfter = state.vy * state.cloudPace;
          regainedInAir = state.regained;
          daylightAtCloud = state.daylight;
          timeAtCloud = state.time;
        }
        if (above) {
          cloudFrames += 1;
          minCloudPace = Math.min(minCloudPace, state.cloudPace);
          minVxInCloud = Math.min(minVxInCloud, state.vx);
        }
        if (wasAbove && !above && exitFrames < 0) {
          paceAtExit = state.cloudPace;
          speedAtExit = Math.hypot(state.vx, state.vy * state.cloudPace);
          exitFrames = 0;
        } else if (exitFrames >= 0) {
          exitFrames += 1;
          if (exitFrames === 40) {
            paceAfterExit = state.cloudPace;
            speedAfterExit = Math.hypot(state.vx, state.vy * state.cloudPace);
          }
        }
        wasAbove = above;
        if (state.popups.some((p) => p.kind === "cloud")) sawCloudPopup = true;
      }
      return {
        state,
        peak,
        maxY,
        sawCloudPopup,
        cloudSeconds: cloudFrames * FRAME,
        minCloudPace,
        paceAtExit,
        paceAfterExit,
        speedAtExit,
        speedAfterExit,
        minVxInCloud,
        entryVyBefore,
        entryVyAfter,
        startDaylight,
        regainedInAir,
        daylightAtCloud,
        timeAtCloud,
      };
    };
    const gentle = runCloudEntry(620, 1020);
    const fast = runCloudEntry(1020, 1220);
    expect(gentle.maxY).toBeGreaterThan(cloudAltitude(gentle.peak) + 20);
    expect(fast.maxY).toBeGreaterThan(gentle.maxY);
    expect(fast.maxY).toBeLessThan(maxFlightAltitude(fast.peak));
    expect(fast.state.cloudTouches).toBe(1);
    expect(fast.sawCloudPopup).toBe(true);
    // Cloudtouch never pauses daylight progression.
    expect(fast.regainedInAir).toBe(0);
    expect(fast.daylightAtCloud).toBeCloseTo(fast.startDaylight - fast.timeAtCloud, 3);
    // Entering the clouds has no abrupt velocity drop (continuous upward slope across cloudY).
    expect(fast.entryVyAfter).toBeGreaterThan(fast.entryVyBefore * 0.9);
    // Horizontal speed stays full in the clouds (only vertical parabola progression slows).
    expect(fast.minVxInCloud).toBeGreaterThan(850);
    expect(fast.minCloudPace).toBeLessThan(0.75);
    // Faster entries float in the clouds noticeably longer.
    expect(fast.cloudSeconds).toBeGreaterThan(gentle.cloudSeconds + 0.25);
    expect(fast.cloudSeconds).toBeGreaterThan(1.1);
    // Dropping back below the clouds gradually ramps cloudPace back toward 1 and builds descent speed.
    expect(fast.paceAfterExit).toBeGreaterThan(fast.paceAtExit + 0.1);
    expect(fast.speedAfterExit).toBeGreaterThan(fast.speedAtExit + 80);
  });

  test("islandPalette never repeats colours across worlds and worldAtX splits colours at the finish flag", () => {
    /* eslint-disable no-restricted-syntax -- test stub palette for non-repeating check */
    const stub = [
      { farHill: "#111111", nearHill: "#222222", ground: "#333333", grass: "#444444" },
      { farHill: "#555555", nearHill: "#666666", ground: "#777777", grass: "#888888" },
    ] as const;
    /* eslint-enable no-restricted-syntax */
    const grounds = new Set(Array.from({ length: 40 }, (_, i) => islandPalette(i + 1, stub).ground));
    expect(grounds.size).toBe(40);
    // Before worldStart stays the previous world; after worldEnd is already the next world.
    expect(worldAtX(999, 2, 1000, 5000)).toBe(1);
    expect(worldAtX(1000, 2, 1000, 5000)).toBe(2);
    expect(worldAtX(4999, 2, 1000, 5000)).toBe(2);
    expect(worldAtX(5000, 2, 1000, 5000)).toBe(3);
    expect(worldAtX(-100, 1, 0, 5000)).toBe(1);
  });

  test("terrainLod coarsens strips as zoom drops so rendered chunk views stay bounded", () => {
    const close = terrainLod(1);
    const mid = terrainLod(0.5);
    const far = terrainLod(0.25);
    expect(close.strip).toBeLessThan(mid.strip);
    expect(mid.strip).toBeLessThan(far.strip);
    for (const zoom of [1, 0.7, 0.5, 0.35, 0.2]) {
      const lod = terrainLod(zoom);
      const viewWidth = VIEW.width / zoom;
      const chunks = Math.ceil(viewWidth / lod.chunk) + 2;
      const totalViews = chunks * lod.chunkStrips * 3;
      expect(totalViews).toBeLessThan(650);
    }
  });
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
    const version = CURRENT_GAME_VERSION.glider;
    const limit = SCORE_LIMITS[version].glider;
    expect(version).toBe(3);
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
    const flown = (pilot: Pilot) => {
      let run = newGlider(1, 2, 20);
      while (!run.over && run.world === 20) run = stepGlider(hold(run, pilot(run)), FRAME);
      return run;
    };
    const first = flown(reading());
    const state = first.world === 21 ? first : flown(careful());
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
      for (const frame of frames) expect(frame.y).toBeLessThan(highestFlight(Math.max(...frame.hills.map((point) => point.y))));
    }
  }, 60_000);

  test("aims to show the hills under the bird whenever they fit at the widest zoom, and keeps the bird in view however high it flies, even before it has caught up", () => {
    for (const aspect of [1.38, 1.8, 2.3]) {
      for (const world of [1, 6, 20]) {
        const hills = worldHills(4, world, 0);
        for (let x = 0; x < hills.at(-1)!.x; x += 337) {
          const ground = groundAt(hills, x).y;
          const top = highestFlight(Math.max(ground, ...hills.filter((point) => point.x > x - 2500 && point.x <= x).map((point) => point.y)));
          for (let y = ground; y <= top + 1; y += Math.max(1, (top - ground) / 24)) {
            const state: GliderState = { ...newGlider(1, aspect), hills, worldEnd: 1e9, x, y, grounded: false, vx: 600, vy: 0 };
            const target = cameraTarget(state);
            const fits = y + GLIDER.radius * 2 + VIEW.margin - (ground - VIEW.footing) <= viewSize(aspect, VIEW.minZoom).height;
            if (fits) expect(inView(target, aspect, ground)).toBe(true);
            expect(inView(target, aspect, y)).toBe(true);
            const next = stepGlider({ ...state, camera: { x: 0, y: ground - VIEW.margin, zoom: 1 } }, FRAME);
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
  test("the sun moves strictly forward through every world without pausing on swoops", () => {
    let state = newGlider(2, 2);
    for (let i = 0; i < 60 * 120 && !state.over; i++) {
      const before = state;
      state = stepGlider(hold(state, practised(state)), FRAME);
      if (state.world !== before.world) {
        expect(state.daySeen).toBeLessThan(0.05);
        continue;
      }
      expect(dayProgress(state)).toBeGreaterThan(dayProgress(before));
      expect(state.daySeen).toBeCloseTo(dayProgress(state), 6);
      expect(state.daySeen - before.daySeen).toBeLessThan(0.01);
    }
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


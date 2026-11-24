import { describe, expect, test } from "vitest";
import { SCORE_LIMITS, scoreProblem } from "../../../shared/games";
import {
  autoHold,
  blend,
  cameraTarget,
  colourAt,
  dayProgress,
  GLIDER,
  GLIDER_PREVIEWS,
  gliderScore,
  groundAt,
  highestFlight,
  hold,
  isGliderPreview,
  land,
  lastReachableWorld,
  leavesGround,
  lowestGround,
  maxGliderScore,
  newGlider,
  previewGlider,
  resize,
  stepGlider,
  viewSize,
  VIEW,
  worldHills,
  worldProgress,
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

  test("go hilltop, valley, hilltop, inside the world's floor and ceiling", () => {
    const hills = worldHills(11, 6, 0);
    hills.forEach((point, i) => {
      expect(point.y).toBeGreaterThanOrEqual(GLIDER.floor);
      expect(point.y).toBeLessThanOrEqual(GLIDER.ceiling);
      if (i === 0) return;
      expect(point.x).toBeGreaterThan(hills[i - 1].x);
      // Even points are hilltops, odd ones valleys.
      expect(Math.sign(point.y - hills[i - 1].y)).toBe(i % 2 === 1 ? -1 : 1);
    });
  });

  test("are smooth: no jumps, no corners, and never steeper than the limit", () => {
    for (const world of [1, 4, 9, 20]) {
      const hills = worldHills(5, world, 0);
      const end = hills.at(-1)!.x;
      let previous = groundAt(hills, 0);
      for (let x = 1; x <= end; x += 1) {
        const ground = groundAt(hills, x);
        expect(Math.abs(ground.y - previous.y)).toBeLessThan(GLIDER.maxSlope + 0.01);
        expect(Math.abs(ground.slope - previous.slope)).toBeLessThan(0.05);
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
  test("longer, steeper and bumpier, with a shorter day and a smaller margin for a perfect landing", () => {
    for (let world = 1; world < 30; world++) {
      const now = worldRules(world);
      const next = worldRules(world + 1);
      expect(next.length).toBeGreaterThan(now.length);
      expect(next.day).toBeLessThanOrEqual(now.day);
      expect(next.length / next.day).toBeGreaterThan(now.length / now.day);
      expect(next.span).toBeLessThanOrEqual(now.span);
      expect(next.drop).toBeGreaterThanOrEqual(now.drop);
      expect(next.bumpiness).toBeGreaterThanOrEqual(now.bumpiness);
      expect(next.squeeze).toBeGreaterThanOrEqual(now.squeeze);
      expect(next.tolerance).toBeLessThanOrEqual(now.tolerance);
    }
    expect(worldRules(0)).toEqual(worldRules(1));
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
    // But no higher than its climb lets it get against the bird's weight.
    expect(highest - launched!.y).toBeLessThanOrEqual(launched!.vy ** 2 / (2 * GLIDER.lightGravity));
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
  test("simple diving finishes the first world and night falls in the second", () => {
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
    expect(state.world).toBe(2);
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

  test("practised flying, timing dives and flights, gets several worlds further", () => {
    const { state } = fly(practised, 1, () => false, 400);
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

  test("the server's limits sit above anything the rules allow", () => {
    expect(lastReachableWorld()).toBeGreaterThan(5);
    expect(lastReachableWorld()).toBeLessThan(100);
    const best = maxGliderScore();
    expect(best).toBeLessThanOrEqual(SCORE_LIMITS.glider.max);
    expect(best).toBeGreaterThan(SCORE_LIMITS.glider.max / 3);
    // Points a second: top speed's distance, a perfect landing on every
    // shortest flight at the top streak, a long flight's points for all of it,
    // and a world's bonus in the least time it can be crossed.
    const worldBonus = Math.max(
      ...Array.from({ length: lastReachableWorld() }, (_, i) => {
        const rules = worldRules(i + 1);
        return (GLIDER.worldPoints * rules.world + rules.day * GLIDER.daylightPoints) / (rules.length / GLIDER.maxSpeed);
      })
    );
    const perSecond =
      GLIDER.maxSpeed / GLIDER.unitsPerPoint +
      (GLIDER.perfectPoints * GLIDER.maxStreak) / GLIDER.perfectAir +
      GLIDER.flightPoints / 0.5 +
      worldBonus;
    expect(perSecond).toBeLessThanOrEqual(SCORE_LIMITS.glider.perSecond);
  });
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
    for (const aspect of [0.46, 1, 2, 2.4]) {
      for (const world of [1, 6]) {
        const hills = worldHills(4, world, 0);
        for (let x = 0; x < hills.at(-1)!.x; x += 337) {
          const ground = groundAt(hills, x).y;
          for (let y = ground; y <= top + 1; y += Math.max(1, (top - ground) / 24)) {
            const state: GliderState = { ...newGlider(1, aspect), hills, worldEnd: 1e9, x, y, grounded: false, vx: 600, vy: 0 };
            const target = cameraTarget(state);
            expect(inView(target, aspect, ground)).toBe(true);
            expect(inView(target, aspect, y)).toBe(true);
            // The camera still close in on the ground, a frame before the bird is this high.
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

  test("shows more across on a wide board, and at least its least on a narrow one", () => {
    expect(viewSize(2, 1)).toEqual({ width: VIEW.height * 2, height: VIEW.height });
    expect(viewSize(0.5, 1).width).toBeCloseTo(VIEW.minWidth, 6);
    expect(viewSize(2, 0.5).height).toBe(VIEW.height * 2);
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
    const world = previewGlider("world");
    expect(world.world).toBe(2);
    expect(world.popups.some((p) => p.kind === "world")).toBe(true);
    const night = previewGlider("night");
    expect(night.over && night.ended === "night").toBe(true);
  });
});

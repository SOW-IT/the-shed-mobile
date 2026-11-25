import { describe, expect, test } from "vitest";
import {
  autoHold,
  farHillTiles,
  GLIDER,
  groundAt,
  hold,
  newGlider,
  parallaxAnchor,
  parallaxShift,
  stepGlider,
  viewSize,
  VIEW,
  type GliderState,
} from "./glider";

const FRAME = 1 / 60;
const BOARD = { width: 760, height: 334 };
const ASPECT = BOARD.width / BOARD.height;
const STEADY_PX = BOARD.width / VIEW.width;
const LAYERS = [
  { layer: "far", size: BOARD.height * 0.42 },
  { layer: "near", size: BOARD.height * 0.32 },
] as const;

const throughTwoWorlds = () => {
  let state = newGlider(4, ASPECT, 1);
  const frames: GliderState[] = [state];
  while (state.world < 4 && frames.length < 60 * 240) {
    state = stepGlider(hold({ ...state, daylight: Math.max(state.daylight, 5) }, autoHold(state)), FRAME);
    frames.push(state);
  }
  return frames;
};

const frames = throughTwoWorlds();

const throughBigSwing = () => {
  let state = newGlider(2, ASPECT, 20);
  const swing: GliderState[] = [state];
  while (state.world === 20 && swing.length < 60 * 240) {
    state = stepGlider(hold({ ...state, daylight: Math.max(state.daylight, 5) }, autoHold(state)), FRAME);
    swing.push(state);
  }
  return swing;
};

const bigSwing = throughBigSwing();

const throughDay = (day: number) => {
  let state = newGlider(3, ASPECT, day);
  const run: GliderState[] = [state];
  while (state.world === day && run.length < 60 * 240) {
    state = stepGlider(hold({ ...state, daylight: Math.max(state.daylight, 5) }, autoHold(state)), FRAME);
    run.push(state);
  }
  return run;
};

const birdPixels = (frame: GliderState) => GLIDER.radius * 2 * frame.camera.zoom * (BOARD.width / VIEW.width);

describe("Swoop's bird on screen", () => {
  test.each([10, 20, 30])("stays at least half its day 1 size all through day %i, however the ground rises and falls", (day) => {
    const dayOne = Math.max(...frames.filter((frame) => frame.world === 1).map(birdPixels));
    const run = throughDay(day);
    expect(run.at(-1)!.world).toBe(day + 1);
    for (const frame of run) {
      expect(frame.camera.zoom).toBeGreaterThanOrEqual(VIEW.minZoom * 0.98);
      expect(birdPixels(frame)).toBeGreaterThanOrEqual(dayOne * 0.49);
      expect(birdPixels(frame)).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("Swoop's background", () => {
  test("world 20's run reaches its flag and climbs and drops far more than world 1's", () => {
    const heights = (run: GliderState[]) => run.map((frame) => groundAt(frame.hills, frame.x).y);
    expect(bigSwing.at(-1)!.world).toBe(21);
    const span = (run: GliderState[]) => Math.max(...heights(run)) - Math.min(...heights(run));
    expect(span(bigSwing)).toBeGreaterThan(2 * span(frames.filter((frame) => frame.world === 1)));
  });

  test("the run under test crosses two world changes and zooms out and back in", () => {
    expect(frames.at(-1)!.world).toBe(4);
    const zooms = frames.map((frame) => frame.camera.zoom);
    expect(Math.min(...zooms)).toBeLessThan(0.8);
    expect(Math.max(...zooms)).toBeGreaterThan(0.95);
  });

  test("the far hills slide smoothly, never jumping or changing height, across zooms and world changes", () => {
    const step = (GLIDER.maxSpeed * FRAME * 0.09 * STEADY_PX) * 1.01;
    for (const { layer, size } of LAYERS) {
      let before = new Map<number, { left: number; stagger: number }>();
      for (const frame of frames) {
        const shift = parallaxShift(parallaxAnchor(frame), layer) * STEADY_PX;
        const now = new Map(farHillTiles(shift, BOARD.width, size * 1.3).map(({ tile, left, stagger }) => [tile, { left, stagger }]));
        for (const [tile, hill] of now) {
          const was = before.get(tile);
          if (!was) continue;
          expect(Math.abs(hill.left - was.left)).toBeLessThanOrEqual(step);
          expect(hill.stagger).toBe(was.stagger);
        }
        before = now;
      }
    }
  });

  test("the hills cover the board's whole width at every shift", () => {
    for (const shift of [-1234.5, -1, 0, 0.5, 77, 1e5 + 0.3]) {
      const tiles = farHillTiles(shift, BOARD.width, 180);
      expect(tiles[0].left).toBeLessThanOrEqual(-180);
      expect(tiles.at(-1)!.left).toBeGreaterThanOrEqual(BOARD.width);
      tiles.slice(1).forEach((tile, i) => expect(tile.left - tiles[i].left).toBeCloseTo(180, 6));
    }
  });

  test("the background follows the bird, not the zoom", () => {
    const state = frames.find((frame) => frame.camera.zoom < 0.95)!;
    expect(parallaxAnchor(state)).toBe(state.x - VIEW.width * VIEW.lead);
    expect(state.camera.x).not.toBe(parallaxAnchor(state));
  });
});

describe.each([
  ["through worlds 1 to 3", frames],
  ["through world 20, where the ground rises and falls far more", bigSwing],
] as const)("Swoop's zoom %s", (_, frames) => {
  const logs = frames.map((frame) => Math.log(frame.camera.zoom));

  test("changes a little each frame, and its rate of change changes even less", () => {
    for (let i = 2; i < logs.length; i++) {
      const now = logs[i] - logs[i - 1];
      expect(Math.abs(now)).toBeLessThan(0.02);
      expect(Math.abs(now - (logs[i - 1] - logs[i - 2]))).toBeLessThan(0.003);
    }
  });

  test("never breathes: it doesn't turn from zooming out to zooming in and back within a second and a half", () => {
    const turns: number[] = [];
    let direction = 0;
    for (let i = 1; i < logs.length; i++) {
      const change = logs[i] - logs[i - 1];
      if (Math.abs(change) < 2e-4) continue;
      if (direction !== 0 && Math.sign(change) !== direction) turns.push(i * FRAME);
      direction = Math.sign(change);
    }
    const quick = turns.filter((at, i) => i > 0 && at - turns[i - 1] < 1.5);
    expect(quick.length).toBeLessThanOrEqual(Math.ceil(frames.length * FRAME / 60) * 3);
  });

  test("keeps the bird in view every frame, and the ground under it whenever both fit at the widest zoom", () => {
    for (const frame of frames) {
      const view = viewSize(frame.aspect, frame.camera.zoom);
      const ground = groundAt(frame.hills, frame.x).y;
      const fits = frame.y + GLIDER.radius * 2 + VIEW.margin - (ground - VIEW.footing) <= viewSize(frame.aspect, VIEW.minZoom).height;
      if (fits) expect(ground).toBeGreaterThanOrEqual(frame.camera.y);
      expect(frame.y).toBeLessThanOrEqual(frame.camera.y + view.height);
      expect(frame.y + GLIDER.radius * 2).toBeGreaterThanOrEqual(frame.camera.y);
    }
  });
});

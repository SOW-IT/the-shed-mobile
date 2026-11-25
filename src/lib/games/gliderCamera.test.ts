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

describe("Swoop's background", () => {
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
    const state = frames[600];
    expect(parallaxAnchor(state)).toBe(state.x - VIEW.width * VIEW.lead);
    expect(state.camera.x).not.toBe(parallaxAnchor(state));
  });
});

describe("Swoop's zoom", () => {
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

  test("keeps the bird and the ground under it in view every frame", () => {
    for (const frame of frames) {
      const view = viewSize(frame.aspect, frame.camera.zoom);
      const ground = groundAt(frame.hills, frame.x).y;
      expect(ground).toBeGreaterThanOrEqual(frame.camera.y);
      expect(frame.y).toBeLessThanOrEqual(frame.camera.y + view.height);
    }
  });
});

import { expect, test } from "vitest";
import { frameDue, planClock, SAVER_FRAME_MS } from "./frameClock";

test("anything moving draws every frame, or every other frame on battery saver", () => {
  expect(planClock({ moving: true, now: 0, deadlines: [], saver: false })).toEqual({ kind: "frames", frameMs: 0 });
  expect(planClock({ moving: true, now: 0, deadlines: [500], saver: true })).toEqual({ kind: "frames", frameMs: SAVER_FRAME_MS });
});

test("nothing moving and nothing due: the clock stops", () => {
  expect(planClock({ moving: false, now: 1000, deadlines: [], saver: false })).toEqual({ kind: "still" });
  expect(planClock({ moving: false, now: 1000, deadlines: [undefined, 400, 1000], saver: false })).toEqual({ kind: "still" });
});

test("nothing moving: it wakes once, at the next thing that changes on screen", () => {
  expect(planClock({ moving: false, now: 1000, deadlines: [9000, undefined, 3500, 800, 12000], saver: false })).toEqual({ kind: "wake", at: 3500 });
  expect(planClock({ moving: false, now: 1000, deadlines: [1001], saver: true })).toEqual({ kind: "wake", at: 1001 });
});

test("a capped clock skips frames that come too soon", () => {
  expect(frameDue(0, 16, 0)).toBe(true);
  expect(frameDue(100, 116.7, SAVER_FRAME_MS)).toBe(false);
  expect(frameDue(100, 133.4, SAVER_FRAME_MS)).toBe(true);
  expect(frameDue(100, 130, SAVER_FRAME_MS)).toBe(true);
});

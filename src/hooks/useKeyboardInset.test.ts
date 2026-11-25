import { expect, test } from "vitest";
import { keyboardLift, keyboardOverlap, liftOverKeyboard, sheetKeyboardPadding, snapToPixel } from "./keyboardOverlap";

test("a screen gives up only the part the keyboard covers, frame by frame", () => {
  expect(keyboardOverlap(832, 832, 312)).toBe(312);
  expect(keyboardOverlap(752, 832, 312)).toBe(232);
  expect(keyboardOverlap(520, 832, 312)).toBe(0);
  expect(keyboardOverlap(480, 832, 312)).toBe(0);
  expect(keyboardOverlap(832, 832, 156)).toBe(156);
  expect(keyboardOverlap(600, 600, 300)).toBe(300);
  expect(keyboardOverlap(500, 600, 300)).toBe(200);
  expect(keyboardOverlap(752, 832, 100)).toBe(20);
});

test("nothing is given while the keyboard is closed", () => {
  expect(keyboardOverlap(832, 832, 0)).toBe(0);
  expect(keyboardOverlap(900, 832, 0)).toBe(0);
});

test("a bar over the safe area rises only once the keyboard reaches it, then stays a gap above", () => {
  expect(liftOverKeyboard(0, 34, 8)).toBe(0);
  expect(liftOverKeyboard(20, 34, 8)).toBe(0);
  expect(liftOverKeyboard(100, 34, 8)).toBe(74);
  expect(liftOverKeyboard(336, 34, 8)).toBe(310);
  expect(liftOverKeyboard(4, 0, 8)).toBe(8);
});

test("a sheet keeps its offset above the keyboard and none when it's closed", () => {
  expect(sheetKeyboardPadding(0, 16)).toBe(0);
  expect(sheetKeyboardPadding(8, 16)).toBe(16);
  expect(sheetKeyboardPadding(336, 16)).toBe(352);
  expect(sheetKeyboardPadding(-2, 16)).toBe(0);
});

test("the World's lift lands on whole device pixels, and is exactly 0 once the keyboard hides", () => {
  expect(Object.is(keyboardLift(0, 34, 8, 3), 0)).toBe(true);
  expect(Object.is(keyboardLift(0.4, 34, 8, 3), 0)).toBe(true);
  expect(keyboardLift(336, 34, 8, 3)).toBe(310);
  expect(keyboardLift(335.8, 34, 8, 3) * 3).toBe(Math.round(keyboardLift(335.8, 34, 8, 3) * 3));
  expect(keyboardLift(100.2, 34, 8, 2)).toBe(74);
  expect(snapToPixel(29.4, 3)).toBeCloseTo(29.333, 3);
  expect(snapToPixel(29.4, 0)).toBe(29);
  for (let height = 0; height <= 340; height += 0.37) {
    const lift = keyboardLift(height, 34, 8, 3);
    expect(Math.abs(lift * 3 - Math.round(lift * 3))).toBeLessThan(1e-9);
  }
});

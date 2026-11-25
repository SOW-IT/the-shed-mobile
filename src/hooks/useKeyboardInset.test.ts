import { expect, test } from "vitest";
import { keyboardOverlap, liftOverKeyboard, sheetKeyboardPadding } from "./keyboardOverlap";

test("a screen gives up only the part the keyboard covers, frame by frame", () => {
  expect(keyboardOverlap(832, 832, 312)).toBe(312);
  expect(keyboardOverlap(752, 832, 312)).toBe(232);
  expect(keyboardOverlap(520, 832, 312)).toBe(0);
  expect(keyboardOverlap(480, 832, 312)).toBe(0);
  expect(keyboardOverlap(832, 832, 156)).toBe(156);
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

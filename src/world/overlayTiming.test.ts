import { expect, test } from "vitest";
import { ITEM_MS, openLength, overlayTiming, presenceTiming } from "./overlayTiming";

test("a menu opens over its staggered items and closes back down the same path, quicker", () => {
  expect(openLength(1)).toBe(40 + ITEM_MS);
  expect(openLength(3)).toBe(40 + 80 + ITEM_MS);
  expect(openLength(40)).toBe(openLength(9));
  const open = overlayTiming(true, 3, false);
  const close = overlayTiming(false, 3, false);
  expect(open).toEqual({ toValue: openLength(3), duration: openLength(3) });
  expect(close.toValue).toBe(0);
  expect(close.duration).toBeGreaterThan(0);
  expect(close.duration).toBeLessThan(open.duration);
});

test("battery saver fades menus in and out without the stagger", () => {
  expect(overlayTiming(true, 9, true)).toEqual({ toValue: ITEM_MS, duration: 160 });
  expect(overlayTiming(false, 9, true)).toEqual({ toValue: 0, duration: 130 });
});

test("cards and trays leave the way they came", () => {
  expect(presenceTiming(true, false).toValue).toBe(1);
  expect(presenceTiming(false, false).toValue).toBe(0);
  expect(presenceTiming(false, false).duration).toBeLessThan(presenceTiming(true, false).duration);
  expect(presenceTiming(false, true)).toEqual({ toValue: 0, duration: 130 });
});

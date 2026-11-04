import { describe, expect, test } from "vitest";
import { SWIPE_DISTANCE, SWIPE_SPEED, swipePage } from "./swipePage";

describe("swipePage", () => {
  test("a long drag left goes forward and a long drag right goes back", () => {
    expect(swipePage(-SWIPE_DISTANCE, 0)).toBe(1);
    expect(swipePage(SWIPE_DISTANCE + 40, 0)).toBe(-1);
  });

  test("a short, slow drag stays put", () => {
    expect(swipePage(-(SWIPE_DISTANCE - 1), -100)).toBe(0);
    expect(swipePage(30, 200)).toBe(0);
    expect(swipePage(0, 0)).toBe(0);
  });

  test("a short flick pages in the direction of the flick", () => {
    expect(swipePage(-24, -SWIPE_SPEED)).toBe(1);
    expect(swipePage(24, SWIPE_SPEED + 300)).toBe(-1);
  });

  test("flicking back the other way at the end cancels", () => {
    expect(swipePage(-(SWIPE_DISTANCE + 20), SWIPE_SPEED)).toBe(0);
    expect(swipePage(SWIPE_DISTANCE + 20, -SWIPE_SPEED)).toBe(0);
  });
});

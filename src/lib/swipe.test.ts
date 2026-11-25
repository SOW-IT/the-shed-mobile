import { describe, expect, test } from "vitest";
import { swipeStep } from "./swipe";

describe("swipeStep", () => {
  test("a clear sideways swipe moves one tab", () => {
    expect(swipeStep(-120, 10)).toBe(1);
    expect(swipeStep(120, -10)).toBe(-1);
  });

  test("short, vertical or diagonal drags stay put", () => {
    expect(swipeStep(-40, 0)).toBe(0);
    expect(swipeStep(-100, 300)).toBe(0);
    expect(swipeStep(90, 70)).toBe(0);
  });
});

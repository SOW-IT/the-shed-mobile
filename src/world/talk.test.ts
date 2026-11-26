import { describe, expect, test } from "vitest";
import { BUBBLE_MS } from "../../shared/world";
import { bubbleAge, FACE_MIN, mouthAt, nextFlapAt } from "./talk";

const FACING_US = 0;
const FACING_AWAY = Math.PI;

describe("a mouth that moves while the bubble is up", () => {
  test("the bubble is up from the moment the line was said until it goes", () => {
    const say = { at: 10_000 };
    expect(bubbleAge(say, 9_999)).toBeNull();
    expect(bubbleAge(say, 10_000)).toBe(0);
    expect(bubbleAge(say, 10_000 + BUBBLE_MS - 1)).toBe(BUBBLE_MS - 1);
    expect(bubbleAge(say, 10_000 + BUBBLE_MS)).toBeNull();
    expect(bubbleAge(undefined, 10_000)).toBeNull();
  });

  test("opens and closes for the whole time the bubble is up, then stops closed", () => {
    const say = { at: 10_000 };
    const mouth = (now: number) => mouthAt(bubbleAge(say, now), FACING_US);
    expect(mouth(10_000)).toBe(true);
    expect(mouth(10_130)).toBe(false);
    expect(mouth(10_260)).toBe(true);
    expect(mouth(10_000 + 6000)).toBeDefined();
    expect(mouth(10_000 + BUBBLE_MS - 1)).toBeDefined();
    expect(mouth(10_000 + BUBBLE_MS)).toBeUndefined();
    expect(mouth(9_999)).toBeUndefined();
  });

  test("a new line keeps them talking until its own bubble goes", () => {
    const first = { at: 10_000 };
    const second = { at: 15_000 };
    expect(mouthAt(bubbleAge(second, 10_000 + BUBBLE_MS), FACING_US)).toBeDefined();
    expect(mouthAt(bubbleAge(second, 15_000 + BUBBLE_MS - 1), FACING_US)).toBeDefined();
    expect(mouthAt(bubbleAge(second, 15_000 + BUBBLE_MS), FACING_US)).toBeUndefined();
    expect(mouthAt(bubbleAge(first, 10_000 + BUBBLE_MS), FACING_US)).toBeUndefined();
  });

  test("facing away, there is no mouth to move", () => {
    expect(mouthAt(0, FACING_AWAY)).toBeUndefined();
    expect(mouthAt(0, Math.acos(FACE_MIN) + 0.01)).toBeUndefined();
    expect(mouthAt(0, Math.acos(FACE_MIN) - 0.01)).toBe(true);
  });

  test("the next frame is due at the next flap, the same on every phone", () => {
    expect(nextFlapAt(5000, 0)).toBe(5130);
    expect(nextFlapAt(5000, 129)).toBe(5130);
    expect(nextFlapAt(5000, 130)).toBe(5260);
    const frames = (now: number) => [0, 40, 130, 300, 700].map((k) => mouthAt(bubbleAge({ at: 5000 }, now + k), FACING_US));
    expect(frames(5000)).toEqual([true, true, false, true, false]);
  });
});

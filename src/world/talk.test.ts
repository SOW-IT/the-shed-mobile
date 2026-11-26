import { describe, expect, test } from "vitest";
import { BUBBLE_MS } from "../../shared/world";
import { bubbleAge, FACE_MIN, mouthAt, nextFlapAt, talkAge, talkMs } from "./talk";

const FACING_US = 0;
const FACING_AWAY = Math.PI;

describe("a mouth that moves while the line is being said", () => {
  test("the bubble is up from the moment the line was said until it goes", () => {
    const say = { at: 10_000 };
    expect(bubbleAge(say, 9_999)).toBeNull();
    expect(bubbleAge(say, 10_000)).toBe(0);
    expect(bubbleAge(say, 10_000 + BUBBLE_MS - 1)).toBe(BUBBLE_MS - 1);
    expect(bubbleAge(say, 10_000 + BUBBLE_MS)).toBeNull();
    expect(bubbleAge(undefined, 10_000)).toBeNull();
  });

  test("opens and closes while the line is said, then stops closed with the bubble still up", () => {
    const say = { text: "want to play a game?", at: 10_000 };
    const said = talkMs(say.text);
    const mouth = (now: number) => mouthAt(talkAge(say, now), FACING_US);
    expect(mouth(10_000)).toBe(true);
    expect(mouth(10_130)).toBe(false);
    expect(mouth(10_260)).toBe(true);
    expect(mouth(10_000 + said - 1)).toBe(false);
    expect(mouth(10_000 + said)).toBeUndefined();
    expect(bubbleAge(say, 10_000 + said)).toBe(said);
    expect(mouth(10_000 + BUBBLE_MS)).toBeUndefined();
    expect(mouth(9_999)).toBeUndefined();
    expect(talkAge(undefined, 10_000)).toBeNull();
  });

  test("a long line talks for the whole bubble and no longer", () => {
    const say = { text: "x".repeat(100), at: 10_000 };
    expect(mouthAt(talkAge(say, 10_000 + BUBBLE_MS - 1), FACING_US)).toBeDefined();
    expect(mouthAt(talkAge(say, 10_000 + BUBBLE_MS), FACING_US)).toBeUndefined();
  });

  test("a new line starts its own talking", () => {
    const first = { text: "hi", at: 10_000 };
    const second = { text: "hi", at: 15_000 };
    expect(mouthAt(talkAge(first, 15_000), FACING_US)).toBeUndefined();
    expect(mouthAt(talkAge(second, 15_000), FACING_US)).toBe(true);
    expect(mouthAt(talkAge(second, 15_000 + talkMs("hi")), FACING_US)).toBeUndefined();
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

describe("how long a line takes to say", () => {
  const FLAP_PAIR = 260;
  const QUARTER = BUBBLE_MS / 4;

  test("a one-word line talks for exactly a quarter of the bubble", () => {
    expect(talkMs("hi")).toBe(QUARTER);
    expect(talkMs("hello")).toBe(QUARTER);
    expect(mouthAt(QUARTER - 1, FACING_US)).toBe(false);
  });

  test("an everyday line talks for longer than a quarter and less than the whole bubble", () => {
    expect(talkMs("want to play a game?")).toBe(3380);
    expect(talkMs("do you want to play tag?")).toBe(3640);
    const mid = talkMs("hey everyone, who wants to come down to the farm with me?");
    expect(mid).toBeGreaterThan(QUARTER);
    expect(mid).toBeLessThan(BUBBLE_MS);
  });

  test("grows with the length of the line", () => {
    expect(talkMs("hello there")).toBeGreaterThan(talkMs("hi"));
    expect(talkMs("hello there everyone")).toBeGreaterThan(talkMs("hello there"));
  });

  test("only a long line talks for the whole bubble", () => {
    expect(talkMs("x".repeat(82))).toBeLessThan(BUBBLE_MS);
    expect(talkMs("x".repeat(83))).toBe(BUBBLE_MS);
    expect(talkMs("x".repeat(100))).toBe(BUBBLE_MS);
  });

  test("ends after a closed flap, so the mouth finishes shut", () => {
    for (const text of ["hi", "want to play a game?", "hello there everyone", "x".repeat(100)]) {
      const ms = talkMs(text);
      expect(ms === QUARTER || ms === BUBBLE_MS || ms % FLAP_PAIR === 0).toBe(true);
      expect(mouthAt(ms - 1, FACING_US)).toBe(false);
    }
  });

  test("an empty line says nothing and an emoji talks for the shortest time", () => {
    expect(talkMs("")).toBe(0);
    expect(talkMs("   ")).toBe(0);
    expect(talkAge({ text: "", at: 0 }, 0)).toBeNull();
    expect(talkMs("👋")).toBe(QUARTER);
    expect(talkMs("👍🏽")).toBe(QUARTER);
  });
});

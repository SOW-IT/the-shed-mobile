import { describe, expect, test } from "vitest";
import { mouthAt, talkMs } from "./talk";

describe("a mouth that moves while someone talks", () => {
  test("talks about 60 ms a character, between 0.6 and 4 seconds", () => {
    expect(talkMs("hi")).toBe(600);
    expect(talkMs("Hello there, how are you?")).toBe(25 * 60);
    expect(talkMs("x".repeat(120))).toBe(4000);
    expect(talkMs("👋🏽👋🏽")).toBe(600);
  });

  test("opens and closes from the moment the line was said, then stops", () => {
    const say = { text: "Hello there, how are you?", at: 10_000 };
    expect(mouthAt(say, 10_000)).toBe(true);
    expect(mouthAt(say, 10_130)).toBe(false);
    expect(mouthAt(say, 10_260)).toBe(true);
    expect(mouthAt(say, 10_000 + 1499)).toBeDefined();
    expect(mouthAt(say, 10_000 + 1500)).toBeUndefined();
    expect(mouthAt(say, 9_999)).toBeUndefined();
    expect(mouthAt(undefined, 10_000)).toBeUndefined();
  });

  test("every phone works it out the same from the line alone", () => {
    const say = { text: "Good morning", at: 5000 };
    const frames = (now: number) => [0, 40, 130, 300, 700].map((k) => mouthAt(say, now + k));
    expect(frames(5000)).toEqual(frames(5000));
    expect(frames(5000)).toEqual([true, true, false, true, false]);
    expect(mouthAt(say, 5000 + 720)).toBeUndefined();
  });
});

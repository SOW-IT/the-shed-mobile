import { describe, expect, test } from "vitest";
import { frameJudge, seedInstant } from "./stableFrames.mjs";

const frame = (text) => Buffer.from(text);

describe("seedInstant", () => {
  test("is the top of the next hour", () => {
    expect(seedInstant(Date.UTC(2026, 10, 21, 8, 57, 12))).toBe(Date.UTC(2026, 10, 21, 9));
    expect(seedInstant(Date.UTC(2026, 10, 21, 23, 0, 0, 1))).toBe(Date.UTC(2026, 10, 22, 0));
  });

  test("on the hour, it is the next one, so the event has started", () => {
    expect(seedInstant(Date.UTC(2026, 10, 21, 9))).toBe(Date.UTC(2026, 10, 21, 10));
  });

  test("is the same for every run within the hour", () => {
    expect(seedInstant(Date.UTC(2026, 10, 21, 9, 1))).toBe(seedInstant(Date.UTC(2026, 10, 21, 9, 59)));
  });
});

describe("frameJudge", () => {
  test("settles on the first frame identical to the one before", () => {
    const { judge, moving } = frameJudge(5);
    expect(judge("home", frame("a"))).toEqual({ settled: false, frames: 1 });
    expect(judge("home", frame("b"))).toEqual({ settled: false, frames: 2 });
    expect(judge("home", frame("b"))).toEqual({ settled: true, frames: 3 });
    expect(moving).toEqual([]);
  });

  test("gives up after the last try and reports the screen as moving", () => {
    const { judge, moving } = frameJudge(3);
    judge("review", frame("1"));
    judge("review", frame("2"));
    expect(judge("review", frame("3"))).toEqual({ settled: true, frames: 3, moving: true });
    expect(moving).toEqual(["review"]);
  });

  test("keeps screens apart, and starts a screen afresh once it settled", () => {
    const { judge } = frameJudge(5);
    judge("home", frame("x"));
    expect(judge("calendar", frame("y"))).toEqual({ settled: false, frames: 1 });
    expect(judge("home", frame("x")).settled).toBe(true);
    expect(judge("home", frame("z"))).toEqual({ settled: false, frames: 1 });
  });

  test("a still frame of the last screen waits for the app to move on", () => {
    const { judge } = frameJudge(6);
    judge("home", frame("home"));
    judge("home", frame("home"));
    expect(judge("edit", frame("home"))).toEqual({ settled: false, frames: 1 });
    expect(judge("edit", frame("home"))).toEqual({ settled: false, frames: 2 });
    expect(judge("edit", frame("editing"))).toEqual({ settled: false, frames: 3 });
    expect(judge("edit", frame("editing"))).toEqual({ settled: true, frames: 4 });
  });

  test("a screen that really looks like the last one is taken after half the tries", () => {
    const { judge, moving } = frameJudge(6);
    judge("root", frame("home"));
    judge("root", frame("home"));
    judge("home", frame("home"));
    judge("home", frame("home"));
    expect(judge("home", frame("home"))).toEqual({ settled: true, frames: 3 });
    expect(moving).toEqual([]);
  });
});

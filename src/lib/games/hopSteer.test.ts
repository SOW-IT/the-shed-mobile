import { describe, expect, test } from "vitest";
import { fingers, lift, liftFingers, press, steerOf, type HeldStack } from "./hopSteer";

const MID = 200;
const L = 50;
const R = 350;
const steer = (stack: HeldStack) => steerOf(stack, MID);

describe("the newest finger held steers", () => {
  test("holding left, pressing right goes right; lifting right goes straight back left; lifting left stops", () => {
    let s = fingers([], [{ id: "1", x: L }]);
    expect(steer(s)).toBe(-1);
    s = fingers(s, [{ id: "1", x: L }, { id: "2", x: R }]);
    expect(steer(s)).toBe(1);
    s = fingers(s, [{ id: "1", x: L }]);
    expect(steer(s)).toBe(-1);
    s = fingers(s, []);
    expect(steer(s)).toBe(0);
  });

  test("holding right, pressing left, lifting the first (right): still left", () => {
    let s = fingers([], [{ id: "1", x: R }]);
    s = fingers(s, [{ id: "1", x: R }, { id: "2", x: L }]);
    expect(steer(s)).toBe(-1);
    s = fingers(s, [{ id: "2", x: L }]);
    expect(steer(s)).toBe(-1);
  });

  test("a tap the other way while holding goes that way for the tap, then back", () => {
    let s = fingers([], [{ id: "1", x: L }]);
    const seen: number[] = [];
    for (const tap of ["2", "3", "4"]) {
      s = fingers(s, [{ id: "1", x: L }, { id: tap, x: R }]);
      seen.push(steer(s));
      s = fingers(s, [{ id: "1", x: L }]);
      seen.push(steer(s));
    }
    expect(seen).toEqual([1, -1, 1, -1, 1, -1]);
  });

  test("three fingers: each lift falls back to the next newest still down", () => {
    let s = fingers([], [{ id: "a", x: L }]);
    s = fingers(s, [{ id: "a", x: L }, { id: "b", x: R }]);
    s = fingers(s, [{ id: "a", x: L }, { id: "b", x: R }, { id: "c", x: L }]);
    expect(steer(s)).toBe(-1);
    s = fingers(s, [{ id: "a", x: L }, { id: "b", x: R }]);
    expect(steer(s)).toBe(1);
    s = fingers(s, [{ id: "a", x: L }]);
    expect(steer(s)).toBe(-1);
  });

  test("lifting an older finger doesn't change the way", () => {
    let s = fingers([], [{ id: "1", x: L }]);
    s = fingers(s, [{ id: "1", x: L }, { id: "2", x: R }]);
    s = fingers(s, [{ id: "2", x: R }]);
    expect(steer(s)).toBe(1);
  });

  test("sliding the newest finger across the middle turns round, and it stays the newest", () => {
    let s = fingers([], [{ id: "1", x: L }]);
    s = fingers(s, [{ id: "1", x: L }, { id: "2", x: R }]);
    s = fingers(s, [{ id: "1", x: L }, { id: "2", x: MID - 10 }]);
    expect(steer(s)).toBe(-1);
    s = fingers(s, [{ id: "1", x: R }, { id: "2", x: MID - 10 }]);
    // The older one sliding over doesn't take over.
    expect(steer(s)).toBe(-1);
    s = fingers(s, [{ id: "1", x: R }]);
    expect(steer(s)).toBe(1);
  });

  test("two fingers landing in one event: the later in the list is the newest", () => {
    const s = fingers([], [{ id: "1", x: L }, { id: "2", x: R }]);
    expect(steer(s)).toBe(1);
  });

  test("before the board's middle is known, a finger steers nowhere", () => {
    expect(steerOf(fingers([], [{ id: "1", x: L }]), null)).toBe(0);
  });
});

describe("keys the same way", () => {
  test("last pressed wins; letting go falls back to the other key still held", () => {
    let s = press([], { id: "ArrowLeft", side: -1 });
    expect(steer(s)).toBe(-1);
    s = press(s, { id: "d", side: 1 });
    expect(steer(s)).toBe(1);
    s = lift(s, "d");
    expect(steer(s)).toBe(-1);
    s = lift(s, "ArrowLeft");
    expect(steer(s)).toBe(0);
  });

  test("pressing a held key again (a repeat) makes it the newest without doubling it", () => {
    let s = press([], { id: "a", side: -1 });
    s = press(s, { id: "ArrowRight", side: 1 });
    s = press(s, { id: "a", side: -1 });
    expect(s).toHaveLength(2);
    expect(steer(s)).toBe(-1);
  });

  test("fingers and keys share one order, and fingers coming and going leave keys alone", () => {
    let s = press([], { id: "ArrowLeft", side: -1 });
    s = fingers(s, [{ id: "1", x: R }]);
    expect(steer(s)).toBe(1);
    s = fingers(s, []);
    expect(steer(s)).toBe(-1);
    s = fingers(s, [{ id: "1", x: R }]);
    expect(steer(liftFingers(s))).toBe(-1);
  });
});

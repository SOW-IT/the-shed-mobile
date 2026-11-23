import { describe, expect, test } from "vitest";
import { WALK_SPEED, type Walk } from "../../shared/world";
import { carryGait, drawnPose, restingGait, STOP_MS, strideBob, strideSwing, TURN_MS } from "./gait";

const east: Walk = { fromX: 0, fromZ: 0, toX: WALK_SPEED * 2, toZ: 0, startedAt: 1000 };
const arrives = 3000;

describe("drawnPose", () => {
  test("a walk starts with its feet on the ground", () => {
    const pose = drawnPose(east, restingGait(east), east.startedAt);
    expect(pose.walking).toBe(true);
    expect(strideBob(pose)).toBe(0);
    expect(strideSwing(pose)).toBe(0);
  });

  test("the stride fades out after arriving instead of stopping dead", () => {
    const gait = restingGait(east);
    expect(drawnPose(east, gait, arrives - 1).strideAmp).toBe(1);
    const halfway = drawnPose(east, gait, arrives + STOP_MS / 2);
    expect(halfway.walking).toBe(false);
    expect(halfway.strideAmp).toBeCloseTo(0.5);
    expect(drawnPose(east, gait, arrives + STOP_MS).strideAmp).toBe(0);
  });

  test("someone who has arrived keeps facing the way they walked", () => {
    const pose = drawnPose(east, restingGait(east), arrives + 60_000);
    expect(pose.heading).toBeCloseTo(Math.PI / 2);
    expect(pose.turning).toBe(false);
  });
});

describe("carryGait", () => {
  test("a first walk has nothing to carry", () => {
    expect(carryGait(null, east, 5000)).toEqual(restingGait(east));
  });

  test("a new walk turns from the old heading over TURN_MS", () => {
    const now = arrives + 5000;
    const north: Walk = { fromX: east.toX, fromZ: 0, toX: east.toX, toZ: -3, startedAt: now };
    const gait = carryGait({ walk: east, gait: restingGait(east) }, north, now);
    const start = drawnPose(north, gait, now);
    expect(start.heading).toBeCloseTo(Math.PI / 2);
    expect(start.turning).toBe(true);
    const done = drawnPose(north, gait, now + TURN_MS);
    expect(Math.abs(done.heading)).toBeCloseTo(Math.PI);
    expect(done.turning).toBe(false);
  });

  test("a turn takes the short way round", () => {
    const now = arrives + 5000;
    const back: Walk = { fromX: 0, fromZ: 0, toX: -1, toZ: -3, startedAt: 0 };
    const backGait = restingGait(back);
    const other: Walk = { fromX: -1, fromZ: -3, toX: 0, toZ: -6, startedAt: now };
    const gait = carryGait({ walk: back, gait: backGait }, other, now);
    const mid = drawnPose(other, gait, now + TURN_MS / 2);
    expect(Math.abs(mid.heading)).toBeGreaterThan(Math.PI / 2);
  });

  test("a walk that goes nowhere keeps the heading", () => {
    const now = arrives + 5000;
    const stay: Walk = { fromX: east.toX, fromZ: 0, toX: east.toX, toZ: 0, startedAt: now };
    const gait = carryGait({ walk: east, gait: restingGait(east) }, stay, now);
    expect(drawnPose(stay, gait, now + TURN_MS).heading).toBeCloseTo(Math.PI / 2);
    expect(restingGait(stay).heading).toBe(0);
  });

  test("retargeting mid-walk keeps the stride going", () => {
    const now = east.startedAt + 700;
    const next: Walk = { fromX: WALK_SPEED * 0.7, fromZ: 0, toX: 0, toZ: 4, startedAt: now };
    const gait = carryGait({ walk: east, gait: restingGait(east) }, next, now);
    expect(gait.movingSince).toBe(east.startedAt);
    expect(drawnPose(next, gait, now).stridePhase).toBeCloseTo(0.7);
  });

  test("setting off again after stopping starts a fresh stride", () => {
    const now = arrives + STOP_MS + 1;
    const next: Walk = { fromX: east.toX, fromZ: 0, toX: 0, toZ: 0, startedAt: now - 120 };
    const gait = carryGait({ walk: east, gait: restingGait(east) }, next, now);
    expect(gait.movingSince).toBe(now);
    expect(strideBob(drawnPose(next, gait, now))).toBe(0);
  });
});

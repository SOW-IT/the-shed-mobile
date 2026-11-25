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

  test("a walk that ends facing a set way (the lectern) turns there on arrival, not before", () => {
    const toLectern: Walk = { ...east, heading: 0 };
    const gait = restingGait(toLectern);
    expect(drawnPose(toLectern, gait, arrives - 1).heading).toBeCloseTo(Math.PI / 2);
    const turning = drawnPose(toLectern, gait, arrives + TURN_MS / 2);
    expect(turning.turning).toBe(true);
    expect(turning.heading).toBeGreaterThan(0);
    expect(turning.heading).toBeLessThan(Math.PI / 2);
    const settled = drawnPose(toLectern, gait, arrives + TURN_MS);
    expect(settled.heading).toBeCloseTo(0);
    expect(settled.turning).toBe(false);
    expect(drawnPose(toLectern, gait, arrives + 60_000)).toMatchObject({ heading: 0, strideAmp: 0, walking: false });
  });
});

describe("carryGait", () => {
  test("a first walk has nothing to carry", () => {
    expect(carryGait(null, east, 5000)).toEqual(restingGait(east));
  });

  test("a still step after standing at the lectern keeps facing the room, not the way you walked there", () => {
    const toLectern: Walk = { ...east, heading: 0 };
    const now = arrives + 60_000;
    expect(drawnPose(toLectern, restingGait(toLectern), now).heading).toBeCloseTo(0);
    const step: Walk = { fromX: toLectern.toX, fromZ: 0, toX: toLectern.toX + 0.01, toZ: 0, startedAt: now };
    const gait = carryGait({ walk: toLectern, gait: restingGait(toLectern) }, step, now);
    expect(drawnPose(step, gait, now + TURN_MS).heading).toBeCloseTo(0);
  });

  test("arriving through a pad faces into the room at once, from any heading before", () => {
    const arrived: Walk = { fromX: 3.2, fromZ: 3.4, toX: 3.2, toZ: 3.4, startedAt: 9000, heading: -Math.PI / 2 };
    const fresh = drawnPose(arrived, restingGait(arrived), arrived.startedAt);
    expect(fresh.heading).toBe(-Math.PI / 2);
    expect(fresh.turning).toBe(false);
    const seen = carryGait({ walk: east, gait: restingGait(east) }, arrived, arrived.startedAt);
    expect(drawnPose(arrived, seen, arrived.startedAt + TURN_MS).heading).toBeCloseTo(-Math.PI / 2);
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

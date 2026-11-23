import { describe, expect, test } from "vitest";
import { INTERACT_RADIUS, type Pose } from "../../shared/world";
import { approachStep } from "./approach";

const standing = (x: number, z: number, arrivesAt = 0): Pose => ({ x, z, walking: false, heading: 0, arrivesAt });
const walking = (x: number, z: number): Pose => ({ x, z, walking: true, heading: 0, arrivesAt: 99_999 });
const now = 10_000;

describe("approachStep", () => {
  test("asks straight away when already close", () => {
    const step = approachStep({ mine: standing(0, 0), theirs: standing(1, 0), theirGoal: { x: 1, z: 0 }, aimedAt: null, now });
    expect(step).toEqual({ kind: "ask" });
  });

  test("walks to a spot beside them, on the side it came from", () => {
    const fromLeft = approachStep({ mine: standing(-3, 4), theirs: standing(1, 0), theirGoal: { x: 1, z: 0 }, aimedAt: null, now });
    expect(fromLeft).toEqual({ kind: "walk", to: { x: expect.closeTo(-0.2), z: 0 }, aimedAt: "1.00:0.00" });
    const fromBehind = approachStep({ mine: standing(1, -6), theirs: standing(1, 0), theirGoal: { x: 1, z: 0 }, aimedAt: null, now });
    expect(fromBehind).toEqual({ kind: "walk", to: { x: 2.2, z: 0 }, aimedAt: "1.00:0.00" });
  });

  test("takes the other side when the hedge is in the way", () => {
    const step = approachStep({ mine: standing(3.8, -6), theirs: standing(3.5, 0), theirGoal: { x: 3.5, z: 0 }, aimedAt: null, now });
    expect(step).toEqual({ kind: "walk", to: { x: 2.3, z: 0 }, aimedAt: "3.50:0.00" });
  });

  test("waits while it's still on the way", () => {
    const step = approachStep({ mine: walking(2, 0), theirs: standing(6, 0), theirGoal: { x: 6, z: 0 }, aimedAt: "6.00:0.00", now });
    expect(step).toEqual({ kind: "wait" });
  });

  test("asks before arriving, with room for the server's slightly older position", () => {
    const step = approachStep({ mine: walking(4, 0), theirs: standing(6, 0), theirGoal: { x: 6, z: 0 }, aimedAt: "6.00:0.00", now });
    expect(step).toEqual({ kind: "ask" });
    const edge = approachStep({ mine: walking(6 - INTERACT_RADIUS + 0.1, 0), theirs: standing(6, 0), theirGoal: { x: 6, z: 0 }, aimedAt: "6.00:0.00", now });
    expect(edge).toEqual({ kind: "wait" });
  });

  test("asks at the edge of reach once it has stopped", () => {
    const step = approachStep({ mine: standing(6 - INTERACT_RADIUS + 0.1, 0), theirs: standing(6, 0), theirGoal: { x: 6, z: 0 }, aimedAt: "6.00:0.00", now });
    expect(step).toEqual({ kind: "ask" });
  });

  test("follows when they set off somewhere else", () => {
    const step = approachStep({ mine: walking(2, 0), theirs: walking(6, 1), theirGoal: { x: 6, z: 5 }, aimedAt: "6.00:0.00", now });
    expect(step.kind).toBe("walk");
  });

  test("gives up when it has arrived and still can't reach", () => {
    const step = approachStep({ mine: standing(0, 0), theirs: standing(6, 0), theirGoal: { x: 6, z: 0 }, aimedAt: "6.00:0.00", now });
    expect(step).toEqual({ kind: "giveUp" });
  });

  test("keeps waiting at its spot while they are still walking there", () => {
    const step = approachStep({ mine: standing(0, 0), theirs: walking(9, 0), theirGoal: { x: 6, z: 0 }, aimedAt: "6.00:0.00", now });
    expect(step).toEqual({ kind: "wait" });
  });

  test("standing on their spot still gives somewhere to go", () => {
    const step = approachStep({ mine: walking(6, 5), theirs: walking(0, 0), theirGoal: { x: 6, z: 5 }, aimedAt: null, now });
    expect(step.kind).toBe("walk");
  });
});

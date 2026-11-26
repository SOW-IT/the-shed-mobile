import { describe, expect, test } from "vitest";
import { ARCADE_REACH, arcadeStep } from "./arcadeReach";

const spot = { x: -2.2, z: 6.6 };
const at = (dx: number, dz = 0) => ({ x: spot.x + dx, z: spot.z + dz });

describe("walking away from the arcade", () => {
  test("standing by the arcade keeps its games open", () => {
    expect(arcadeStep(false, spot, spot, spot)).toEqual({ near: true, leave: false });
    expect(arcadeStep(true, at(1, 0.5), at(1, 0.5), spot)).toEqual({ near: true, leave: false });
    expect(arcadeStep(true, at(ARCADE_REACH), at(ARCADE_REACH), spot)).toEqual({ near: true, leave: false });
  });

  test("a step to one side, ending within reach, keeps them open", () => {
    expect(arcadeStep(true, spot, at(-1.2, 0.6), spot)).toEqual({ near: true, leave: false });
  });

  test("setting off out of reach closes them at once, still standing by the arcade", () => {
    expect(arcadeStep(true, spot, at(ARCADE_REACH + 0.01), spot)).toEqual({ near: true, leave: true });
    expect(arcadeStep(true, at(0.1), at(0, -5), spot)).toEqual({ near: true, leave: true });
    expect(arcadeStep(false, spot, at(4), spot)).toEqual({ near: true, leave: true });
  });

  test("being moved away closes them", () => {
    expect(arcadeStep(true, at(0, -5), at(0, -5), spot)).toEqual({ near: true, leave: true });
  });

  test("opened from somewhere else, they stay until you've been to the arcade and left", () => {
    let near = false;
    for (const [pose, headed] of [[at(0, -8), at(0, -8)], [at(0, -8), spot], [at(0, -4), spot]]) {
      const step = arcadeStep(near, pose, headed, spot);
      expect(step.leave).toBe(false);
      near = step.near;
    }
    near = arcadeStep(near, at(0.2), spot, spot).near;
    expect(arcadeStep(near, at(0.2), at(0, -3), spot).leave).toBe(true);
  });

  test("with no walk yet, nothing changes", () => {
    expect(arcadeStep(true, null, null, spot)).toEqual({ near: true, leave: false });
    expect(arcadeStep(false, null, null, spot)).toEqual({ near: false, leave: false });
  });
});

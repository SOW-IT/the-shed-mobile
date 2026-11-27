import { describe, expect, test } from "vitest";
import { ARCADE_REACH, arcadeStep, AWAY_FROM_ARCADE, type ArcadeReach } from "./arcadeReach";

const spot = { x: -2.2, z: 6.6 };
const at = (dx: number, dz = 0) => ({ x: spot.x + dx, z: spot.z + dz });
const by = (headed = spot): ArcadeReach => ({ near: true, headed });

describe("walking away from the arcade", () => {
  test("standing by the arcade keeps its games open", () => {
    expect(arcadeStep(AWAY_FROM_ARCADE, spot, spot, spot)).toEqual({ reach: by(), leave: false });
    expect(arcadeStep(by(), at(1, 0.5), spot, spot).leave).toBe(false);
    expect(arcadeStep(by(), at(ARCADE_REACH), spot, spot).leave).toBe(false);
  });

  test("a step to one side, ending within reach, keeps them open", () => {
    expect(arcadeStep(by(), spot, at(-1.2, 0.6), spot)).toEqual({ reach: by(at(-1.2, 0.6)), leave: false });
  });

  test("setting off out of reach closes them at once, still standing by the arcade", () => {
    expect(arcadeStep(by(), spot, at(ARCADE_REACH + 0.01), spot).leave).toBe(true);
    expect(arcadeStep(by(at(-1.2, 0.6)), at(0.1), at(0, -5), spot).leave).toBe(true);
  });

  test("being moved away closes them", () => {
    expect(arcadeStep(by(), at(0, -5), at(0, -5), spot).leave).toBe(true);
  });

  test("a walk passing the arcade closes them once out of reach, not on the way in", () => {
    let reach = AWAY_FROM_ARCADE;
    const headed = at(4);
    for (const dx of [-4, -1.4, 0, 1.4]) {
      const step = arcadeStep(reach, at(dx), headed, spot);
      expect(step.leave).toBe(false);
      reach = step.reach;
    }
    expect(arcadeStep(reach, at(1.6), headed, spot).leave).toBe(true);
  });

  test("opened from somewhere else, they stay until you've been to the arcade and left", () => {
    let reach = AWAY_FROM_ARCADE;
    for (const [pose, headed] of [[at(0, -8), at(0, -8)], [at(0, -8), spot], [at(0, -4), spot], [at(0.2), spot]]) {
      const step = arcadeStep(reach, pose, headed, spot);
      expect(step.leave).toBe(false);
      reach = step.reach;
    }
    expect(arcadeStep(reach, at(0.2), at(0, -3), spot).leave).toBe(true);
  });

  test("with no walk yet, nothing changes", () => {
    expect(arcadeStep(by(), null, null, spot)).toEqual({ reach: by(), leave: false });
    expect(arcadeStep(AWAY_FROM_ARCADE, null, null, spot)).toEqual({ reach: AWAY_FROM_ARCADE, leave: false });
  });
});

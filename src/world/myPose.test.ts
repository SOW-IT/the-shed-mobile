import { describe, expect, test } from "vitest";
import { standIn } from "../../shared/world";
import { myPoseLabel } from "./myPose";

const lectern = standIn("chapel", "lectern")!;
const still = (x: number, z: number, heading: number) => ({ x, z, heading, walking: false });

describe("myPoseLabel", () => {
  test("sitting says so, wherever the seat is", () => {
    expect(myPoseLabel("chapel", still(-2.3, 1.15, Math.PI / 3), true)).toBe("You, sitting");
  });

  test("behind the lectern facing the room", () => {
    expect(myPoseLabel("chapel", still(lectern.x, lectern.z, 0), false)).toBe("You, behind the lectern, facing the room");
  });

  test("not until you've turned to face the room, or while walking there, or anywhere else", () => {
    expect(myPoseLabel("chapel", still(lectern.x, lectern.z, Math.PI), false)).toBe("You");
    expect(myPoseLabel("chapel", { ...still(lectern.x, lectern.z, 0), walking: true }, false)).toBe("You");
    expect(myPoseLabel("chapel", still(0, 0, 0), false)).toBe("You");
    expect(myPoseLabel("garden", still(lectern.x, lectern.z, 0), false)).toBe("You");
  });
});

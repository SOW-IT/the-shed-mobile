import { describe, expect, test } from "vitest";
import type { Walk } from "../../shared/world";
import { blendIn, headFor } from "./blend";
import { drawnPose, TURN_MS } from "./gait";

const NOW = 10_000;

describe("blending the server's walk into this phone's", () => {
  test("an arrival seen while a local walk ends at the same spot turns the drawn character to the server's heading", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const arrival: Walk = { fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: NOW, heading: -Math.PI / 2 };
    const blended = blendIn(local, arrival, NOW);
    expect(blended.toX).toBe(1);
    expect(drawnPose(blended, blended.gait, NOW + TURN_MS + 1).heading).toBeCloseTo(-Math.PI / 2);
  });

  test("blending the same arrival again changes nothing, so the update settles", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const arrival: Walk = { fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: NOW, heading: Math.PI };
    const once = blendIn(local, arrival, NOW);
    expect(blendIn(once, arrival, NOW + 16)).toBe(once);
  });

  test("without a heading from the server the local walk is kept as it is", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    expect(blendIn(local, { fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: NOW }, NOW)).toBe(local);
  });

  test("a short way off it walks there from where it is drawn now", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const blended = blendIn(local, { fromX: 2, fromZ: 1, toX: 2, toZ: 1, startedAt: NOW, heading: Math.PI }, NOW);
    expect(blended.fromX).toBe(1);
    expect(blended.toX).toBe(2);
  });

  test("far away it takes the server's walk and faces its heading", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const blended = blendIn(local, { fromX: 9, fromZ: 1, toX: 9, toZ: 1, startedAt: NOW, heading: 0.5 }, NOW);
    expect(blended.toX).toBe(9);
    expect(drawnPose(blended, blended.gait, NOW + TURN_MS + 1).heading).toBeCloseTo(0.5);
    const fresh = blendIn(null, { fromX: 3, fromZ: 3, toX: 3, toZ: 3, startedAt: NOW, heading: 1 }, NOW);
    expect(drawnPose(fresh, fresh.gait, NOW).heading).toBeCloseTo(1);
  });
});

import { describe, expect, test } from "vitest";
import type { Walk } from "../../shared/world";
import { blendIn, headFor } from "./blend";

const NOW = 10_000;

describe("blending the server's walk into this phone's", () => {
  test("an arrival seen while a local walk still ends at the same spot keeps the server's heading", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const arrival: Walk = { fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: NOW, heading: -Math.PI / 2 };
    const blended = blendIn(local, arrival, NOW);
    expect(blended.heading).toBe(-Math.PI / 2);
    expect(blended.toX).toBe(1);
  });

  test("an arrival a short way from the local walk heads there and keeps the server's heading", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const arrival: Walk = { fromX: 2, fromZ: 1, toX: 2, toZ: 1, startedAt: NOW, heading: Math.PI };
    const blended = blendIn(local, arrival, NOW);
    expect(blended.toX).toBe(2);
    expect(blended.heading).toBe(Math.PI);
  });

  test("without a heading from the server nothing is added", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    expect(blendIn(local, { fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: NOW }, NOW)).toBe(local);
    expect(blendIn(local, { fromX: 2, fromZ: 1, toX: 2, toZ: 1, startedAt: NOW }, NOW)).not.toHaveProperty("heading");
  });

  test("far away it takes the server's walk, heading and all", () => {
    const local = headFor(null, { x: 1, z: 1 }, NOW - 5000);
    const blended = blendIn(local, { fromX: 9, fromZ: 1, toX: 9, toZ: 1, startedAt: NOW, heading: 0.5 }, NOW);
    expect(blended.toX).toBe(9);
    expect(blended.heading).toBe(0.5);
    expect(blendIn(null, { fromX: 3, fromZ: 3, toX: 3, toZ: 3, startedAt: NOW, heading: 1 }, NOW).heading).toBe(1);
  });
});

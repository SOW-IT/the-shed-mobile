import { describe, expect, test } from "vitest";
import { FLAMES, flameAt, PUFFS, puffAt } from "./fireMotion";

const phases = Array.from({ length: 48 }, (_, k) => k / 48);

describe("the campfire's flames", () => {
  test("flicker around their drawn size, never collapsing or doubling", () => {
    for (let i = 0; i < FLAMES; i++) {
      for (const phase of phases) {
        const f = flameAt(phase, i);
        expect(f.scaleY).toBeGreaterThan(0.8);
        expect(f.scaleY).toBeLessThan(1.2);
        expect(f.scaleX).toBeGreaterThan(0.9);
        expect(Math.abs(f.dx)).toBeLessThanOrEqual(0.05);
      }
    }
  });

  test("loop without a jump, and each tongue moves on its own", () => {
    for (let i = 0; i < FLAMES; i++) {
      const start = flameAt(0, i);
      const end = flameAt(1, i);
      expect(end.scaleY).toBeCloseTo(start.scaleY);
      expect(end.dx).toBeCloseTo(start.dx);
    }
    expect(flameAt(0.1, 0).scaleY).not.toBeCloseTo(flameAt(0.1, 1).scaleY);
  });
});

describe("the campfire's smoke", () => {
  test("each puff rises, grows and drifts, fading in and out at the ends of its rise", () => {
    for (let i = 0; i < PUFFS; i++) {
      const low = puffAt(((0.05 - i / PUFFS) % 1 + 1) % 1, i);
      const high = puffAt(((0.85 - i / PUFFS) % 1 + 1) % 1, i);
      expect(high.rise).toBeGreaterThan(low.rise);
      expect(high.scale).toBeGreaterThan(low.scale);
      expect(high.dx).toBeGreaterThan(low.dx);
      expect(puffAt(((0 - i / PUFFS) % 1 + 1) % 1, i).opacity).toBeCloseTo(0);
    }
  });

  test("puffs are spread through the loop, so smoke is always rising", () => {
    for (const phase of phases) {
      const seen = Array.from({ length: PUFFS }, (_, i) => puffAt(phase, i).opacity);
      expect(Math.max(...seen)).toBeGreaterThan(0.25);
    }
  });

  test("a puff's look is the same at the start and end of the loop", () => {
    for (let i = 0; i < PUFFS; i++) {
      expect(puffAt(1, i).rise).toBeCloseTo(puffAt(0, i).rise);
      expect(puffAt(-0.25, i).rise).toBeCloseTo(puffAt(0.75, i).rise);
    }
  });
});

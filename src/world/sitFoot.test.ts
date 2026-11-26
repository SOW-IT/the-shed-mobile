import { describe, expect, test } from "vitest";
import { seatedFoot } from "./sitFoot";

const base = { foot: { x: 100, y: 200 }, s: 40, up: 33.4, sit: 0.3 };

describe("seatedFoot", () => {
  test("facing straight forward keeps both feet side-by-side in front of the bench", () => {
    const left = seatedFoot({ ...base, facing: 1, side: 0, e: -1 });
    const right = seatedFoot({ ...base, facing: 1, side: 0, e: 1 });
    expect(left.x).toBeCloseTo(100 - 0.13 * 40);
    expect(right.x).toBeCloseTo(100 + 0.13 * 40);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.y).toBeCloseTo(200 - 0.18 * 33.4 + 0.17 * 40);
  });

  test("sitting sideways on a bench keeps both feet out to the side and higher than front-facing", () => {
    const facing = Math.cos(Math.PI / 3);
    const side = Math.sin(Math.PI / 3);
    const frontY = seatedFoot({ ...base, facing: 1, side: 0, e: 1 }).y;
    const inner = seatedFoot({ ...base, facing, side, e: -1 });
    const outer = seatedFoot({ ...base, facing, side, e: 1 });
    // Both feet sit clearly off to the right side of the seat.
    expect(inner.x).toBeGreaterThan(base.foot.x + 0.3 * base.s);
    expect(outer.x).toBeGreaterThan(inner.x);
    // Both feet stay higher up than dangling straight down below the seat.
    expect(inner.y).toBeLessThan(frontY - 0.15 * base.s);
    expect(outer.y).toBeLessThan(inner.y);
  });

  test("facing left mirrors facing right symmetrically", () => {
    const facing = Math.cos(Math.PI / 3);
    const side = Math.sin(Math.PI / 3);
    const rightA = seatedFoot({ ...base, facing, side, e: -1 });
    const rightB = seatedFoot({ ...base, facing, side, e: 1 });
    const leftA = seatedFoot({ ...base, facing, side: -side, e: 1 });
    const leftB = seatedFoot({ ...base, facing, side: -side, e: -1 });
    expect(leftA.x - base.foot.x).toBeCloseTo(-(rightA.x - base.foot.x));
    expect(leftB.x - base.foot.x).toBeCloseTo(-(rightB.x - base.foot.x));
    expect(leftA.y).toBeCloseTo(rightA.y);
    expect(leftB.y).toBeCloseTo(rightB.y);
  });

  test("sitting on the ground keeps the ground-sitting foot offset", () => {
    const p = seatedFoot({ ...base, sit: 0, facing: 1, side: 0, e: 1 });
    expect(p.x).toBeCloseTo(100 + 0.18 * 40);
    expect(p.y).toBeCloseTo(200 - 0.06 * 33.4 + 0.2 * 40);
  });
});

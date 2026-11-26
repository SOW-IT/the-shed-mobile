import { describe, expect, test } from "vitest";
import { STRIDE_RATE, strideBob } from "./gait";
import { limbsFor, RESTING_LIMBS } from "./limbs";

const at = (angle: number, strideAmp = 1) => ({ stridePhase: angle / STRIDE_RATE, strideAmp });

describe("walking", () => {
  test("each arm swings forward with the opposite foot", () => {
    const limbs = limbsFor(at(0), null);
    const [left, right] = limbs.hands;
    const [leftFoot, rightFoot] = limbs.feet;
    expect(right.fwd).toBeGreaterThan(0.1);
    expect(left.fwd).toBeCloseTo(-right.fwd);
    expect(leftFoot.fwd).toBeGreaterThan(0.1);
    expect(rightFoot.fwd).toBeCloseTo(-leftFoot.fwd);
    expect(Math.sign(right.fwd)).toBe(Math.sign(leftFoot.fwd));
  });

  test("half a stride later they've swapped over", () => {
    const now = limbsFor(at(0), null);
    const later = limbsFor(at(Math.PI), null);
    expect(later.hands[1].fwd).toBeCloseTo(-now.hands[1].fwd);
    expect(later.feet[0].fwd).toBeCloseTo(-now.feet[0].fwd);
  });

  test("a foot is lifted only while it swings forward, highest as the body bobs highest", () => {
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * Math.PI * 2;
      const now = limbsFor(at(angle), null);
      const next = limbsFor(at(angle + 0.01), null);
      for (const i of [0, 1]) {
        const forward = next.feet[i].fwd > now.feet[i].fwd + 1e-6;
        if (now.feet[i].up > 1e-6) expect(forward).toBe(true);
      }
      expect(Math.min(now.feet[0].up, now.feet[1].up)).toBe(0);
    }
    const peak = limbsFor(at(Math.PI / 2), null);
    expect(strideBob(at(Math.PI / 2))).toBeCloseTo(0.14);
    expect(Math.max(peak.feet[0].up, peak.feet[1].up)).toBeCloseTo(0.09);
  });

  test("the swing shrinks with the stride as someone stops, and is gone at rest", () => {
    const full = limbsFor(at(0.4), null);
    const half = limbsFor(at(0.4, 0.5), null);
    expect(half.hands[1].fwd).toBeCloseTo(full.hands[1].fwd / 2);
    expect(half.feet[0].up).toBeCloseTo(full.feet[0].up / 2);
    expect(limbsFor(at(0.4, 0), null)).toBe(RESTING_LIMBS);
    expect(limbsFor(undefined, null)).toBe(RESTING_LIMBS);
  });

  test("moves smoothly: no jumps between frames", () => {
    let last = limbsFor(at(0, 0), null);
    for (let frame = 1; frame <= 60; frame++) {
      const ms = frame * 16;
      const limbs = limbsFor({ stridePhase: ms / 1000, strideAmp: Math.min(1, ms / 120) }, null);
      for (const i of [0, 1]) {
        expect(Math.abs(limbs.hands[i].fwd - last.hands[i].fwd)).toBeLessThan(0.05);
        expect(Math.abs(limbs.feet[i].fwd - last.feet[i].fwd)).toBeLessThan(0.05);
        expect(Math.abs(limbs.feet[i].up - last.feet[i].up)).toBeLessThan(0.05);
      }
      last = limbs;
    }
  });
});

describe("standing still", () => {
  test("without sway, nothing moves", () => {
    expect(limbsFor({ stridePhase: 0, strideAmp: 0 }, null)).toBe(RESTING_LIMBS);
  });

  test("with sway, the body breathes and sways and the hands follow; the feet stay put", () => {
    const seen = Array.from({ length: 60 }, (_, k) => limbsFor({ stridePhase: 0, strideAmp: 0 }, { t: k * 0.1, seed: 2 }));
    const range = (pick: (l: (typeof seen)[number]) => number) => Math.max(...seen.map(pick)) - Math.min(...seen.map(pick));
    expect(range((l) => l.breath)).toBeGreaterThan(0.01);
    expect(Math.min(...seen.map((l) => l.breath))).toBeGreaterThanOrEqual(0);
    expect(range((l) => l.sway)).toBeGreaterThan(0.03);
    expect(range((l) => l.handsAcross)).toBeGreaterThan(0.01);
    expect(range((l) => l.hands[0].fwd)).toBeGreaterThan(0.01);
    for (const l of seen) {
      for (const f of l.feet) expect(Math.abs(f.fwd) + f.up).toBe(0);
      expect(Math.abs(l.sway)).toBeLessThan(0.03);
    }
  });

  test("the sway fades in as the stride fades out", () => {
    const sway = { t: 1.3, seed: 0 };
    const stopped = limbsFor({ stridePhase: 2, strideAmp: 0 }, sway);
    const stopping = limbsFor({ stridePhase: 2, strideAmp: 0.75 }, sway);
    expect(stopping.sway).toBeCloseTo(stopped.sway / 4);
    expect(limbsFor({ stridePhase: 2, strideAmp: 1 }, sway).sway).toBe(0);
  });

  test("different people sway out of step", () => {
    const a = limbsFor(undefined, { t: 2, seed: 0 });
    const b = limbsFor(undefined, { t: 2, seed: 4 });
    expect(a.sway).not.toBeCloseTo(b.sway);
  });
});

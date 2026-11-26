import { describe, expect, test } from "vitest";
import {
  backpackPose,
  bodyHalfWidth,
  bodySurface,
  bowTiePose,
  necklacePose,
  PLAID_ANGLES,
  POLKA_DOTS,
  scarfPose,
  surfaceDots,
  surfaceSegment,
  surfaceStrip,
  TIE_DYE_BLOBS,
  type BodyView,
} from "./bodywear";

const view = (heading: number, width = 1, height = 1): BodyView => ({
  footX: 100,
  footY: 200,
  s: 50,
  up: 43,
  bob: 0,
  dx: 0,
  width,
  height,
  facing: Math.cos(heading),
  side: Math.sin(heading),
});

const FRONT = view(0);
const RIGHT = view(Math.PI / 2);
const LEFT = view(-Math.PI / 2);
const BACK = view(Math.PI);

describe("bodySurface and surfaceStrip", () => {
  test("projects front centerline at x = footX from front, edge from side, and behind from back", () => {
    const f = bodySurface(FRONT, 0, 0.5);
    const r = bodySurface(RIGHT, 0, 0.5);
    const b = bodySurface(BACK, 0, 0.5);
    expect(f.at.x).toBeCloseTo(100);
    expect(f.front).toBe(true);
    expect(r.at.x).toBeCloseTo(100 + bodyHalfWidth(0.5) * 50);
    expect(b.front).toBe(false);
  });

  test("surfaceStrip stays centered at front, shifts toward facing side, and disappears behind", () => {
    const f = surfaceStrip(FRONT, 0.7, 0.2, [-0.34, 0.34], [-0.28, 0.28]);
    const q = surfaceStrip(view(Math.PI / 4), 0.7, 0.2, [-0.34, 0.34], [-0.28, 0.28]);
    const b = surfaceStrip(BACK, 0.7, 0.2, [-0.34, 0.34], [-0.28, 0.28]);
    expect(f).not.toBeNull();
    expect((f![0].x + f![1].x) / 2).toBeCloseTo(100);
    expect(q).not.toBeNull();
    expect((q![0].x + q![1].x) / 2).toBeGreaterThan(100);
    expect(b).toBeNull();
  });

  test("surfaceSegment clips straps onto the visible torso side", () => {
    const frontBrace = surfaceSegment(FRONT, 0.56, 0.7, 0.5, 0.56);
    const backBraceAtFront = surfaceSegment(FRONT, Math.PI - 0.68, 0.7, Math.PI - 0.16, 0.36);
    const backBraceAtBack = surfaceSegment(BACK, Math.PI - 0.68, 0.7, Math.PI - 0.16, 0.36);
    expect(frontBrace).not.toBeNull();
    expect(backBraceAtFront).toBeNull();
    expect(backBraceAtBack).not.toBeNull();
    expect(PLAID_ANGLES.filter((a) => surfaceSegment(BACK, a, 0.66, a, 0.2, 0.18) !== null).length).toBeGreaterThan(0);
  });
});

describe("surfaceDots", () => {
  test("shows dots around the entire torso and foreshortens near edges", () => {
    for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const dots = surfaceDots(view(h), POLKA_DOTS, 0.16);
      expect(dots.length).toBeGreaterThan(0);
      for (const d of dots) expect(d.rx).toBeLessThanOrEqual(d.ry + 1e-6);
    }
    const f = surfaceDots(FRONT, TIE_DYE_BLOBS, 0.16);
    const b = surfaceDots(BACK, TIE_DYE_BLOBS, 0.16);
    expect(f.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(f[0].index).not.toBe(b[0].index);
  });
});

describe("backpackPose", () => {
  test("draws behind from front, over from behind, and sits flush behind the torso side-on", () => {
    const f = backpackPose(FRONT);
    const b = backpackPose(BACK);
    const r = backpackPose(RIGHT);
    const l = backpackPose(LEFT);
    expect(f.over).toBe(false);
    expect(f.pocket).toBeNull();
    expect(b.over).toBe(true);
    expect(b.pocket).not.toBeNull();
    expect(f.left + f.width / 2).toBeCloseTo(100);
    expect(b.left + b.width / 2).toBeCloseTo(100);
    expect(r.width).toBeLessThan(f.width);
    expect(r.left + r.width).toBeCloseTo(100 - bodyHalfWidth(0.46) * 50, 1);
    expect(l.left).toBeCloseTo(100 + bodyHalfWidth(0.46) * 50, 1);
  });

  test("scales width and height with body build", () => {
    const narrow = backpackPose(view(Math.PI, 0.85, 0.8));
    const broad = backpackPose(view(Math.PI, 1.15, 1.2));
    expect(broad.width).toBeGreaterThan(narrow.width);
    expect(broad.height).toBeGreaterThan(narrow.height);
    expect(narrow.left + narrow.width / 2).toBeCloseTo(100);
    expect(broad.left + broad.width / 2).toBeCloseTo(100);
  });
});

describe("scarfPose", () => {
  test("keeps tail in front from front and left, and tucks behind from right and back", () => {
    const f = scarfPose(FRONT, 0.51, 0);
    const l = scarfPose(LEFT, 0.51, 0);
    const r = scarfPose(RIGHT, 0.51, 0);
    const b = scarfPose(BACK, 0.51, 0);
    expect(f.tailInFront).toBe(true);
    expect(f.tailStart.x).toBeGreaterThan(100);
    expect(l.tailInFront).toBe(true);
    expect(l.tailStart.x).toBeLessThan(100);
    expect(r.tailInFront).toBe(false);
    expect(b.tailInFront).toBe(false);
  });
});

describe("bowTiePose", () => {
  test("shifts to the facing edge side-on and hides from behind", () => {
    const f = bowTiePose(FRONT, 0.51);
    const r = bowTiePose(RIGHT, 0.51);
    const b = bowTiePose(BACK, 0.51);
    expect(f.visible).toBe(true);
    expect(f.knot.x).toBeCloseTo(100);
    expect(r.visible).toBe(true);
    expect(r.knot.x).toBeGreaterThan(110);
    expect(b.visible).toBe(false);
  });
});

describe("necklacePose", () => {
  test("wraps pearls around front, side, and back while hiding the pendant from behind", () => {
    const f = necklacePose(FRONT, 0.51);
    const r = necklacePose(RIGHT, 0.51);
    const b = necklacePose(BACK, 0.51);
    expect(f.pearls.length).toBeGreaterThanOrEqual(5);
    expect(r.pearls.length).toBeGreaterThanOrEqual(5);
    expect(b.pearls.length).toBeGreaterThanOrEqual(5);
    expect(f.pendant).not.toBeNull();
    expect(f.pendant!.x).toBeCloseTo(100);
    expect(r.pendant).not.toBeNull();
    expect(r.pendant!.x).toBeGreaterThan(110);
    expect(b.pendant).toBeNull();
  });
});

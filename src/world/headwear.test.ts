import { describe, expect, test } from "vitest";
import { bandOverHead, capShape, depthOf, earCup, projectOnHead, type HeadView } from "./headwear";

const view = (heading: number): HeadView => ({ cx: 100, cy: 100, rx: 20, ry: 20, facing: Math.cos(heading), side: Math.sin(heading) });
const FRONT = view(0);
const SIDE = view(Math.PI / 2);
const BACK = view(Math.PI);

describe("projecting onto the head", () => {
  test("the face points at the camera from the front and away from behind", () => {
    expect(depthOf(FRONT, [0, 0, 1])).toBeGreaterThan(0.9);
    expect(depthOf(BACK, [0, 0, 1])).toBeLessThan(-0.9);
    expect(projectOnHead(FRONT, [0, 0, 1]).x).toBeCloseTo(100);
    expect(projectOnHead(SIDE, [0, 0, 1]).x).toBeCloseTo(120);
  });

  test("the top of the head is above its middle at every turn", () => {
    for (const heading of [0, 0.75, Math.PI / 2, 2.3, Math.PI]) expect(projectOnHead(view(heading), [0, 1, 0]).y).toBeLessThan(85);
  });
});

describe("the cap", () => {
  test("its edge is high over the forehead and low at the back", () => {
    const side = capShape(SIDE);
    const peakX = side.peak.centre.x;
    expect(peakX).toBeGreaterThan(110);
    const front = capShape(FRONT);
    const back = capShape(BACK);
    const lowest = (shape: ReturnType<typeof capShape>) => shape.rim.centre.y + Math.abs(shape.rim.b.y);
    expect(lowest(back)).toBeGreaterThan(lowest(front));
  });

  test("the peak points the way they face, and hides behind the head when they face away", () => {
    expect(capShape(FRONT).peakInFront).toBe(true);
    expect(capShape(view(0.75)).peakInFront).toBe(true);
    expect(capShape(BACK).peakInFront).toBe(false);
    expect(capShape(view(-Math.PI / 2)).peak.centre.x).toBeLessThan(90);
  });

  test("from the front the crown is above the edge; from behind it fills the edge", () => {
    expect(capShape(FRONT).rimIsCrown).toBe(false);
    expect(capShape(BACK).rimIsCrown).toBe(true);
    expect(capShape(SIDE).rimIsCrown).toBe(true);
  });

  test("the edge meets the outline of the head on both sides, and points up toward the top", () => {
    for (const heading of [0, 0.75, Math.PI / 2, 2.3, Math.PI]) {
      const shape = capShape(view(heading));
      expect(shape.edge).not.toBeNull();
      for (const p of shape.edge!) expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThan(20.5);
      expect(shape.rimUp.y).toBeLessThan(0.0001);
    }
  });

  test("a ring that never reaches the outline has no edge", () => {
    expect(capShape(FRONT, { y: 0.98, tilt: 0 }).edge).toBeNull();
  });
});

describe("headphones", () => {
  const fit = { across: 1.04, top: 1.03, ears: -0.12 };

  test("the band goes from ear to ear over the top", () => {
    const band = bandOverHead(FRONT, fit);
    expect(band[0].at.x).toBeCloseTo(120.8);
    expect(band[band.length - 1].at.x).toBeCloseTo(79.2);
    const top = band[Math.floor(band.length / 2)].at;
    expect(top.y).toBeLessThan(82);
    expect(band.slice(2, -2).every((point) => point.front)).toBe(true);
  });

  test("side on, the far half of the band is behind the head", () => {
    const band = bandOverHead(SIDE, fit);
    expect(band.some((point) => !point.front)).toBe(true);
    expect(band.some((point) => point.front)).toBe(true);
  });

  test("each cup sits at ear height, the far one behind the head", () => {
    const near = earCup(SIDE, -1, 1.02, -0.12);
    const far = earCup(SIDE, 1, 1.02, -0.12);
    expect(near.near).toBe(true);
    expect(far.near).toBe(false);
    expect(near.at.y).toBeGreaterThan(100);
    expect(near.facing).toBeGreaterThan(0.9);
    expect(earCup(FRONT, 1, 1.02, -0.12).facing).toBeLessThan(0.1);
  });
});

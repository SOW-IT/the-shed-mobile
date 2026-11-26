import { describe, expect, test } from "vitest";
import {
  backDrapeCover,
  bandOverHead,
  BEANIE_BODY,
  BEANIE_CUFF,
  beretPose,
  bowPose,
  braidPoints,
  capShape,
  crownShape,
  curlPoints,
  curtainsPose,
  depthOf,
  earCup,
  earFlowerPose,
  glassesTemples,
  headPoint,
  hoodLayer,
  mohawkPoints,
  ponytailPose,
  projectOnHead,
  ringOnHead,
  sideSweptPose,
  spikePoints,
  wavyHemPoints,
  type HeadView,
} from "./headwear";

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

describe("the hood", () => {
  const eighth = Math.PI / 4;
  test.each([
    ["front", 0, "behind"],
    ["front right", eighth, "behind"],
    ["right", 2 * eighth, "behind"],
    ["back right", 3 * eighth, "over"],
    ["back", 4 * eighth, "over"],
    ["back left", -3 * eighth, "over"],
    ["left", -2 * eighth, "behind"],
    ["front left", -eighth, "behind"],
  ] as const)("facing %s it is drawn %s the head and body", (_, heading, layer) => {
    expect(hoodLayer(Math.cos(heading))).toBe(layer);
  });
});

describe("the beanie rims", () => {
  test("body rim sits above the cuff rim at every heading", () => {
    for (const heading of [0, 0.75, Math.PI / 2, 2.3, Math.PI]) {
      const cuff = capShape(view(heading), BEANIE_CUFF);
      const body = capShape(view(heading), BEANIE_BODY);
      expect(body.rim.centre.y).toBeLessThan(cuff.rim.centre.y);
      expect(cuff.edge).not.toBeNull();
    }
  });
});

describe("ringOnHead", () => {
  const ring = { y: 0.56, tilt: 0.28, radius: 1.04 };

  test("splits front and back halves across headings", () => {
    const front = ringOnHead(FRONT, ring, 10);
    const back = ringOnHead(BACK, ring, 10);
    expect(front[0].front).toBe(true);
    expect(front[5].front).toBe(false);
    expect(back[0].front).toBe(false);
    expect(back[5].front).toBe(true);
  });

  test("side profile puts near side in front and far side behind", () => {
    const right = ringOnHead(SIDE, ring, 8);
    expect(right[2].front).toBe(false);
    expect(right[6].front).toBe(true);
  });
});

describe("beretPose", () => {
  test("flips tilt and offset symmetrically from front to back", () => {
    const f = beretPose(FRONT);
    const b = beretPose(BACK);
    expect(f.tilt).toBeLessThan(0);
    expect(b.tilt).toBeGreaterThan(0);
    expect(f.centre.x).toBeLessThan(100);
    expect(b.centre.x).toBeGreaterThan(100);
    expect(f.stalk.y).toBeLessThan(f.centre.y);
    expect(b.stalk.y).toBeLessThan(b.centre.y);
  });
});

describe("bowPose", () => {
  test("moves across the head and hides behind on the far side", () => {
    const f = bowPose(FRONT);
    const b = bowPose(BACK);
    const right = bowPose(SIDE);
    const left = bowPose(view(-Math.PI / 2));
    expect(f.front).toBe(true);
    expect(f.knot.at.x).toBeGreaterThan(100);
    expect(b.knot.at.x).toBeLessThan(100);
    expect(left.front).toBe(true);
    expect(right.front).toBe(false);
    expect(f.loops[0].depth).toBeLessThanOrEqual(f.loops[1].depth);
  });
});

describe("crownShape", () => {
  test("hides the front jewel when facing away and depth-sorts points", () => {
    const f = crownShape(FRONT);
    const b = crownShape(BACK);
    const s = crownShape(SIDE);
    expect(f.jewel.front).toBe(true);
    expect(b.jewel.front).toBe(false);
    expect(s.jewel.at.x).toBeGreaterThan(105);
    for (let i = 1; i < f.points.length; i++) {
      expect(f.points[i].depth).toBeGreaterThanOrEqual(f.points[i - 1].depth);
    }
    expect(f.points.some((p) => p.front)).toBe(true);
    expect(f.points.some((p) => !p.front)).toBe(true);
  });
});

describe("earFlowerPose", () => {
  test("stays on the character's left ear and moves behind the head when facing right", () => {
    const f = earFlowerPose(FRONT);
    const b = earFlowerPose(BACK);
    const right = earFlowerPose(SIDE);
    const left = earFlowerPose(view(-Math.PI / 2));
    expect(f.front).toBe(true);
    expect(f.centre.x).toBeGreaterThan(115);
    expect(b.centre.x).toBeLessThan(85);
    expect(left.front).toBe(true);
    expect(left.facing).toBeGreaterThan(0.9);
    expect(right.front).toBe(false);
    expect(f.petals).toHaveLength(5);
  });
});

describe("glassesTemples", () => {
  test("hides arms from behind and shows near arm side-on", () => {
    const f = glassesTemples(FRONT, -0.04, 0.6);
    const b = glassesTemples(BACK, -0.04, 0.6);
    const right = glassesTemples(SIDE, -0.04, 0.6);
    expect(f.every((t) => t.armFront)).toBe(true);
    expect(b.every((t) => !t.armFront)).toBe(true);
    const near = right.find((t) => t.side === -1)!;
    const far = right.find((t) => t.side === 1)!;
    expect(near.armFront).toBe(true);
    expect(near.hookFront).toBe(true);
    expect(far.armFront).toBe(false);
  });
});

describe("3D hair projections", () => {
  test("bun moves in front of the head from behind", () => {
    expect(headPoint(FRONT, [0, 1.02, -0.36]).front).toBe(false);
    expect(headPoint(BACK, [0, 1.02, -0.36]).front).toBe(true);
  });

  test("ponytail sits behind from front and in front from behind without jumping height", () => {
    const f = ponytailPose(FRONT, false, 0);
    const s = ponytailPose(SIDE, false, 0);
    const b = ponytailPose(BACK, false, 0);
    expect(f.front).toBe(false);
    expect(b.front).toBe(true);
    expect(s.tie.x).toBeLessThan(85);
    expect(b.tip.y).toBeGreaterThan(b.mid.y);
    expect(b.mid.y).toBeGreaterThan(b.tie.y);
  });

  test("curls sort back-to-front and drop crown curls when tucked", () => {
    const full = curlPoints(BACK, false);
    const tucked = curlPoints(BACK, true);
    expect(tucked.length).toBeLessThan(full.length);
    for (let i = 1; i < full.length; i++) expect(full[i].depth).toBeGreaterThanOrEqual(full[i - 1].depth);
    expect(full.some((c) => c.front)).toBe(true);
  });

  test("mohawk crest sorts in camera depth order for front and back", () => {
    const f = mohawkPoints(FRONT);
    const b = mohawkPoints(BACK);
    expect(f[0].index).toBe(0);
    expect(f[f.length - 1].index).toBe(4);
    expect(b[0].index).toBe(4);
    expect(b[b.length - 1].index).toBe(0);
  });

  test("braid goes behind the body when facing right or away", () => {
    expect(braidPoints(FRONT).front).toBe(true);
    expect(braidPoints(view(-Math.PI / 2)).front).toBe(true);
    expect(braidPoints(SIDE).front).toBe(false);
    expect(braidPoints(BACK).front).toBe(false);
  });

  test("spikes radiate outward above the head at every angle", () => {
    for (const h of [0, Math.PI / 2, Math.PI]) {
      const spikes = spikePoints(view(h));
      expect(spikes.every((sp) => sp.tip.y < sp.base.y)).toBe(true);
    }
  });

  test("wavy hem curls move in front when facing away", () => {
    const f = wavyHemPoints(FRONT, false);
    const b = wavyHemPoints(BACK, false);
    expect(f.filter((w) => w.front).length).toBeLessThan(b.filter((w) => w.front).length);
    expect(backDrapeCover(1)).toBe(0);
    expect(backDrapeCover(-1)).toBe(1);
    expect(backDrapeCover(-0.35)).toBeGreaterThan(0);
    expect(backDrapeCover(-0.35)).toBeLessThan(1);
  });

  test("side swept and curtains hide smoothly from behind", () => {
    expect(sideSweptPose(FRONT).visible).toBe(true);
    expect(sideSweptPose(BACK).visible).toBe(false);
    const f = curtainsPose(FRONT);
    const b = curtainsPose(BACK);
    const right = curtainsPose(SIDE);
    expect(f.parting.visible).toBe(true);
    expect(f.locks.every((l) => l.visible)).toBe(true);
    expect(b.parting.visible).toBe(false);
    expect(b.locks.every((l) => !l.visible)).toBe(true);
    expect(right.locks.some((l) => l.visible)).toBe(true);
    expect(right.locks.some((l) => !l.visible)).toBe(true);
  });
});

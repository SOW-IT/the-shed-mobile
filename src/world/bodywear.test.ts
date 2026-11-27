import { describe, expect, test } from "vitest";
import {
  backpackPose,
  bodyHalfWidth,
  bodySurface,
  bowTiePose,
  HOOD,
  HOODIE_POCKET,
  hoodPose,
  hoodRim,
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

  test("surfaceSegment clips at the exact requested depth angle", () => {
    const v = view(0.75);
    const minDepth = -0.02;
    const seg = surfaceSegment(v, 0.56, 0.38, 2.05, 0.36, minDepth);
    expect(seg).not.toBeNull();
    const p0 = bodySurface(v, 0.56, 0.38, 0.94);
    expect(seg!.depth).toBeCloseTo((p0.depth + minDepth) / 2, 5);
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

  test("scales width and height with body build and avoids 45-degree bulge", () => {
    const narrow = backpackPose(view(Math.PI, 0.85, 0.8));
    const broad = backpackPose(view(Math.PI, 1.15, 1.2));
    expect(broad.width).toBeGreaterThan(narrow.width);
    expect(broad.height).toBeGreaterThan(narrow.height);
    expect(narrow.left + narrow.width / 2).toBeCloseTo(100);
    expect(broad.left + broad.width / 2).toBeCloseTo(100);
    const back = backpackPose(BACK);
    const side = backpackPose(RIGHT);
    const diag = backpackPose(view((Math.PI * 3) / 4));
    expect(diag.width).toBeLessThan(back.width);
    expect(diag.width).toBeGreaterThan(side.width);
    expect(diag.pocket).not.toBeNull();
    expect(diag.pocket!.left).toBeGreaterThanOrEqual(diag.left);
    expect(diag.pocket!.left + diag.pocket!.width).toBeLessThanOrEqual(diag.left + diag.width);
  });
});

describe("the hoodie", () => {
  const CHIN = 0.6;

  test("the hood is one pouch on the back: centred from the front and behind, behind the spine side-on", () => {
    const f = hoodPose(FRONT, CHIN);
    const b = hoodPose(BACK, CHIN);
    const r = hoodPose(RIGHT, CHIN);
    const l = hoodPose(LEFT, CHIN);
    expect(f.centre.x).toBeCloseTo(100);
    expect(b.centre.x).toBeCloseTo(100);
    // Facing right, the back (and the hood) is on the left, and the other way round.
    expect(r.centre.x).toBeLessThan(100 - bodyHalfWidth(CHIN) * 50);
    expect(l.centre.x).toBeGreaterThan(100 + bodyHalfWidth(CHIN) * 50);
    expect(r.rx).toBeLessThan(f.rx);
    expect(f.rx).toBeCloseTo(b.rx);
  });

  test("it is drawn behind the head and body until it turns to the near side, and only then shows its opening and seam", () => {
    const f = hoodPose(FRONT, CHIN);
    const b = hoodPose(BACK, CHIN);
    expect(f.layer).toBe("behind");
    expect(f.opening).toBeNull();
    expect(f.seam).toBeNull();
    expect(b.layer).toBe("over");
    expect(b.opening).not.toBeNull();
    expect(b.seam).not.toBeNull();
    expect(b.opening!.centre.y).toBeLessThan(b.centre.y);
  });

  test("turning all the way round, the hood slides smoothly, with no jump to a second hood", () => {
    let prev = hoodPose(view(-Math.PI), CHIN);
    for (let i = 1; i <= 720; i++) {
      const next = hoodPose(view(-Math.PI + (i / 720) * Math.PI * 2), CHIN);
      expect(Math.abs(next.centre.x - prev.centre.x)).toBeLessThan(1);
      expect(Math.abs(next.centre.y - prev.centre.y)).toBeLessThan(1e-9);
      expect(Math.abs(next.rx - prev.rx)).toBeLessThan(1);
      prev = next;
    }
  });

  test("it moves with the body when it leans, bobs or grows", () => {
    const still = hoodPose(BACK, CHIN);
    const leaning = hoodPose({ ...BACK, dx: 0.08 }, CHIN);
    const bobbing = hoodPose({ ...BACK, bob: 0.05 }, CHIN);
    const tall = hoodPose(view(Math.PI, 1, 1.2), CHIN);
    // Like every point on the body, it leans in proportion to its height.
    expect(leaning.centre.x - still.centre.x).toBeCloseTo(0.08 * (CHIN - HOOD.drop) * 50);
    expect(bobbing.centre.y - still.centre.y).toBeCloseTo(-0.05 * 43);
    expect(tall.centre.y).toBeLessThan(still.centre.y);
    expect(tall.ry).toBeGreaterThan(still.ry);
  });

  test("the hood's edge and drawstrings are on the front of the body and hide from behind", () => {
    const f = hoodRim(FRONT, CHIN);
    const b = hoodRim(BACK, CHIN);
    expect(f.rim.length).toBe(8);
    expect(f.strings.map((x) => x.side)).toEqual([-1, 1]);
    // Low in the middle of the front, rising to the sides.
    const mid = f.rim[3].b;
    expect(mid.x).toBeCloseTo(100);
    expect(mid.y).toBeGreaterThan(f.rim[0].a.y);
    expect(b.rim).toEqual([]);
    expect(b.strings).toEqual([]);
  });

  test("side-on, the edge and strings move to the side the body faces", () => {
    const r = hoodRim(RIGHT, CHIN);
    // Only the near drawstring shows.
    expect(r.strings.map((x) => x.side)).toEqual([-1]);
    for (const str of r.strings) expect(str.a.x).toBeGreaterThan(100);
    expect(r.rim.length).toBeGreaterThan(0);
    expect(r.rim.length).toBeLessThan(8);
  });

  test("the pocket is on the front: whole from the front, to one side side-on, gone from behind", () => {
    const strip = (v: BodyView) => surfaceStrip(v, 0.38, 0.29, HOODIE_POCKET.top, HOODIE_POCKET.bottom);
    const f = strip(FRONT)!;
    expect((f[0].x + f[1].x) / 2).toBeCloseTo(100);
    const r = strip(RIGHT)!;
    expect(r[0].x).toBeGreaterThan(100);
    expect(strip(BACK)).toBeNull();
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
  test("wraps a tight pearl strand around the neck while hiding the pendant from behind", () => {
    const f = necklacePose(FRONT, 0.51);
    const r = necklacePose(RIGHT, 0.51);
    const b = necklacePose(BACK, 0.51);
    expect(f.pearls.length).toBeGreaterThanOrEqual(9);
    expect(r.pearls.length).toBeGreaterThanOrEqual(9);
    expect(b.pearls.length).toBeGreaterThanOrEqual(9);
    const frontXs = f.pearls.map((p) => p.at.x);
    expect(Math.max(...frontXs) - Math.min(...frontXs)).toBeLessThan(bodyHalfWidth(0.51) * 2 * 50 * 0.75);
    expect(f.pendant).not.toBeNull();
    expect(f.pendant!.x).toBeCloseTo(100);
    expect(r.pendant).not.toBeNull();
    expect(r.pendant!.x).toBeGreaterThan(105);
    expect(r.pendant!.x).toBeLessThan(100 + bodyHalfWidth(0.4) * 50);
    expect(b.pendant).toBeNull();
  });
});

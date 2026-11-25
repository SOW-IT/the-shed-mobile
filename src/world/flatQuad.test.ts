import { expect, test } from "vitest";
import { QUAD_SIZE } from "./camera";
import { cornerRadius, flatPieces, flatWarp, isParallelogram, parallelogramWarp, type FlatTransform } from "./flatQuad";

type Pt = { x: number; y: number };

const radians = (text: string) => Number(text.replace("rad", ""));

const place = (transform: FlatTransform, u: number, v: number): Pt => {
  const [{ translateX }, { translateY }, { rotate }, { skewX }, { scaleX }, { scaleY }] = transform;
  const half = QUAD_SIZE / 2;
  const x0 = (u - half) * scaleX;
  const y0 = (v - half) * scaleY;
  const x1 = x0 + Math.tan(radians(skewX)) * y0;
  const turn = radians(rotate);
  return {
    x: translateX + half + Math.cos(turn) * x1 - Math.sin(turn) * y0,
    y: translateY + half + Math.sin(turn) * x1 + Math.cos(turn) * y0,
  };
};

const near = (a: Pt, b: Pt, by = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(by));
  expect(a.y).toBeCloseTo(b.y, -Math.log10(by));
};

const S = QUAD_SIZE;

test.each([
  [[{ x: 10, y: 20 }, { x: 200, y: 30 }, { x: 190, y: 150 }, { x: 0, y: 140 }]],
  [[{ x: 50, y: 50 }, { x: 50, y: 150 }, { x: -50, y: 150 }, { x: -50, y: 50 }]],
  [[{ x: 0, y: 0 }, { x: -80, y: 0 }, { x: -60, y: 40 }, { x: 20, y: 40 }]],
])("a parallelogram is one view, warped onto its corners with skew, scale and turn", (q) => {
  expect(isParallelogram(q)).toBe(true);
  const transform = parallelogramWarp(q)!;
  near(place(transform, 0, 0), q[0]);
  near(place(transform, S, 0), q[1]);
  near(place(transform, S, S), q[2]);
  near(place(transform, 0, S), q[3]);
  expect(flatPieces(q, 30)).toEqual([{ kind: "rect", key: "r", transform }]);
});

test("a flat or zero-size quad has no warp and draws nothing", () => {
  expect(flatWarp({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeNull();
  expect(flatWarp({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBeNull();
  expect(flatPieces([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([]);
});

const trapezoid = [{ x: 40, y: 10 }, { x: 160, y: 10 }, { x: 200, y: 110 }, { x: 0, y: 110 }];

test("a quad in perspective is two triangles that meet across the diagonal, a little overlapped", () => {
  expect(isParallelogram(trapezoid)).toBe(false);
  const pieces = flatPieces(trapezoid);
  expect(pieces.map((p) => p.kind)).toEqual(["triangle", "triangle"]);
  const corners = pieces.map((piece) => {
    if (piece.kind !== "triangle") throw new Error("not a triangle");
    return [place(piece.transform, 0, S), place(piece.transform, S, S), place(piece.transform, S, 0)];
  });
  const [[a0, a1, a2], [b0, b2, b3]] = corners;
  near(a0, { x: 40, y: 10 }, 1);
  near(a1, { x: 160, y: 10 }, 1);
  near(a2, { x: 200, y: 110 }, 1);
  near(b0, { x: 40, y: 10 }, 1);
  near(b2, { x: 200, y: 110 }, 1);
  near(b3, { x: 0, y: 110 }, 1);
  expect(a0.x).toBeLessThan(40);
  expect(a0.y).toBeLessThan(10);
});

test("a rounded quad in perspective keeps round corners: an inset core, four bands and four dots", () => {
  const r = cornerRadius(trapezoid, 30);
  expect(r).toBeCloseTo(0.3 * Math.hypot(40, 100));
  const pieces = flatPieces(trapezoid, 30);
  expect(pieces.map((p) => p.kind)).toEqual(["triangle", "triangle", "band", "band", "band", "band", "dot", "dot", "dot", "dot"]);
  const dots = pieces.filter((p) => p.kind === "dot");
  for (const dot of dots) {
    expect(dot.r).toBeCloseTo(r);
    expect(dot.x).toBeGreaterThan(r - 1);
    expect(dot.x).toBeLessThan(200 - r + 1);
    expect(dot.y).toBeCloseTo(dot.y < 60 ? 10 + r : 110 - r);
  }
  const top = pieces[2];
  if (top.kind !== "band") throw new Error("not a band");
  near(place(top.transform, 0, S), { x: dots[0].x, y: 10 }, 1);
});

test("small rounding is drawn sharp, and rounding that can't fit falls back to triangles", () => {
  expect(flatPieces(trapezoid, 0.5).map((p) => p.kind)).toEqual(["triangle", "triangle"]);
  const sliver = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 4 }, { x: 0, y: 2 }];
  expect(flatPieces(sliver, 50).map((p) => p.kind)).toEqual(["triangle", "triangle"]);
});

test("the corners turn the same way whichever way round the quad is listed", () => {
  const reversed = [...trapezoid].reverse();
  expect(flatPieces(reversed, 30).filter((p) => p.kind === "dot")).toHaveLength(4);
});

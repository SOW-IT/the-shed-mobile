import { expect, test } from "vitest";
import { makeCamera, quadMatrix } from "./camera";

test("a ground point projects and comes back", () => {
  const cam = makeCamera(390, 844, { x: 0, z: -2.6 });
  const p = cam.project([1.5, 0, 3]);
  const back = cam.ground(p.x, p.y)!;
  expect(back.x).toBeCloseTo(1.5);
  expect(back.z).toBeCloseTo(3);
  expect(cam.ground(195, -5000)).toBeNull();
  // Nearer is bigger.
  expect(cam.project([0, 0, 5]).scale).toBeGreaterThan(cam.project([0, 0, -5]).scale);
});

const warp = (M: number[], u: number, v: number) => {
  const px = u - 50;
  const py = v - 50;
  const w = px * M[3] + py * M[7] + M[15];
  return [(px * M[0] + py * M[4] + M[12]) / w + 50, (px * M[1] + py * M[5] + M[13]) / w + 50].map((n) => Math.round(n));
};

test.each([
  [[{ x: 10, y: 20 }, { x: 200, y: 30 }, { x: 180, y: 150 }, { x: 5, y: 140 }]],
  [[{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 0, y: 20 }]],
])("quadMatrix warps the square's corners onto the quad, about the view's centre", (quad) => {
  const M = quadMatrix(quad);
  const corners = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([u, v]) => warp(M, u, v));
  expect(corners).toEqual(quad.map((p) => [p.x, p.y]));
});

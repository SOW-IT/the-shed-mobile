type Vec3 = readonly [number, number, number];
export type Point = { x: number; y: number };
export type HeadView = { cx: number; cy: number; rx: number; ry: number; facing: number; side: number };
export type Disc = { centre: Point; a: Point; b: Point };

export const HAT_PITCH = 0.24;
const COS_PITCH = Math.cos(HAT_PITCH);
const SIN_PITCH = Math.sin(HAT_PITCH);

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const plus = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / n, a[1] / n, a[2] / n];
};

const toCamera = (v: HeadView): Vec3 => [-v.side * COS_PITCH, SIN_PITCH, v.facing * COS_PITCH];

export const depthOf = (v: HeadView, p: Vec3) => dot(p, toCamera(v));

const across = (v: HeadView, d: Vec3): Point => ({
  x: (d[0] * v.facing + d[2] * v.side) * v.rx,
  y: -(d[1] * COS_PITCH - (-d[0] * v.side + d[2] * v.facing) * SIN_PITCH) * v.ry,
});

export const projectOnHead = (v: HeadView, p: Vec3): Point => {
  const d = across(v, p);
  return { x: v.cx + d.x, y: v.cy + d.y };
};

const discOf = (v: HeadView, centre: Vec3, u: Vec3, w: Vec3, ru: number, rw: number): Disc => {
  const a = across(v, u);
  const b = across(v, w);
  return { centre: projectOnHead(v, centre), a: { x: a.x * ru, y: a.y * ru }, b: { x: b.x * rw, y: b.y * rw } };
};

const UP: Vec3 = [0, 1, 0];
const RIGHT: Vec3 = [1, 0, 0];

type CapRim = { y: number; tilt: number };

const CAP_RIM: CapRim = { y: 0.1, tilt: 0.36 };

type CapShape = {
  rim: Disc;
  rimIsCrown: boolean;
  edge: [Point, Point] | null;
  rimAcross: Point;
  rimUp: Point;
  top: Point;
  peak: Disc;
  peakInFront: boolean;
};

export const capShape = (v: HeadView, { y, tilt }: CapRim = CAP_RIM): CapShape => {
  const n = Math.hypot(1, tilt);
  const normal: Vec3 = [0, 1 / n, -tilt / n];
  const along: Vec3 = [0, tilt / n, 1 / n];
  const d = y / n;
  const centre: Vec3 = [0, normal[1] * d, normal[2] * d];
  const radius = Math.sqrt(Math.max(0, 1 - d * d));
  const cam = toCamera(v);
  const a = radius * dot(RIGHT, cam);
  const b = radius * dot(along, cam);
  const k = -dot(centre, cam);
  const reach = Math.hypot(a, b);
  let edge: [Point, Point] | null = null;
  const base = Math.atan2(b, a);
  if (reach > Math.abs(k) + 1e-6) {
    const spread = Math.acos(k / reach);
    edge = [base - spread, base + spread].map((phi) =>
      projectOnHead(v, plus(plus(centre, RIGHT, radius * Math.cos(phi)), along, radius * Math.sin(phi)))
    ) as [Point, Point];
  }
  const rim = discOf(v, centre, RIGHT, along, radius, radius);
  const across = { x: -Math.sin(base) * rim.a.x + Math.cos(base) * rim.b.x, y: -Math.sin(base) * rim.a.y + Math.cos(base) * rim.b.y };
  const up = { x: Math.cos(base) * rim.a.x + Math.sin(base) * rim.b.x, y: Math.cos(base) * rim.a.y + Math.sin(base) * rim.b.y };
  const top = projectOnHead(v, UP);
  const upward = (top.x - rim.centre.x) * up.x + (top.y - rim.centre.y) * up.y >= 0;
  const front = plus(centre, along, radius);
  const out = unit([0, tilt / n - 0.55, 1 / n]);
  return {
    rim,
    rimIsCrown: dot(normal, cam) > 0,
    edge,
    rimAcross: across,
    rimUp: upward ? up : { x: -up.x, y: -up.y },
    top,
    peak: discOf(v, front, RIGHT, out, 0.8, 0.66),
    peakInFront: depthOf(v, front) > -0.08,
  };
};

export const bandOverHead = (v: HeadView, { across, top, ears }: { across: number; top: number; ears: number }, steps = 18) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = Math.PI * (i / steps);
    const p: Vec3 = [Math.cos(a) * across, ears + Math.sin(a) * (top - ears), 0];
    return { at: projectOnHead(v, p), front: depthOf(v, p) >= 0 };
  });

export const earCup = (v: HeadView, e: -1 | 1, out: number, ears: number) => {
  const p: Vec3 = [e * out, ears, 0];
  return { at: projectOnHead(v, p), near: depthOf(v, [e, 0, 0]) > -0.05, facing: Math.abs(dot(unit([e, 0, 0]), toCamera(v))) };
};

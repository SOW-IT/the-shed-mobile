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

export const hoodLayer = (facing: number): "behind" | "over" => (facing >= 0 ? "behind" : "over");

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

export const BEANIE_CUFF: CapRim = { y: 0.04, tilt: 0.26 };
export const BEANIE_BODY: CapRim = { y: 0.28, tilt: 0.26 };

type HeadDot = { at: Point; depth: number; front: boolean };

export const headPoint = (v: HeadView, p: Vec3, threshold = 0): HeadDot => {
  const depth = depthOf(v, p);
  return { at: projectOnHead(v, p), depth, front: depth >= threshold };
};

export const ringOnHead = (v: HeadView, { y, tilt, radius }: { y: number; tilt: number; radius: number }, count: number, offset = 0) => {
  const n = Math.hypot(1, tilt);
  const normal: Vec3 = [0, 1 / n, -tilt / n];
  const along: Vec3 = [0, tilt / n, 1 / n];
  const d = y / n;
  const centre: Vec3 = [0, normal[1] * d, normal[2] * d];
  const r = Math.sqrt(Math.max(0, radius * radius - d * d));
  return Array.from({ length: count }, (_, index) => {
    const a = offset + (index / count) * Math.PI * 2;
    const p = plus(plus(centre, RIGHT, Math.sin(a) * r), along, Math.cos(a) * r);
    const depth = depthOf(v, p);
    return { index, at: projectOnHead(v, p), depth, front: depth >= 0 };
  });
};

const BERET_NORMAL = unit([-0.18, 1, -0.2]);

export const beretPose = (v: HeadView, rise = 0) => {
  const centre: Vec3 = [-0.12, 0.85 + rise, -0.05];
  const stalk = plus(centre, BERET_NORMAL, 0.34);
  const up = across(v, BERET_NORMAL);
  return {
    centre: projectOnHead(v, centre),
    stalk: projectOnHead(v, stalk),
    tilt: Math.atan2(up.x, -up.y),
    stalkInFront: depthOf(v, stalk) >= depthOf(v, centre) - 0.1,
  };
};

const BOW_AXIS = unit([0.82, -0.4, -0.4]);

export const bowPose = (v: HeadView, rise = 0) => {
  const centre: Vec3 = [0.46, 0.86 + rise, 0.16];
  const out = unit(centre);
  const knot = plus(centre, out, 0.06);
  const facing = Math.abs(dot(out, toCamera(v)));
  const scale = 0.55 + 0.45 * facing;
  const depth = depthOf(v, centre);
  const loops = ([-1, 1] as const).map((side) => {
    const p = plus(centre, BOW_AXIS, side * 0.25);
    return { side, at: projectOnHead(v, p), depth: depthOf(v, p), scale };
  });
  loops.sort((a, b) => a.depth - b.depth);
  return {
    front: depth >= -0.08,
    depth,
    knot: { at: projectOnHead(v, knot), depth: depthOf(v, knot) },
    loops,
  };
};

export const crownShape = (v: HeadView, rise = 0) => {
  const radius = 0.45;
  const tipRadius = radius * 0.78;
  const yBase = 0.86 + rise;
  const yBand = 1.06 + rise;
  const yTip = 1.32 + rise;
  const count = 5;
  const span = 0.3;
  const centerDepth = depthOf(v, [0, yBand, 0]);
  const points = Array.from({ length: count }, (_, index) => {
    const a = (index / count) * Math.PI * 2;
    const tipP: Vec3 = [Math.sin(a) * tipRadius, yTip, Math.cos(a) * tipRadius];
    const leftP: Vec3 = [Math.sin(a - span) * radius, yBand, Math.cos(a - span) * radius];
    const rightP: Vec3 = [Math.sin(a + span) * radius, yBand, Math.cos(a + span) * radius];
    const depth = depthOf(v, [Math.sin(a) * radius, yBand, Math.cos(a) * radius]);
    return {
      index,
      left: projectOnHead(v, leftP),
      right: projectOnHead(v, rightP),
      tip: projectOnHead(v, tipP),
      depth,
      front: depth >= centerDepth - 0.02,
    };
  });
  points.sort((a, b) => a.depth - b.depth);
  const jewelP: Vec3 = [0, yBase + (yBand - yBase) * 0.45, radius + 0.03];
  return {
    base: projectOnHead(v, [0, yBase, 0]),
    band: projectOnHead(v, [0, yBand, 0]),
    rx: v.rx * radius,
    ry: v.ry * radius * SIN_PITCH,
    points,
    jewel: { at: projectOnHead(v, jewelP), front: v.facing >= -0.05 },
  };
};

const EAR_FLOWER_POS: Vec3 = [0.96, 0.34, 0.12];
const EAR_FLOWER_N = unit(EAR_FLOWER_POS);
const EAR_FLOWER_T1 = unit([EAR_FLOWER_N[2], 0, -EAR_FLOWER_N[0]]);
const EAR_FLOWER_T2: Vec3 = [
  EAR_FLOWER_N[1] * EAR_FLOWER_T1[2] - EAR_FLOWER_N[2] * EAR_FLOWER_T1[1],
  EAR_FLOWER_N[2] * EAR_FLOWER_T1[0] - EAR_FLOWER_N[0] * EAR_FLOWER_T1[2],
  EAR_FLOWER_N[0] * EAR_FLOWER_T1[1] - EAR_FLOWER_N[1] * EAR_FLOWER_T1[0],
];

export const earFlowerPose = (v: HeadView) => {
  const petalR = 0.16;
  const depth = depthOf(v, EAR_FLOWER_POS);
  const petals = Array.from({ length: 5 }, (_, index) => {
    const a = (index / 5) * Math.PI * 2;
    const p = plus(plus(EAR_FLOWER_POS, EAR_FLOWER_T1, Math.cos(a) * petalR), EAR_FLOWER_T2, Math.sin(a) * petalR);
    return { index, at: projectOnHead(v, p), depth: depthOf(v, p) };
  });
  return {
    front: depth >= -0.08,
    depth,
    facing: Math.abs(dot(EAR_FLOWER_N, toCamera(v))),
    centre: projectOnHead(v, EAR_FLOWER_POS),
    petals,
  };
};

export const glassesTemples = (v: HeadView, eyeY: number, eyeOut: number) =>
  ([-1, 1] as const).map((side) => {
    const lens: Vec3 = [side * eyeOut, eyeY, 0.86];
    const ear: Vec3 = [side * 1.02, eyeY + 0.05, 0.02];
    const hook: Vec3 = [side * 1.0, eyeY - 0.14, -0.22];
    const armMid: Vec3 = [(lens[0] + ear[0]) / 2, (lens[1] + ear[1]) / 2, (lens[2] + ear[2]) / 2];
    const hookMid: Vec3 = [(ear[0] + hook[0]) / 2, (ear[1] + hook[1]) / 2, (ear[2] + hook[2]) / 2];
    return {
      side,
      lens: projectOnHead(v, lens),
      ear: projectOnHead(v, ear),
      hook: projectOnHead(v, hook),
      armFront: depthOf(v, armMid) >= 0,
      hookFront: depthOf(v, hookMid) >= 0,
    };
  });

export const ponytailPose = (v: HeadView, capped: boolean, swing: number) => {
  const yTie = capped ? 0.14 : 0.42;
  const tieP: Vec3 = [0, yTie, -0.96];
  const midP: Vec3 = [swing * 0.45, yTie - 0.62, -1.24];
  const tipP: Vec3 = [swing * 1.0, yTie - 1.24, -1.18];
  const depth = depthOf(v, tieP);
  return {
    tie: projectOnHead(v, tieP),
    mid: projectOnHead(v, midP),
    tip: projectOnHead(v, tipP),
    depth,
    front: depth >= 0,
  };
};

const CURL_SITES: readonly { pos: Vec3; side: boolean }[] = [
  { pos: [-0.94, 0.14, 0.1], side: true },
  { pos: [-0.88, -0.14, -0.22], side: true },
  { pos: [0.94, 0.14, 0.1], side: true },
  { pos: [0.88, -0.14, -0.22], side: true },
  { pos: [-0.74, 0.58, 0.34], side: false },
  { pos: [-0.36, 0.84, 0.44], side: false },
  { pos: [0, 0.92, 0.42], side: false },
  { pos: [0.36, 0.84, 0.44], side: false },
  { pos: [0.74, 0.58, 0.34], side: false },
  { pos: [-0.66, 0.62, -0.44], side: false },
  { pos: [0, 0.86, -0.52], side: false },
  { pos: [0.66, 0.62, -0.44], side: false },
  { pos: [-0.72, 0.08, -0.68], side: true },
  { pos: [0, 0.16, -0.98], side: true },
  { pos: [0.72, 0.08, -0.68], side: true },
  { pos: [-0.46, -0.32, -0.82], side: true },
  { pos: [0.46, -0.32, -0.82], side: true },
];

export const curlPoints = (v: HeadView, tucked: boolean) => {
  const list: { index: number; at: Point; depth: number; front: boolean }[] = [];
  for (let index = 0; index < CURL_SITES.length; index++) {
    const site = CURL_SITES[index];
    if (tucked && !site.side) continue;
    const depth = depthOf(v, site.pos);
    list.push({ index, at: projectOnHead(v, site.pos), depth, front: depth >= -0.05 });
  }
  list.sort((a, b) => a.depth - b.depth);
  return list;
};

const SPIKE_DIRS: readonly { dir: Vec3; reach: number }[] = [
  { dir: unit([0, 1, 0]), reach: 1.46 },
  { dir: unit([-0.62, 0.78, 0.12]), reach: 1.42 },
  { dir: unit([0.62, 0.78, 0.12]), reach: 1.42 },
  { dir: unit([0, 0.78, 0.62]), reach: 1.38 },
  { dir: unit([0, 0.72, -0.68]), reach: 1.42 },
  { dir: unit([-0.46, 0.78, 0.42]), reach: 1.38 },
  { dir: unit([0.46, 0.78, 0.42]), reach: 1.38 },
  { dir: unit([-0.55, 0.65, -0.52]), reach: 1.38 },
  { dir: unit([0.55, 0.65, -0.52]), reach: 1.38 },
];

export const spikePoints = (v: HeadView) =>
  SPIKE_DIRS.map((s, index) => {
    const base = projectOnHead(v, [s.dir[0] * 0.66, s.dir[1] * 0.66, s.dir[2] * 0.66]);
    const tip = projectOnHead(v, [s.dir[0] * s.reach, s.dir[1] * s.reach, s.dir[2] * s.reach]);
    const dx = tip.x - base.x;
    const dy = tip.y - base.y;
    return { index, base, tip, length: Math.hypot(dx, dy), angle: Math.atan2(dx, -dy), depth: depthOf(v, s.dir) };
  });

export const mohawkPoints = (v: HeadView) => {
  const list = Array.from({ length: 5 }, (_, index) => {
    const a = -1.0 + index * 0.48;
    const p: Vec3 = [0, Math.cos(a) * 1.12, Math.sin(a) * 1.12];
    const depth = depthOf(v, p);
    return { index, at: projectOnHead(v, p), depth, front: depth >= -0.15 };
  });
  list.sort((a, b) => a.depth - b.depth);
  return list;
};

const BRAID_NODES: readonly { pos: Vec3; tie: boolean; scale: number }[] = [
  { pos: [0.82, -0.54, 0.16], tie: false, scale: 0.105 },
  { pos: [0.82, -0.86, 0.24], tie: false, scale: 0.093 },
  { pos: [0.82, -1.18, 0.28], tie: false, scale: 0.081 },
  { pos: [0.82, -1.42, 0.28], tie: true, scale: 0.05 },
];

export const braidPoints = (v: HeadView) => {
  const anchorDepth = depthOf(v, BRAID_NODES[1].pos);
  return {
    front: anchorDepth >= -0.15,
    depth: anchorDepth,
    nodes: BRAID_NODES.map((n, index) => ({ index, at: projectOnHead(v, n.pos), tie: n.tie, scale: n.scale })),
  };
};

export const wavyHemPoints = (v: HeadView, capped: boolean) => {
  const y = capped ? -0.66 : -0.74;
  const radius = 0.92;
  const list = Array.from({ length: 5 }, (_, index) => {
    const a = Math.PI + ((index - 2) / 2) * 1.15;
    const p: Vec3 = [Math.sin(a) * radius, y, Math.cos(a) * radius];
    const depth = depthOf(v, p);
    return { index, at: projectOnHead(v, p), depth, front: depth >= 0.15 && v.facing < -0.25 };
  });
  list.sort((a, b) => a.depth - b.depth);
  return list;
};

export const backDrapeCover = (facing: number) => Math.min(1, Math.max(0, (-facing - 0.1) / 0.55));

export const sideSweptPose = (v: HeadView) => {
  const p: Vec3 = [0.24, 0.52, 0.82];
  const depth = depthOf(v, p);
  return {
    at: projectOnHead(v, p),
    depth,
    visible: depth > -0.1,
    scaleX: 0.35 + 0.65 * Math.max(0, depth),
    tilt: 0.35 * v.facing + 0.18 * v.side,
  };
};

export const curtainsPose = (v: HeadView) => {
  const partingP: Vec3 = [0, 0.32, 0.95];
  const partingDepth = depthOf(v, partingP);
  const locks = ([-1, 1] as const).map((side) => {
    const p: Vec3 = [side * 0.62, 0.32, 0.72];
    const depth = depthOf(v, p);
    return {
      side,
      at: projectOnHead(v, p),
      depth,
      visible: depth > 0.02,
      scaleX: 0.35 + 0.65 * Math.max(0, depth),
    };
  });
  return {
    locks,
    parting: {
      at: projectOnHead(v, partingP),
      visible: partingDepth > 0.2,
      scaleX: Math.max(0, (partingDepth - 0.18) / 0.8),
    },
  };
};

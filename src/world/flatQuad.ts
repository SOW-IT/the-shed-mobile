import { QUAD_SIZE } from "./camera";

type Pt = { x: number; y: number };

export type FlatTransform = [
  { translateX: number },
  { translateY: number },
  { rotate: string },
  { skewX: string },
  { scaleX: number },
  { scaleY: number },
];

type FlatPiece =
  | { kind: "rect"; key: string; transform: FlatTransform }
  | { kind: "band"; key: string; transform: FlatTransform }
  | { kind: "triangle"; key: string; transform: FlatTransform }
  | { kind: "dot"; key: string; x: number; y: number; r: number };

const PARALLEL_SLACK = 0.5;
const SEAM = 0.5;
const ROUND_FROM = 1;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const times = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const length = (a: Pt) => Math.hypot(a.x, a.y);

export const flatWarp = (origin: Pt, across: Pt, down: Pt): FlatTransform | null => {
  const k = 1 / QUAD_SIZE;
  const a = across.x * k;
  const b = across.y * k;
  const c = down.x * k;
  const d = down.y * k;
  const sx = Math.hypot(a, b);
  if (sx < 1e-6) return null;
  const sy = (a * d - b * c) / sx;
  if (Math.abs(sy) < 1e-6) return null;
  const shear = ((a / sx) * c + (b / sx) * d) / sy;
  const half = QUAD_SIZE / 2;
  return [
    { translateX: origin.x + (across.x + down.x) / 2 - half },
    { translateY: origin.y + (across.y + down.y) / 2 - half },
    { rotate: `${Math.atan2(b, a)}rad` },
    { skewX: `${Math.atan(shear)}rad` },
    { scaleX: sx },
    { scaleY: sy },
  ];
};

export const isParallelogram = (q: readonly Pt[]) =>
  Math.hypot(q[0].x - q[1].x + q[2].x - q[3].x, q[0].y - q[1].y + q[2].y - q[3].y) < PARALLEL_SLACK;

export const parallelogramWarp = (q: readonly Pt[]) => flatWarp(q[0], sub(q[1], q[0]), sub(q[3], q[0]));

const grown = (p: Pt, centre: Pt) => {
  const out = sub(p, centre);
  const reach = length(out);
  return reach < 1e-6 ? p : add(p, times(out, SEAM / reach));
};

const triangle = (key: string, p0: Pt, p1: Pt, p2: Pt): FlatPiece | null => {
  const centre = times(add(add(p0, p1), p2), 1 / 3);
  const [a, b, c] = [grown(p0, centre), grown(p1, centre), grown(p2, centre)];
  const transform = flatWarp(add(sub(a, b), c), sub(b, a), sub(b, c));
  return transform && { kind: "triangle", key, transform };
};

const triangles = (q: readonly Pt[]) => [triangle("t0", q[0], q[1], q[2]), triangle("t1", q[0], q[2], q[3])];

const signedArea = (q: readonly Pt[]) => q.reduce((sum, p, i) => sum + cross(p, q[(i + 1) % q.length]), 0) / 2;

const meet = (p: Pt, e: Pt, r: Pt, f: Pt): Pt | null => {
  const den = cross(e, f);
  if (Math.abs(den) < 1e-9) return null;
  return add(p, times(e, cross(sub(r, p), f) / den));
};

export const cornerRadius = (q: readonly Pt[], radius: number) => {
  const across = (length(sub(q[1], q[0])) + length(sub(q[2], q[3]))) / 2;
  const down = (length(sub(q[3], q[0])) + length(sub(q[2], q[1]))) / 2;
  return (Math.min(radius, QUAD_SIZE / 2) / QUAD_SIZE) * Math.min(across, down);
};

const rounded = (q: readonly Pt[], r: number): (FlatPiece | null)[] | null => {
  const area = signedArea(q);
  if (Math.abs(area) < 1e-6) return null;
  const side = Math.sign(area);
  const edges = q.map((p, i) => sub(q[(i + 1) % 4], p));
  const inward = edges.map((e) => times({ x: -e.y, y: e.x }, side / Math.max(1e-9, length(e))));
  const inner: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const before = (i + 3) % 4;
    const corner = meet(add(q[before], times(inward[before], r)), edges[before], add(q[i], times(inward[i], r)), edges[i]);
    if (!corner) return null;
    inner.push(corner);
  }
  if (Math.sign(signedArea(inner)) !== side) return null;
  for (let i = 0; i < 4; i++) {
    const e = sub(inner[(i + 1) % 4], inner[i]);
    if (e.x * edges[i].x + e.y * edges[i].y <= 0) return null;
  }
  const bands = inner.map((p, i): FlatPiece | null => {
    const transform = flatWarp(add(p, times(inward[i], SEAM)), sub(inner[(i + 1) % 4], p), times(inward[i], -(r + SEAM)));
    return transform && { kind: "band", key: `b${i}`, transform };
  });
  const dots = inner.map((p, i): FlatPiece => ({ kind: "dot", key: `d${i}`, x: p.x, y: p.y, r }));
  return [...triangles(inner), ...bands, ...dots];
};

export const flatPieces = (q: readonly Pt[], radius = 0): FlatPiece[] => {
  if (isParallelogram(q)) {
    const transform = parallelogramWarp(q);
    return transform ? [{ kind: "rect", key: "r", transform }] : [];
  }
  const r = radius > 0 ? cornerRadius(q, radius) : 0;
  const pieces = (r >= ROUND_FROM ? rounded(q, r) : null) ?? triangles(q);
  return pieces.filter((piece): piece is FlatPiece => piece !== null);
};

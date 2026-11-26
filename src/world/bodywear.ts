import type { Point } from "./headwear";

export type BodyView = {
  footX: number;
  footY: number;
  s: number;
  up: number;
  bob: number;
  dx: number;
  width: number;
  height: number;
  facing: number;
  side: number;
};

export const bodyHalfWidth = (y: number) => 0.21 + (0.12 * (0.7 - y)) / 0.54;

const bodyAt = (v: BodyView, x: number, y: number): Point => ({
  x: v.footX + (x * v.width + v.dx * Math.min(1, y)) * v.s,
  y: v.footY - (y * v.height + v.bob) * v.up,
});

export const bodySurface = (v: BodyView, theta: number, y: number, radiusScale = 1) => {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const camX = sinT * v.facing + cosT * v.side;
  const camZ = -sinT * v.side + cosT * v.facing;
  const x = camX * bodyHalfWidth(y) * radiusScale;
  return { at: bodyAt(v, x, y), x, depth: camZ, front: camZ >= 0 };
};

const wrapAngle = (a: number) => {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
};

const clipArc = (thetaL: number, thetaR: number, heading: number, limb: number): [number, number] | null => {
  const mid = wrapAngle((thetaL + thetaR) / 2 + heading);
  const half = (thetaR - thetaL) / 2;
  const a0 = Math.max(-limb, mid - half);
  const a1 = Math.min(limb, mid + half);
  return a1 - a0 >= 0.06 ? [a0, a1] : null;
};

export const surfaceStrip = (
  v: BodyView,
  top: number,
  bottom: number,
  topSpan: readonly [number, number],
  botSpan: readonly [number, number],
  grow = 0,
  margin = 0.95
): Point[] | null => {
  const heading = Math.atan2(v.side, v.facing);
  const limb = Math.asin(margin);
  const topArc = clipArc(topSpan[0], topSpan[1], heading, limb);
  const botArc = clipArc(botSpan[0], botSpan[1], heading, limb);
  if (!topArc || !botArc) return null;
  const rTop = bodyHalfWidth(top);
  const rBot = bodyHalfWidth(bottom);
  const tl = bodyAt(v, Math.sin(topArc[0]) * rTop, top);
  const tr = bodyAt(v, Math.sin(topArc[1]) * rTop, top);
  const br = bodyAt(v, Math.sin(botArc[1]) * rBot, bottom);
  const bl = bodyAt(v, Math.sin(botArc[0]) * rBot, bottom);
  return [
    { x: tl.x - grow, y: tl.y - grow },
    { x: tr.x + grow, y: tr.y - grow },
    { x: br.x + grow, y: br.y + grow },
    { x: bl.x - grow, y: bl.y + grow },
  ];
};

export const surfaceSegment = (
  v: BodyView,
  fromTheta: number,
  fromY: number,
  toTheta: number,
  toY: number,
  minDepth = -0.05,
  radiusScale = 0.94
): { a: Point; b: Point; depth: number } | null => {
  const p0 = bodySurface(v, fromTheta, fromY, radiusScale);
  const p1 = bodySurface(v, toTheta, toY, radiusScale);
  if (p0.depth < minDepth && p1.depth < minDepth) return null;
  if (p0.depth >= minDepth && p1.depth >= minDepth) return { a: p0.at, b: p1.at, depth: (p0.depth + p1.depth) / 2 };
  const heading = Math.atan2(v.side, v.facing);
  const alpha = Math.acos(Math.max(-1, Math.min(1, minDepth)));
  const span = toTheta - fromTheta;
  const mid = (fromTheta + toTheta) / 2;
  let t = (minDepth - p0.depth) / (p1.depth - p0.depth);
  let bestDist = Infinity;
  for (const base of [alpha - heading, -alpha - heading]) {
    const k = Math.round((mid - base) / (Math.PI * 2));
    const candT = (base + k * Math.PI * 2 - fromTheta) / span;
    const dist = candT < 0 ? -candT : candT > 1 ? candT - 1 : 0;
    if (dist < bestDist) {
      bestDist = dist;
      t = Math.max(0, Math.min(1, candT));
    }
  }
  const midTheta = fromTheta + span * t;
  const midY = fromY + (toY - fromY) * t;
  const edge = bodySurface(v, midTheta, midY, radiusScale);
  if (p0.depth >= minDepth) return { a: p0.at, b: edge.at, depth: (p0.depth + edge.depth) / 2 };
  return { a: edge.at, b: p1.at, depth: (edge.depth + p1.depth) / 2 };
};

type TorsoDot = { theta: number; y: number; rad: number };

export const surfaceDots = (v: BodyView, dots: readonly TorsoDot[], hem: number, minDepth = 0.16) => {
  const out: { index: number; at: Point; rx: number; ry: number; depth: number }[] = [];
  for (let index = 0; index < dots.length; index++) {
    const d = dots[index];
    if (d.y <= hem + 0.03) continue;
    const p = bodySurface(v, d.theta, d.y, 0.92);
    if (p.depth < minDepth) continue;
    out.push({
      index,
      at: p.at,
      rx: d.rad * v.s * (0.35 + 0.65 * p.depth),
      ry: d.rad * v.s,
      depth: p.depth,
    });
  }
  return out;
};

export const POLKA_DOTS: readonly TorsoDot[] = [
  { theta: -0.58, y: 0.6, rad: 0.035 },
  { theta: 0.38, y: 0.62, rad: 0.035 },
  { theta: 1.48, y: 0.59, rad: 0.035 },
  { theta: 2.52, y: 0.61, rad: 0.035 },
  { theta: -2.6, y: 0.58, rad: 0.035 },
  { theta: -1.62, y: 0.61, rad: 0.035 },
  { theta: -0.08, y: 0.5, rad: 0.035 },
  { theta: 0.72, y: 0.44, rad: 0.035 },
  { theta: -0.78, y: 0.4, rad: 0.035 },
  { theta: 1.95, y: 0.46, rad: 0.035 },
  { theta: -2.02, y: 0.45, rad: 0.035 },
  { theta: Math.PI, y: 0.42, rad: 0.035 },
  { theta: 0.18, y: 0.33, rad: 0.035 },
  { theta: -0.36, y: 0.25, rad: 0.035 },
  { theta: 0.74, y: 0.22, rad: 0.035 },
  { theta: 1.65, y: 0.28, rad: 0.035 },
  { theta: 2.68, y: 0.26, rad: 0.035 },
  { theta: -1.55, y: 0.29, rad: 0.035 },
  { theta: -2.55, y: 0.24, rad: 0.035 },
];

export const TIE_DYE_BLOBS: readonly TorsoDot[] = [
  { theta: -0.46, y: 0.6, rad: 0.075 },
  { theta: 0.48, y: 0.52, rad: 0.07 },
  { theta: -0.16, y: 0.42, rad: 0.06 },
  { theta: 0.56, y: 0.36, rad: 0.05 },
  { theta: -0.62, y: 0.33, rad: 0.055 },
  { theta: 1.62, y: 0.54, rad: 0.07 },
  { theta: -1.65, y: 0.46, rad: 0.065 },
  { theta: 2.55, y: 0.58, rad: 0.07 },
  { theta: -2.62, y: 0.5, rad: 0.068 },
  { theta: Math.PI, y: 0.38, rad: 0.06 },
  { theta: 2.2, y: 0.34, rad: 0.055 },
  { theta: -2.1, y: 0.32, rad: 0.055 },
];

export const TIE_DYE_LIGHTS: readonly TorsoDot[] = [
  { theta: 0.1, y: 0.56, rad: 0.04 },
  { theta: -0.54, y: 0.47, rad: 0.04 },
  { theta: 0.26, y: 0.3, rad: 0.04 },
  { theta: 1.9, y: 0.44, rad: 0.04 },
  { theta: -1.9, y: 0.56, rad: 0.04 },
  { theta: 2.95, y: 0.48, rad: 0.04 },
  { theta: -2.85, y: 0.32, rad: 0.04 },
];

/** The Hawaiian shirt's flowers, front and back. */
export const HIBISCUS: readonly TorsoDot[] = [
  { theta: -0.5, y: 0.58, rad: 0.06 },
  { theta: 0.55, y: 0.48, rad: 0.065 },
  { theta: -0.3, y: 0.32, rad: 0.06 },
  { theta: 0.62, y: 0.25, rad: 0.05 },
  { theta: 1.6, y: 0.56, rad: 0.06 },
  { theta: -1.6, y: 0.42, rad: 0.065 },
  { theta: 2.5, y: 0.36, rad: 0.06 },
  { theta: -2.5, y: 0.58, rad: 0.06 },
  { theta: Math.PI, y: 0.44, rad: 0.065 },
  { theta: 1.9, y: 0.26, rad: 0.05 },
  { theta: -2.1, y: 0.26, rad: 0.05 },
];

export const PLAID_ANGLES = [-2.5, -1.57, -0.64, 0.64, 1.57, 2.5] as const;

export const backpackPose = (v: BodyView) => {
  const backR = bodyHalfWidth(0.46);
  const packW = 0.48;
  const packD = 0.22;
  const centerBack = backR + packD / 2;
  const topY = bodyAt(v, 0, 0.68).y;
  const botY = bodyAt(v, 0, 0.24).y;
  const height = botY - topY;
  const cx = bodyAt(v, -v.side * centerBack, 0.46).x;
  const width = Math.hypot(packW * v.facing, packD * v.side) * v.width * v.s;
  const over = v.facing < 0;
  const pocketW = 0.34 * Math.abs(v.facing) * v.width * v.s;
  const pocketCx = bodyAt(v, -v.side * (backR + packD * 0.8), 0.4).x;
  return {
    left: cx - width / 2,
    top: topY,
    width,
    height,
    over,
    pocket: over && v.facing < -0.22 ? { left: pocketCx - pocketW / 2, top: topY + height * 0.48, width: pocketW, height: height * 0.36 } : null,
  };
};

export const scarfPose = (v: BodyView, chin: number, swing: number) => {
  const y = Math.min(0.56, chin + 0.01);
  const r = bodyHalfWidth(y) + 0.02;
  const top = bodySurface(v, 0.52, y - 0.02, 1.04);
  const end = bodyAt(v, top.x + 0.03 * v.facing + swing, y - 0.22);
  return {
    wrapLeft: bodyAt(v, -r, y),
    wrapRight: bodyAt(v, r, y),
    tailStart: top.at,
    tailEnd: end,
    tailInFront: top.depth >= 0,
    tailDepth: top.depth,
  };
};

export const bowTiePose = (v: BodyView, chin: number) => {
  const yMid = chin - 0.05;
  const knot = bodySurface(v, 0, yMid, 1.08);
  const visible = v.facing >= -0.15;
  const wings = ([-1, 1] as const)
    .map((side) => {
      const span: readonly [number, number] = side > 0 ? [0.05, 0.54] : [-0.54, -0.05];
      const inner = bodySurface(v, span[0], yMid, 1.05);
      const outer = bodySurface(v, span[1], yMid, 1.02);
      const depth = (inner.depth + outer.depth) / 2;
      return {
        side,
        span,
        depth,
        visible: visible && depth >= -0.15,
      };
    })
    .sort((a, b) => a.depth - b.depth);
  return {
    visible,
    knot: knot.at,
    knotDepth: knot.depth,
    yTop: chin - 0.005,
    yBot: chin - 0.095,
    wings,
  };
};

export const necklacePose = (v: BodyView, chin: number) => {
  const count = 20;
  const neckRadius = 0.165;
  const pearls: { index: number; at: Point; depth: number }[] = [];
  for (let index = 0; index < count; index++) {
    const theta = (index / count) * Math.PI * 2;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const front = Math.max(0, cosT);
    const back = Math.max(0, -cosT);
    const y = chin - 0.02 - 0.05 * front * front - 0.01 * back * back;
    const camX = sinT * v.facing + cosT * v.side;
    const camZ = -sinT * v.side + cosT * v.facing;
    if (camZ >= -0.05) {
      pearls.push({ index, at: bodyAt(v, camX * neckRadius, y), depth: camZ });
    }
  }
  pearls.sort((a, b) => a.depth - b.depth);
  const pendantDepth = v.facing;
  return {
    pearls,
    pendant: pendantDepth >= -0.05 ? bodyAt(v, v.side * (neckRadius + 0.01), chin - 0.11) : null,
    pendantDepth,
  };
};

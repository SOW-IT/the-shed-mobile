// The Garden's scenery as flat shapes on the screen: style C's courtyard,
// projected through the camera once per stage size. Each 3D part becomes a
// warped quad (box faces, ground tiles), an ellipse (balls, discs on the
// ground) or a line (ink edges, the arch). Toon shading is a three-step ramp
// per shape; ink outlines are drawn as lines.

import { OBSTACLES, PORTAL_RADIUS, PORTALS, type Place } from "../../shared/world";
import type { Camera, Vec3 } from "./camera";
import { garden, places, shade } from "./palette";

type Pt = { x: number; y: number };
export type Prim =
  | { kind: "quad"; key: string; pts: Pt[]; fill: string; radius?: number; border?: number; borderColour?: string }
  | {
      kind: "ellipse";
      key: string;
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      ink?: number;
      inkColour?: string;
      dashed?: boolean;
      /** Toon steps: a lighter ball offset toward the sun, inside the ink. */
      ramp?: boolean;
    }
  | { kind: "line"; key: string; a: Pt; b: Pt; width: number; colour: string };

/** A group of shapes drawn together, sorted against people by depth. */
export type Prop = {
  id: string;
  depth: number;
  prims: Prim[];
  tap?: string;
  /** The screen box the prop's shapes cover, for taps on it. */
  box: { left: number; right: number; top: number; bottom: number };
};

export const boxOf = (prims: Prim[]) => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of prims) {
    if (p.kind === "quad") {
      for (const q of p.pts) {
        xs.push(q.x);
        ys.push(q.y);
      }
    } else if (p.kind === "line") {
      xs.push(p.a.x, p.b.x);
      ys.push(p.a.y, p.b.y);
    } else {
      xs.push(p.cx - p.rx, p.cx + p.rx);
      ys.push(p.cy - p.ry, p.cy + p.ry);
    }
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};

const ITEM_TAP = "item:";

export const itemAt = (props: readonly Prop[], x: number, y: number): string | null => {
  const hit = props
    .filter((prop) => prop.tap?.startsWith(ITEM_TAP) && x >= prop.box.left && x <= prop.box.right && y >= prop.box.top && y <= prop.box.bottom)
    .sort((a, b) => a.depth - b.depth)[0];
  return hit?.tap ? hit.tap.slice(ITEM_TAP.length) : null;
};

export interface Scene {
  sky: string;
  ground: Prim[];
  backdrop: Prim[];
  props: Prop[];
}

const INK_WORLD = 0.035;

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export class Builder {
  prims: Prim[] = [];
  private n = 0;
  constructor(
    private cam: Camera,
    private prefix: string
  ) {}

  private key() {
    return `${this.prefix}-${this.n++}`;
  }

  ink(at: Vec3) {
    return Math.max(1, INK_WORLD * this.cam.project(at).scale);
  }

  /** A shape lying flat on the ground (y), from a list of world corners. */
  groundQuad(corners: [number, number][], fill: string, y = 0) {
    const pts = corners.map(([x, z]) => this.cam.project([x, y, z]));
    this.prims.push({ kind: "quad", key: this.key(), pts, fill });
  }

  /** A disc on the ground, as the ellipse around its projected rim. */
  groundDisc(x: number, z: number, rx: number, rz: number, fill: string, opts: { ink?: boolean; y?: number; dashed?: boolean } = {}) {
    const y = opts.y ?? 0;
    const l = this.cam.project([x - rx, y, z]);
    const r = this.cam.project([x + rx, y, z]);
    const f = this.cam.project([x, y, z + rz]);
    const b = this.cam.project([x, y, z - rz]);
    this.prims.push({
      kind: "ellipse",
      key: this.key(),
      cx: (l.x + r.x) / 2,
      cy: (f.y + b.y) / 2,
      rx: Math.abs(r.x - l.x) / 2,
      ry: Math.abs(f.y - b.y) / 2,
      fill,
      ink: opts.ink ? this.ink([x, y, z]) : undefined,
      inkColour: garden.ink,
      dashed: opts.dashed,
    });
  }

  /** A ball, drawn as a circle with a lighter ball toward the sun. */
  ball(at: Vec3, r: number, fill: string, opts: { ink?: number; squashY?: number } = {}) {
    const p = this.cam.project(at);
    this.prims.push({
      kind: "ellipse",
      key: this.key(),
      cx: p.x,
      cy: p.y,
      rx: r * p.scale,
      ry: r * p.scale * (opts.squashY ?? 1),
      fill,
      ink: Math.max(1, (opts.ink ?? INK_WORLD) * p.scale),
      inkColour: garden.ink,
      ramp: true,
    });
  }

  face(corners: Vec3[], fill: string) {
    this.prims.push({ kind: "quad", key: this.key(), pts: corners.map((corner) => this.cam.project(corner)), fill });
  }

  line(a: Vec3, b: Vec3, width: number, colour: string) {
    this.prims.push({ kind: "line", key: this.key(), a: this.cam.project(a), b: this.cam.project(b), width, colour });
  }

  /**
   * A box: each face turned toward the camera, lit by the sun at the front
   * right, with ink round every face.
   */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, fill: string, ink = INK_WORLD) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const faces: { n: Vec3; c: Vec3; pts: Vec3[]; tone: number }[] = [
      { n: [0, 1, 0], c: [cx, y1, cz], pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], tone: 0.18 },
      { n: [0, 0, 1], c: [cx, cy, z1], pts: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], tone: 0 },
      { n: [0, 0, -1], c: [cx, cy, z0], pts: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], tone: -0.22 },
      { n: [1, 0, 0], c: [x1, cy, cz], pts: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], tone: -0.05 },
      { n: [-1, 0, 0], c: [x0, cy, cz], pts: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], tone: -0.16 },
    ];
    const eye = this.cam.eye;
    for (const face of faces) {
      const toEye = [eye[0] - face.c[0], eye[1] - face.c[1], eye[2] - face.c[2]];
      if (face.n[0] * toEye[0] + face.n[1] * toEye[1] + face.n[2] * toEye[2] <= 0) continue;
      const pts = face.pts.map((p) => this.cam.project(p));
      this.prims.push({ kind: "quad", key: this.key(), pts, fill: shade(fill, face.tone) });
      const width = this.ink(face.c) * (ink / INK_WORLD);
      for (let i = 0; i < 4; i++) {
        this.prims.push({ kind: "line", key: this.key(), a: pts[i], b: pts[(i + 1) % 4], width, colour: garden.ink });
      }
    }
  }

  /** An upright cylinder (or cone, with a different top radius). */
  cylinder(x: number, z: number, y0: number, y1: number, rBottom: number, rTop: number, fill: string, opts: { ink?: boolean } = {}) {
    const b = this.cam.project([x, y0, z]);
    const t = this.cam.project([x, y1, z]);
    const pts = [
      { x: t.x - rTop * t.scale, y: t.y },
      { x: t.x + rTop * t.scale, y: t.y },
      { x: b.x + rBottom * b.scale, y: b.y },
      { x: b.x - rBottom * b.scale, y: b.y },
    ];
    const ink = opts.ink === false ? 0 : this.ink([x, y0, z]);
    const tilt = Math.sin(Math.atan2(this.cam.eye[1] - y1, Math.hypot(this.cam.eye[0] - x, this.cam.eye[2] - z)));
    // The bottom rim first, so the body covers its back half.
    this.prims.push({ kind: "ellipse", key: this.key(), cx: b.x, cy: b.y, rx: rBottom * b.scale, ry: rBottom * b.scale * tilt, fill: shade(fill, -0.08), ink: ink || undefined, inkColour: garden.ink });
    this.prims.push({ kind: "quad", key: this.key(), pts, fill: shade(fill, -0.08) });
    // The lit half of the body, toward the sun.
    this.prims.push({
      kind: "quad",
      key: this.key(),
      pts: [{ x: t.x - rTop * t.scale * 0.2, y: t.y }, pts[1], pts[2], { x: b.x - rBottom * b.scale * 0.2, y: b.y }],
      fill,
    });
    if (ink) {
      this.prims.push({ kind: "line", key: this.key(), a: pts[0], b: pts[3], width: ink, colour: garden.ink });
      this.prims.push({ kind: "line", key: this.key(), a: pts[1], b: pts[2], width: ink, colour: garden.ink });
    }
    this.prims.push({ kind: "ellipse", key: this.key(), cx: t.x, cy: t.y, rx: rTop * t.scale, ry: rTop * t.scale * tilt, fill: shade(fill, 0.15), ink: ink || undefined, inkColour: garden.ink });
  }

  take(): Prim[] {
    const out = this.prims;
    this.prims = [];
    return out;
  }
}

export const depthOf = (cam: Camera, x: number, z: number) => cam.project([x, 0, z]).depth;

export const drawPads = (g: Builder, place: Place) => {
  for (const pad of PORTALS[place]) {
    g.groundDisc(pad.x, pad.z, PORTAL_RADIUS + 0.07, PORTAL_RADIUS + 0.07, places.padRim, { y: 0.012 });
    g.groundDisc(pad.x, pad.z, PORTAL_RADIUS, PORTAL_RADIUS, places.padFill, { y: 0.014 });
    g.groundDisc(pad.x, pad.z, PORTAL_RADIUS * 0.62, PORTAL_RADIUS * 0.62, "transparent", { y: 0.016, ink: true, dashed: true });
  }
};

/** Style C's courtyard, laid out as in the mockup, for this camera. */
export const buildGarden = (cam: Camera): Scene => {
  const r = rng(21);
  const g = new Builder(cam, "g");

  // The lawn, its stripes, the paved circle and the stepping-stone paths.
  g.groundDisc(0, -2, 34, 34, garden.lawn);
  for (let z = -16; z <= 10; z += 2) {
    g.groundQuad([[-9, z - 0.5], [9, z - 0.5], [9, z + 0.5], [-9, z + 0.5]], garden.stripe);
  }
  // Soft shadows the hedges and trees throw back and to the left.
  const hedgeShadow = (x: number, z: number, w: number, d: number) =>
    g.groundQuad([[x - w / 2 - 0.5, z - d / 2 - 0.5], [x + w / 2 - 0.2, z - d / 2 - 0.5], [x + w / 2 - 0.2, z + d / 2 - 0.1], [x - w / 2 - 0.5, z + d / 2 - 0.1]], garden.shadow);
  hedgeShadow(-4.6, -6, 1.1, 8);
  hedgeShadow(4.6, -6, 1.1, 8);
  g.groundDisc(0, -2.4, 2.72, 2.72, garden.ink);
  g.groundDisc(0, -2.4, 2.6, 2.6, garden.pave);
  for (let z = 1; z <= 9.5; z += 1.15) g.groundDisc(-0.2 + Math.sin(z) * 0.4, z, 0.42, 0.36, garden.stone);
  for (let z = -5.8; z >= -11; z -= 1.15) g.groundDisc(Math.sin(z) * 0.3, z, 0.42, 0.36, garden.stone);
  // The pond with lily pads, front left.
  g.groundDisc(-2.9, 2.2, 2.16, 1.66, garden.pondRim);
  g.groundDisc(-2.9, 2.2, 1.95, 1.5, garden.pond);
  for (const [x, z] of [[-3.4, 1.8], [-2.3, 2.7], [-3.1, 2.9]]) g.groundDisc(x, z, 0.26, 0.24, garden.pad);
  // The picnic blanket, front right.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = 2.0 + i * 0.5;
      const z = 1.8 + j * 0.5;
      g.groundQuad([[x, z], [x + 0.5, z], [x + 0.5, z + 0.5], [x, z + 0.5]], (i + j) % 2 ? garden.blanketA : garden.blanketB, 0.01);
    }
  }
  for (const [x, z, s] of TREES) g.groundDisc(x - 0.9 * s, z - 0.6 * s, 1.3 * s, 1.0 * s, garden.shadow);
  drawPads(g, "garden");
  const ground = g.take();

  // Behind everyone: the trees, then the hedges and the arch.
  const b = new Builder(cam, "b");
  const trees = [...TREES].sort((p, q) => depthOf(cam, p[0], p[1]) - depthOf(cam, q[0], q[1])).reverse();
  for (const [x, z, s] of trees) {
    b.cylinder(x, z, 0, 1.6 * s, 0.22 * s, 0.16 * s, garden.trunk);
    b.ball([x, 2.2 * s, z], 1.15 * s, garden.canopy, { ink: 0.06 });
    b.ball([x + 0.6 * s, 2.9 * s, z + 0.2], 0.75 * s, garden.canopyLight, { ink: 0.05 });
  }
  const hedges: [number, number, number, number, number][] = [
    [-3.2, -12, 3.6, 1.1, 1.1],
    [3.2, -12, 3.6, 1.1, 1.1],
    [-4.6, -6, 1.1, 8, 1.1],
    [4.6, -6, 1.1, 8, 1.1],
    [-5.4, 4.5, 1.1, 5, 0.9],
    [5.4, 4.5, 1.1, 5, 0.9],
  ];
  const backParts: { depth: number; draw: () => void }[] = hedges.map(([x, z, w, d, h]) => ({
    depth: depthOf(cam, x, z + d / 2),
    draw: () => b.box(x, h / 2, z, w, h, d, garden.hedge, 0.05),
  }));
  backParts.push({
    depth: depthOf(cam, 0, -11.9),
    draw: () => {
      for (const x of [-1.2, 1.2]) b.box(x, 1.4, -12, 0.22, 2.8, 0.22, garden.wood);
      // The arch: a half ring of short strokes, ink under wood.
      const seg = 14;
      const arc = (i: number): Vec3 => {
        const a = (i / seg) * Math.PI;
        return [Math.cos(a) * 1.2, 2.8 + Math.sin(a) * 1.2, -12];
      };
      const thick = cam.project([0, 2.8, -12]).scale * 0.24;
      for (let i = 0; i < seg; i++) b.line(arc(i), arc(i + 1), thick + 4, garden.ink);
      for (let i = 0; i < seg; i++) b.line(arc(i), arc(i + 1), thick, garden.wood);
      for (let i = 0; i < 18; i++) {
        const a = r() * Math.PI;
        b.ball([Math.cos(a) * 1.25, 2.8 + Math.sin(a) * 1.25, -11.85], 0.13, garden.blooms[i % 4], { ink: 0.025 });
      }
    },
  });
  backParts.sort((p, q) => q.depth - p.depth).forEach((part) => part.draw());
  const backdrop = b.take();

  // In the courtyard, sorted against people: flower beds, the birdbath, the
  // sign, the basket and the arcade cabinet.
  const props: Prop[] = [];
  const prop = (id: string, x: number, z: number, draw: (p: Builder) => void, tap?: string) => {
    const p = new Builder(cam, id);
    draw(p);
    const prims = p.take();
    props.push({ id, depth: depthOf(cam, x, z), prims, tap, box: boxOf(prims) });
  };
  const bed = (id: string, cx: number, cz: number, n: number, spread: number) =>
    prop(id, cx, cz, (p) => {
      p.ball([cx, 0.1, cz], 0.5, garden.leaves, { squashY: 0.55 });
      const flowers = Array.from({ length: n }, (_, i) => ({
        i,
        x: cx + (r() - 0.5) * spread,
        z: cz + (r() - 0.5) * spread * 0.6,
        s: 0.14 + r() * 0.05,
      })).sort((f, h) => f.z - h.z);
      for (const f of flowers) p.ball([f.x, 0.2, f.z], f.s, garden.blooms[f.i % 4], { ink: 0.025 });
    });
  bed("bed-a", -3.6, -2.2, 14, 1.6);
  bed("bed-b", 3.6, -3.4, 12, 1.4);
  bed("bed-c", -3.4, -9.4, 10, 1.3);
  bed("bed-d", 3.3, -9.6, 10, 1.3);
  bed("bed-e", -4.0, 6.6, 9, 1.2);
  bed("bed-f", 3.9, 6.2, 8, 1.1);
  prop("birdbath", 0, -2.4, (p) => {
    p.groundDisc(-0.35, -2.75, 0.75, 0.6, garden.shadow);
    p.cylinder(0, -2.4, 0, 0.8, 0.26, 0.16, garden.bathStone);
    p.cylinder(0, -2.4, 0.8, 1.0, 0.36, 0.62, garden.bathTop);
    p.groundDisc(0, -2.4, 0.5, 0.5, garden.water, { y: 1.01 });
  });
  const noticeboard = OBSTACLES.find((o) => o.id === "noticeboard")!;
  prop(
    "noticeboard",
    noticeboard.x,
    noticeboard.z,
    (p) => {
      const { x, z } = noticeboard;
      p.groundDisc(x - 0.25, z - 0.2, 0.75, 0.45, garden.shadow);
      p.box(x - 0.46, 0.55, z, 0.11, 1.1, 0.11, garden.trunk);
      p.box(x + 0.46, 0.55, z, 0.11, 1.1, 0.11, garden.trunk);
      p.box(x, 1.28, z, 1.24, 1.06, 0.14, garden.wood);
      const frontZ = z + 0.075;
      p.face(
        [
          [x - 0.52, 1.72, frontZ],
          [x + 0.52, 1.72, frontZ],
          [x + 0.52, 0.84, frontZ],
          [x - 0.52, 0.84, frontZ],
        ],
        garden.noticePaper
      );
      p.face(
        [
          [x - 0.52, 1.72, frontZ + 0.005],
          [x + 0.52, 1.72, frontZ + 0.005],
          [x + 0.52, 1.48, frontZ + 0.005],
          [x - 0.52, 1.48, frontZ + 0.005],
        ],
        garden.noticeHeader
      );
      p.box(x - 0.28, 1.76, z + 0.02, 0.09, 0.16, 0.09, garden.ink);
      p.box(x + 0.28, 1.76, z + 0.02, 0.09, 0.16, 0.09, garden.ink);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const cx = x - 0.36 + col * 0.24;
          const cy = 1.36 - row * 0.19;
          const fill = row === 1 && col === 2 ? garden.noticeHeader : garden.noticeGrid;
          p.face(
            [
              [cx - 0.08, cy + 0.06, frontZ + 0.008],
              [cx + 0.08, cy + 0.06, frontZ + 0.008],
              [cx + 0.08, cy - 0.06, frontZ + 0.008],
              [cx - 0.08, cy - 0.06, frontZ + 0.008],
            ],
            fill
          );
        }
      }
    },
    "noticeboard"
  );
  prop("basket", 3.7, 2.1, (p) => p.cylinder(3.7, 2.1, 0, 0.32, 0.24, 0.3, garden.basket));
  const arcade = OBSTACLES.find((o) => o.id === "arcade")!;
  prop(
    "arcade",
    arcade.x,
    arcade.z,
    (p) => {
      const { x, z } = arcade;
      p.groundDisc(x - 0.3, z - 0.3, 0.7, 0.5, garden.shadow);
      p.box(x, 0.55, z, 0.8, 1.1, 0.6, garden.arcade);
      p.box(x, 1.25, z - 0.05, 0.8, 0.3, 0.5, garden.arcadeTrim);
      // The screen, a lit panel on the front.
      const sp = [
        [x - 0.28, 1.02, z + 0.305],
        [x + 0.28, 1.02, z + 0.305],
        [x + 0.28, 0.66, z + 0.305],
        [x - 0.28, 0.66, z + 0.305],
      ].map(([px, py, pz]) => cam.project([px, py, pz]));
      p.prims.push({ kind: "quad", key: `${p.prims.length}-screen`, pts: sp, fill: garden.arcadeScreen });
      p.ball([x - 0.15, 0.5, z + 0.32], 0.06, garden.arcadeTrim, { ink: 0.02 });
      p.ball([x + 0.12, 0.5, z + 0.32], 0.06, garden.markerMiddle, { ink: 0.02 });
    },
    "arcade"
  );
  return { sky: garden.sky, ground, backdrop, props };
};

/** Round trees behind the hedges: x, z, size. */
const TREES: [number, number, number][] = [
  [-4.2, -14, 1.5],
  [4.6, -14.5, 1.6],
  [-7, -9, 1.3],
  [7.2, -8.6, 1.4],
  [-1.4, -16, 1.3],
  [7, -2, 1.2],
  [-7.2, -1, 1.2],
];

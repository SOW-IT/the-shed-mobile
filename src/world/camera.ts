// The Garden's camera: a fixed perspective view of the courtyard, the same on
// every device, so a spot on the screen and a spot in the garden map to each
// other with plain arithmetic. The renderer, the name tags and taps all use it.

export type Vec3 = readonly [number, number, number];
export type ScreenPoint = { x: number; y: number; depth: number; scale: number };

const FOV_DEG = 34;
/** Where the camera sits relative to what it looks at (style C's framing). */
const OFFSET: Vec3 = [0, 17.5, 25];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface Camera {
  width: number;
  height: number;
  eye: Vec3;
  project: (p: Vec3) => ScreenPoint;
  /** The spot on the ground under a screen point, or null above the horizon. */
  ground: (sx: number, sy: number) => { x: number; z: number } | null;
}

/**
 * A camera framing the courtyard for a stage of this size. Taller stages
 * look further back so the whole walkable area stays in view.
 */
export const makeCamera = (width: number, height: number, focus: { x: number; z: number }): Camera => {
  const target: Vec3 = [focus.x, 0.3, focus.z];
  const eye: Vec3 = [focus.x + OFFSET[0], OFFSET[1], focus.z + OFFSET[2]];
  const back = norm(sub(eye, target));
  const right = norm(cross([0, 1, 0], back));
  const up = cross(back, right);
  const focal = height / 2 / Math.tan((FOV_DEG * Math.PI) / 360);
  const project = (p: Vec3): ScreenPoint => {
    const d = sub(p, eye);
    const depth = -dot(d, back);
    const scale = focal / depth;
    return { x: width / 2 + dot(d, right) * scale, y: height / 2 - dot(d, up) * scale, depth, scale };
  };
  const ground = (sx: number, sy: number) => {
    const cx = (sx - width / 2) / focal;
    const cy = -(sy - height / 2) / focal;
    const dir: Vec3 = [
      right[0] * cx + up[0] * cy - back[0],
      right[1] * cx + up[1] * cy - back[1],
      right[2] * cx + up[2] * cy - back[2],
    ];
    if (dir[1] >= -1e-6) return null;
    const t = -eye[1] / dir[1];
    return { x: eye[0] + dir[0] * t, z: eye[2] + dir[2] * t };
  };
  return { width, height, eye, project, ground };
};

/** The view size a quad is drawn at before it's warped into place. */
export const QUAD_SIZE = 100;

/**
 * A 4×4 matrix (CSS matrix3d order) that warps a QUAD_SIZE square, drawn at
 * the stage's top left, onto four screen points: top left, top right,
 * bottom right, bottom left. React Native applies a transform about the
 * view's centre, so the matrix undoes that first.
 */
export const quadMatrix = (q: readonly { x: number; y: number }[]): number[] => {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let a, b, d, e, g, h;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p1.x - p0.x; b = p3.x - p0.x; g = 0;
    d = p1.y - p0.y; e = p3.y - p0.y; h = 0;
  } else {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x;
    d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y;
  }
  const c = p0.x, f = p0.y;
  const k = 1 / QUAD_SIZE;
  const m = QUAD_SIZE / 2;
  // H maps (u, v) in pixels of the square: x = (a u/S + b v/S + c) / (g u/S + h v/S + 1).
  // Wanted: T(-m) · H · T(m) in row-vector order, i.e. H applied after moving
  // the centre back to the corner, then moved back for React Native's origin.
  const H = [
    a * k, d * k, 0, g * k,
    b * k, e * k, 0, h * k,
    0, 0, 1, 0,
    c, f, 0, 1,
  ];
  // Row vectors: p' = p · T(m) · H · T(-m), with T(m) moving (−S/2) back to 0.
  const pre = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, m, m, 0, 1];
  const post = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -m, -m, 0, 1];
  const out = mul(mul(pre, H), post);
  // A hair of z-perspective: it changes nothing (every point has z = 0), but
  // it makes iOS smooth the warped edges.
  out[11] = 1e-9;
  return out;
};

const mul = (A: number[], B: number[]): number[] => {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let i = 0; i < 4; i++) s += A[r * 4 + i] * B[i * 4 + c];
      out[r * 4 + c] = s;
    }
  }
  return out;
};


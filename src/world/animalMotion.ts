export const WANDER_LOOP_MS = 56_000;
const SEGMENTS = 8;
const EPOCH = Date.UTC(2026, 0, 1);

const unit = (seed: number, i: number) => {
  "worklet";
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

export const seedOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

type Spot = { u: number; v: number };
export type Zone = { u0: number; u1: number; v0: number; v1: number };

export const zoneOf = (slot: number, slots: number): Zone => {
  const cols = slots >= 4 ? 2 : Math.max(1, slots);
  const rows = Math.ceil(Math.max(1, slots) / cols);
  const col = slot % cols;
  const row = Math.floor(slot / cols) % rows;
  return { u0: col / cols, u1: (col + 1) / cols, v0: row / rows, v1: (row + 1) / rows };
};

const spotAt = (seed: number, i: number, zone: Zone): Spot => {
  "worklet";
  const k = ((i % SEGMENTS) + SEGMENTS) % SEGMENTS;
  return { u: zone.u0 + (zone.u1 - zone.u0) * (0.15 + 0.7 * unit(seed, k)), v: zone.v0 + (zone.v1 - zone.v0) * (0.2 + 0.7 * unit(seed + 101, k)) };
};

type Wander = { u: number; v: number; walking: boolean; left: boolean; idle: number };

export const PACE = { fed: 0.3, hungry: 0.6 } as const;

export const wanderAt = (seed: number, phase: number, pace: number | null, zone: Zone): Wander => {
  "worklet";
  if (pace === null) {
    const still = spotAt(seed, 0, zone);
    return { u: still.u, v: still.v, walking: false, left: unit(seed, 99) < 0.5, idle: 0 };
  }
  const t = (((phase % 1) + 1) % 1) * SEGMENTS;
  const seg = Math.floor(t);
  const k = t - seg;
  const from = spotAt(seed, seg, zone);
  const to = spotAt(seed, seg + 1, zone);
  const move = Math.min(1, k / pace);
  const eased = move * move * (3 - 2 * move);
  return {
    u: from.u + (to.u - from.u) * eased,
    v: from.v + (to.v - from.v) * eased,
    walking: move < 1,
    left: to.u < from.u,
    idle: move < 1 ? 0 : (k - pace) / (1 - pace),
  };
};

export const phaseAt = (ms: number) => (((ms - EPOCH) % WANDER_LOOP_MS) + WANDER_LOOP_MS) % WANDER_LOOP_MS / WANDER_LOOP_MS;

type Corner = { x: number; y: number; scale: number };
export type PenCorners = { backLeft: Corner; backRight: Corner; frontLeft: Corner; frontRight: Corner };

export const penPoint = (pen: PenCorners, u: number, v: number) => {
  "worklet";
  const back = { x: pen.backLeft.x + (pen.backRight.x - pen.backLeft.x) * u, y: pen.backLeft.y + (pen.backRight.y - pen.backLeft.y) * u, s: pen.backLeft.scale + (pen.backRight.scale - pen.backLeft.scale) * u };
  const front = { x: pen.frontLeft.x + (pen.frontRight.x - pen.frontLeft.x) * u, y: pen.frontLeft.y + (pen.frontRight.y - pen.frontLeft.y) * u, s: pen.frontLeft.scale + (pen.frontRight.scale - pen.frontLeft.scale) * u };
  return { x: back.x + (front.x - back.x) * v, y: back.y + (front.y - back.y) * v, scale: back.s + (front.s - back.s) * v };
};

export const peckAt = (phase: number, seed: number) => {
  "worklet";
  const k = ((phase * 37 + unit(seed, 7)) % 1 + 1) % 1;
  return k < 0.25 ? Math.sin((k / 0.25) * Math.PI) : 0;
};

export const swishAt = (phase: number, seed: number) => {
  "worklet";
  return Math.sin((phase * 19 + unit(seed, 3)) * Math.PI * 2);
};

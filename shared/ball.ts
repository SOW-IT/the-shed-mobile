import { halfWidthAt, inWater, PLACE_OBSTACLES, WALK_BOUNDS } from "./world";

export const BALL_PLACE = "beach";
export type Ball = { x: number; z: number; vx: number; vz: number; at: number };
export type RollingBall = { x: number; z: number; vx: number; vz: number; rolling: boolean; floating: boolean; travelled: number };

export const BALL_HOME = { x: 0.9, z: 1.0 } as const;
export const BALL_RADIUS = 0.32;
export const KICK_SPEED = 5.5;
export const KICK_GAP_MS = 400;
export const KICK_REACH = 2.5;
export const KICK_TOUCH = 0.6;
export const KICK_TAP_REACH = 1.8;

const STEP_S = 1 / 60;
const MAX_STEPS = 60 * 20;
const SAND_DRAG = 1.1;
const WATER_DRAG = 2.4;
const BOUNCE = 0.7;
const REST_SPEED = 0.05;

export const restingBall = (): Ball => ({ ...BALL_HOME, vx: 0, vz: 0, at: 0 });

const obstacles = PLACE_OBSTACLES[BALL_PLACE].map((o) => ({ x: o.x, z: o.z, rx: o.rx + BALL_RADIUS, rz: o.rz + BALL_RADIUS }));

const step = (b: { x: number; z: number; vx: number; vz: number }, dt: number) => {
  const slow = Math.exp(-(inWater(BALL_PLACE, b) ? WATER_DRAG : SAND_DRAG) * dt);
  let vx = b.vx * slow;
  let vz = b.vz * slow;
  let x = b.x + vx * dt;
  let z = b.z + vz * dt;
  if (z < WALK_BOUNDS.minZ || z > WALK_BOUNDS.maxZ) {
    const edge = z < WALK_BOUNDS.minZ ? WALK_BOUNDS.minZ : WALK_BOUNDS.maxZ;
    z = edge - (z - edge);
    vz = -vz * BOUNCE;
  }
  const half = halfWidthAt(z);
  if (Math.abs(x) > half) {
    const edge = Math.sign(x) * half;
    x = edge - (x - edge);
    vx = -vx * BOUNCE;
  }
  for (const o of obstacles) {
    const ux = (x - o.x) / o.rx;
    const uz = (z - o.z) / o.rz;
    if (Math.hypot(ux, uz) >= 1) continue;
    const nx = ux / o.rx;
    const nz = uz / o.rz;
    const length = Math.hypot(nx, nz) || 1;
    const along = (vx * nx + vz * nz) / length;
    vx = (vx - (2 * along * nx) / length) * BOUNCE;
    vz = (vz - (2 * along * nz) / length) * BOUNCE;
    x = b.x;
    z = b.z;
  }
  const cz = Math.min(WALK_BOUNDS.maxZ, Math.max(WALK_BOUNDS.minZ, z));
  const ch = halfWidthAt(cz);
  return { x: Math.min(ch, Math.max(-ch, x)), z: cz, vx, vz };
};

export const ballAt = (ball: Ball, now: number): RollingBall => {
  let b = { x: ball.x, z: ball.z, vx: ball.vx, vz: ball.vz };
  let travelled = 0;
  const elapsed = Math.max(0, (now - ball.at) / 1000);
  const whole = Math.min(MAX_STEPS, Math.floor(elapsed / STEP_S));
  const steps = whole < MAX_STEPS ? [...Array<number>(whole).fill(STEP_S), elapsed - whole * STEP_S] : Array<number>(whole).fill(STEP_S);
  for (const dt of steps) {
    if (Math.hypot(b.vx, b.vz) < REST_SPEED) {
      b = { ...b, vx: 0, vz: 0 };
      break;
    }
    const next = step(b, dt);
    travelled += Math.hypot(next.x - b.x, next.z - b.z);
    b = next;
  }
  const rolling = Math.hypot(b.vx, b.vz) >= REST_SPEED;
  return { ...b, vx: rolling ? b.vx : 0, vz: rolling ? b.vz : 0, rolling, floating: inWater(BALL_PLACE, b), travelled };
};

export const kickDirection = (from: { x: number; z: number }, to: { x: number; z: number }, dir?: { x: number; z: number }) => {
  for (const [x, z] of [[dir?.x ?? 0, dir?.z ?? 0], [to.x - from.x, to.z - from.z]]) {
    const length = Math.hypot(x, z);
    if (Number.isFinite(length) && length > 1e-6) return { x: x / length, z: z / length };
  }
  return { x: 0, z: -1 };
};

export const kickBall = (ball: Ball, direction: { x: number; z: number }, now: number): Ball => {
  const { x, z } = ballAt(ball, now);
  return { x, z, vx: direction.x * KICK_SPEED, vz: direction.z * KICK_SPEED, at: now };
};

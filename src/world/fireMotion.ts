export const FIRE_LOOP_MS = 2400;
export const STILL_PHASE = 0.3;
export const FLAMES = 3;
export const PUFFS = 4;

const TAU = Math.PI * 2;

export type FlameFrame = { scaleX: number; scaleY: number; dx: number };
export type PuffFrame = { rise: number; dx: number; scale: number; opacity: number };

export const flameAt = (phase: number, i: number): FlameFrame => {
  "worklet";
  const a = Math.sin(TAU * (3 * phase + i / FLAMES));
  const b = Math.sin(TAU * (7 * phase + i * 0.37));
  const c = Math.sin(TAU * (5 * phase + i * 0.5));
  return { scaleX: 1 - 0.06 * a, scaleY: 1 + 0.12 * a + 0.06 * b, dx: 0.05 * c };
};

export const puffAt = (phase: number, i: number): PuffFrame => {
  "worklet";
  const local = (((phase + i / PUFFS) % 1) + 1) % 1;
  return {
    rise: local,
    dx: 0.18 * Math.sin(TAU * (local + i * 0.3)) * local + 0.35 * local,
    scale: 0.5 + local,
    opacity: 0.42 * Math.sin(Math.PI * local),
  };
};

export const PREVIEW_GLIDE_MS = 520;
export const PREVIEW_AUTO_TURN = 0.6;
export const PREVIEW_AUTO_START_MS = 3000;
export const PREVIEW_SPIN_DECAY = 3;
export const PREVIEW_SPIN_STOP = 0.05;
const PREVIEW_FRONT_EPS = 0.002;
const PREVIEW_GOAL_EPS = 0.01;

export type PreviewGlide = {
  from: { s: number; y: number };
  to: { s: number; y: number };
  at: number;
  now: { s: number; y: number };
};

export type PreviewSpin = {
  down: boolean;
  lastX: number;
  lastAt: number;
  velocity: number;
  heading: number;
  openedAt: number;
  touched: boolean;
};

export const previewEaseInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

export const previewGoalMoved = (
  glide: PreviewGlide,
  target: { s: number; y: number }
) =>
  Math.abs(target.s - glide.to.s) > PREVIEW_GOAL_EPS ||
  Math.abs(target.y - glide.to.y) > PREVIEW_GOAL_EPS;

export const previewNeedsFrame = ({
  glide,
  spin,
  target,
  closeUp,
  now,
}: {
  glide: PreviewGlide;
  spin: PreviewSpin;
  target: { s: number; y: number; still: boolean };
  closeUp: boolean;
  now: number;
}): boolean => {
  if (previewGoalMoved(glide, target)) return true;
  if (!target.still && now - glide.at < PREVIEW_GLIDE_MS) return true;
  if (spin.down) return false;
  if (Math.abs(spin.velocity) > PREVIEW_SPIN_STOP) return true;
  if (!spin.touched && closeUp) {
    const front = Math.round(spin.heading / (Math.PI * 2)) * Math.PI * 2;
    return Math.abs(front - spin.heading) > PREVIEW_FRONT_EPS;
  }
  if (!spin.touched && !closeUp && !target.still && now - spin.openedAt >= PREVIEW_AUTO_START_MS) {
    return true;
  }
  return false;
};

export const previewAutoWaitMs = ({
  spin,
  closeUp,
  still,
  now,
}: {
  spin: PreviewSpin;
  closeUp: boolean;
  still: boolean;
  now: number;
}): number | null => {
  if (spin.down || spin.touched || closeUp || still) return null;
  const remaining = spin.openedAt + PREVIEW_AUTO_START_MS - now;
  return remaining > 0 ? remaining : 0;
};

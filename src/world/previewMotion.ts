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

/**
 * What the preview frames: the whole character, the outfit (the mouth down to
 * the feet), the head down to the waist for the extras, the head, the face, or
 * close on the eyes, the brows or the mouth.
 */
export type PreviewShot = "full" | "outfit" | "extras" | "head" | "face" | "eyes" | "brows" | "mouth";
const SHOT_CLOSENESS: Record<PreviewShot, number> = { full: 0, outfit: 0, extras: 0, head: 1, face: 2, eyes: 3, brows: 3, mouth: 3 };

/**
 * A close-up holds the character facing you; the wider shots (the whole body,
 * the outfit and the extras) turn slowly, so you see the back too.
 */
export const previewCloseUp = (shot: PreviewShot) => SHOT_CLOSENESS[shot] > 0;

/**
 * The character turns back to face you on a move to a closer shot, or from
 * one part of the face to another (the eyes to the mouth, say).
 */
export const previewRecenters = (from: PreviewShot, to: PreviewShot) =>
  SHOT_CLOSENESS[to] > SHOT_CLOSENESS[from] || (from !== to && SHOT_CLOSENESS[to] === 3 && SHOT_CLOSENESS[from] === 3);

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
  target: { s: number; y: number; still: boolean; snap?: boolean };
  closeUp: boolean;
  now: number;
}): boolean => {
  if (previewGoalMoved(glide, target)) return true;
  if (!target.still && !target.snap && now - glide.at < PREVIEW_GLIDE_MS) return true;
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

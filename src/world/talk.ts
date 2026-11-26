import { BUBBLE_MS } from "../../shared/world";

const FLAP_MS = 130;
export const FACE_MIN = 0.15;

export const bubbleAge = (say: { at: number } | undefined, now: number): number | null => {
  if (!say) return null;
  const age = now - say.at;
  return age >= 0 && age < BUBBLE_MS ? age : null;
};

export const mouthAt = (bubble: number | null, heading: number): boolean | undefined =>
  bubble === null || Math.cos(heading) <= FACE_MIN ? undefined : Math.floor(bubble / FLAP_MS) % 2 === 0;

export const nextFlapAt = (saidAt: number, bubble: number) => saidAt + (Math.floor(bubble / FLAP_MS) + 1) * FLAP_MS;

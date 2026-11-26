import { distance } from "../../shared/world";

/** How far from the arcade's spot you can step with its games open: a couple of steps. */
export const ARCADE_REACH = 1.5;

/**
 * Follows you while the arcade's games are open. `near` says you've stood by
 * the arcade since they opened; once you have, being out of reach closes
 * them, whether you walked off or were moved. Opened from a link somewhere
 * else, they stay open until you've been to the arcade and left it. With no
 * pose yet (still joining), nothing changes.
 */
export const arcadeStep = (
  near: boolean,
  pose: { x: number; z: number } | null,
  spot: { x: number; z: number }
): { near: boolean; leave: boolean } => {
  if (pose === null) return { near, leave: false };
  if (distance(pose, spot) <= ARCADE_REACH) return { near: true, leave: false };
  return { near, leave: near };
};

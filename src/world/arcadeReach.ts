import { distance } from "../../shared/world";

/** How far from the arcade's spot you can step with its games open: a couple of steps. */
export const ARCADE_REACH = 1.5;

/**
 * Follows you while the arcade's games are open. `near` says you've stood by
 * the arcade since they opened; once you have, heading out of reach closes
 * them the moment you set off, whether you walked off or were moved, rather
 * than when you've got there. A walk that ends within reach, like a step to
 * one side, keeps them open. Opened from a link somewhere else, they stay open
 * until you've been to the arcade and left it. With no walk yet (still
 * joining), nothing changes.
 */
export const arcadeStep = (
  near: boolean,
  pose: { x: number; z: number } | null,
  headed: { x: number; z: number } | null,
  spot: { x: number; z: number }
): { near: boolean; leave: boolean } => {
  if (pose === null || headed === null) return { near, leave: false };
  const by = near || distance(pose, spot) <= ARCADE_REACH;
  return { near: by, leave: by && distance(headed, spot) > ARCADE_REACH };
};

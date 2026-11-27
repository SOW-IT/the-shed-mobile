import { distance } from "../../shared/world";

/** How far from the arcade's spot you can step with its games open: a couple of steps. */
export const ARCADE_REACH = 1.5;

type Spot = { x: number; z: number };

/**
 * Whether you've stood by the arcade since its games opened, and where the
 * walk you were on then was headed. A new walk is one headed somewhere else.
 */
export type ArcadeReach = { near: boolean; headed: Spot | null };

export const AWAY_FROM_ARCADE: ArcadeReach = { near: false, headed: null };

/**
 * Follows you while the arcade's games are open. Once you've stood by the
 * arcade, setting off on a new walk that ends out of reach closes them as you
 * set off, not when you get there, whether you walked off or were moved. A
 * walk that ends within reach, like a step to one side, keeps them open. A
 * walk already under way when you came by, like one passing the arcade, closes
 * them once you're out of reach. Opened from a link somewhere else, they stay
 * open until you've been to the arcade and left it. With no walk yet (still
 * joining), nothing changes.
 */
export const arcadeStep = (
  reach: ArcadeReach,
  pose: Spot | null,
  headed: Spot | null,
  spot: Spot
): { reach: ArcadeReach; leave: boolean } => {
  if (pose === null || headed === null) return { reach, leave: false };
  if (distance(pose, spot) > ARCADE_REACH) return { reach, leave: reach.near };
  if (!reach.near || reach.headed === null) return { reach: { near: true, headed }, leave: false };
  const setOff = distance(headed, reach.headed) > 0.01;
  return { reach: { near: true, headed }, leave: setOff && distance(headed, spot) > ARCADE_REACH };
};

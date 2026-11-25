// The podium over a leaderboard: the top places on steps, 1st in the middle
// and highest, 2nd on the left, 3rd on the right.

import { PODIUM_PLACES } from "../../../shared/games";
import { withRanks } from "./leaderboardRanks";

export type PodiumStep<R> = {
  /** Where the step stands in the top list: 1 is the best score. */
  order: 1 | 2 | 3;
  /** Whoever stands on it, with their place; null for an empty step. */
  entry: (R & { rank: number }) | null;
  /** How tall the step is, from 0 to 1: by place, so a tie stands level. */
  height: number;
};

const HEIGHTS = [1, 0.72, 0.5];

/**
 * The steps left to right, from rows best first. Equal scores share a place
 * and stand level; an empty step keeps the shape with one or two people.
 * Null when nobody has a score.
 */
export const podiumSteps = <R extends { score: number }>(rows: readonly R[]): PodiumStep<R>[] | null => {
  const top = withRanks(rows.slice(0, PODIUM_PLACES));
  if (top.length === 0) return null;
  const step = (order: 1 | 2 | 3): PodiumStep<R> => {
    const entry = top[order - 1] ?? null;
    return { order, entry, height: HEIGHTS[(entry?.rank ?? order) - 1] };
  };
  return [step(2), step(1), step(3)];
};

import { distance, halfWidthAt, INTERACT_RADIUS, type Pose } from "../../shared/world";

const ASK_MARGIN = 0.4;
const STAND_OFF = 1.2;
const SETTLE_MS = 300;
export const APPROACH_MS = 25_000;

type Spot = { x: number; z: number };

type ApproachStep =
  | { kind: "ask" }
  | { kind: "walk"; to: Spot; aimedAt: string }
  | { kind: "wait" }
  | { kind: "giveUp" };

export const approachStep = ({
  mine,
  theirs,
  theirGoal,
  aimedAt,
  now,
}: {
  mine: Pose;
  theirs: Pose;
  theirGoal: Spot;
  aimedAt: string | null;
  now: number;
}): ApproachStep => {
  const gap = distance(mine, theirs);
  const settled = !mine.walking && now - mine.arrivesAt > SETTLE_MS;
  if (gap <= INTERACT_RADIUS - ASK_MARGIN || (settled && gap <= INTERACT_RADIUS)) return { kind: "ask" };
  const goal = `${theirGoal.x.toFixed(2)}:${theirGoal.z.toFixed(2)}`;
  if (aimedAt === goal) return settled && !theirs.walking ? { kind: "giveUp" } : { kind: "wait" };
  const comingFrom = mine.x < theirGoal.x ? -1 : 1;
  const fits = Math.abs(theirGoal.x + comingFrom * STAND_OFF) <= halfWidthAt(theirGoal.z);
  const side = fits ? comingFrom : -comingFrom;
  return { kind: "walk", to: { x: theirGoal.x + side * STAND_OFF, z: theirGoal.z }, aimedAt: goal };
};

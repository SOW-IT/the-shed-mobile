import { posAt, walkLength, type Pose, type Walk } from "../../shared/world";

export type Gait = {
  movingSince: number;
  heading: number;
  turnFrom: number;
  turnAt: number;
};

export type DrawnPose = Pose & {
  stridePhase: number;
  strideAmp: number;
  turning: boolean;
};

export const TURN_MS = 180;
export const STOP_MS = 220;
const STILL = 0.05;

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const easeOut = (k: number) => 1 - (1 - k) ** 3;

const turnToward = (from: number, to: number, k: number) =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;

const length = (walk: Walk) => walkLength(walk);

export const restingGait = (walk: Walk): Gait => {
  const heading = length(walk) < STILL ? 0 : posAt(walk, walk.startedAt).heading;
  return { movingSince: walk.startedAt, heading, turnFrom: heading, turnAt: walk.startedAt - TURN_MS };
};

export const drawnPose = (walk: Walk, gait: Gait, now: number): DrawnPose => {
  const pose = posAt(walk, now);
  const turned = clamp01((now - gait.turnAt) / TURN_MS);
  const targetHeading = walk.path && walk.path.length > 0 && length(walk) >= STILL ? pose.heading : gait.heading;
  return {
    ...pose,
    heading: turnToward(gait.turnFrom, targetHeading, easeOut(turned)),
    stridePhase: Math.max(0, now - gait.movingSince) / 1000,
    strideAmp: pose.walking ? 1 : clamp01(1 - (now - pose.arrivesAt) / STOP_MS),
    turning: turned < 1 && gait.turnFrom !== targetHeading,
  };
};

export const carryGait = (before: { walk: Walk; gait: Gait } | null, walk: Walk, now: number): Gait => {
  if (!before) return restingGait(walk);
  const was = drawnPose(before.walk, before.gait, now);
  return {
    movingSince: was.strideAmp > 0 ? before.gait.movingSince : now,
    heading: length(walk) < STILL ? before.gait.heading : posAt(walk, now).heading,
    turnFrom: was.heading,
    turnAt: now,
  };
};

const STRIDE_RATE = 12;
export const strideBob = (pose: { stridePhase: number; strideAmp: number }) =>
  Math.abs(Math.sin(pose.stridePhase * STRIDE_RATE)) * 0.14 * pose.strideAmp;
export const strideSwing = (pose: { stridePhase: number; strideAmp: number }) =>
  Math.sin(pose.stridePhase * STRIDE_RATE) * 0.07 * pose.strideAmp;

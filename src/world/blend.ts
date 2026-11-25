import { pathAhead, posAt, type Walk, type Waypoint } from "../../shared/world";
import { carryGait, restingGait, type Gait } from "./gait";

const SAME_SPOT = 0.05;
const TOO_FAR_TO_BLEND = 3;

export type LocalWalk = Walk & { gait: Gait };

export const headFor = (walk: LocalWalk | null, to: { x: number; z: number }, now: number, path?: readonly Waypoint[]): LocalWalk => {
  const from = walk ? posAt(walk, now) : to;
  const cleanPath = path && path.length > 0 ? path : undefined;
  const next: Walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: now, ...(cleanPath ? { path: cleanPath } : {}) };
  return { ...next, gait: carryGait(walk ? { walk, gait: walk.gait } : null, next, now) };
};

export const blendIn = (walk: LocalWalk | null, server: Walk, now: number): LocalWalk => {
  const { fromX, fromZ, toX, toZ, startedAt, path, heading } = server;
  const theirs: Walk = { fromX, fromZ, toX, toZ, startedAt, ...(path && path.length > 0 ? { path } : {}), ...(heading === undefined ? {} : { heading }) };
  if (!walk) return { ...theirs, gait: restingGait(theirs) };
  if (Math.hypot(walk.toX - toX, walk.toZ - toZ) < SAME_SPOT) return heading === undefined ? walk : { ...walk, heading };
  const here = posAt(walk, now);
  const there = posAt(theirs, now);
  if (Math.hypot(here.x - there.x, here.z - there.z) > TOO_FAR_TO_BLEND) {
    return { ...theirs, gait: carryGait({ walk, gait: walk.gait }, theirs, now) };
  }
  const next = headFor(walk, { x: toX, z: toZ }, now, pathAhead(theirs, now));
  return heading === undefined ? next : { ...next, heading };
};

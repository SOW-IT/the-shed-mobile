import { STANDS, type Place } from "../../shared/world";

const AT_STAND = 0.1;
const FACING = 0.3;

/**
 * What you're doing, for VoiceOver (and the verify checks): sitting, or at a
 * stand facing its way once you've turned there.
 */
export const myPoseLabel = (
  place: Place,
  pose: { x: number; z: number; walking: boolean; heading: number },
  seated: boolean
): string => {
  if (seated) return "You, sitting";
  if (pose.walking) return "You";
  const stand = STANDS[place].find((s) => Math.hypot(s.x - pose.x, s.z - pose.z) <= AT_STAND);
  if (!stand) return "You";
  const off = Math.abs(Math.atan2(Math.sin(pose.heading - stand.heading), Math.cos(pose.heading - stand.heading)));
  return off <= FACING ? `You, ${stand.label}` : "You";
};

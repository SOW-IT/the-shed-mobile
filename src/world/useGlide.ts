import { posAt, type Walk } from "@shared/world";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { carryGait, drawnPose, restingGait, type DrawnPose, type Gait } from "./gait";

/** How quickly a remote person's leftover offset fades (ms for ~63%). */
const GLIDE_MS = 300;
/** A gap bigger than this is a jump (a join, a long absence): no glide. */
const SNAP = 3;

type Glider = { memberId: string; me: boolean; walk: Walk | null; gait?: Gait };
type Offset = { dx: number; dz: number; at: number };
type Track = { startedAt: number; gait: Gait; offset?: Offset };

/**
 * Where to draw each person. Your own walk is drawn as it is, every frame.
 * Someone else's arrives from the server about twice a second at most while
 * they drag; when a new walk starts somewhere a little off from where they
 * were being drawn, the difference fades out over GLIDE_MS, so they glide to
 * the new line instead of jumping. Nothing here is sent anywhere.
 */
export const useGlide = (people: Glider[], now: number): (DrawnPose | null)[] => {
  const [tracks, setTracks] = useState<Record<string, Track>>({});
  const shown = useRef(new Map<string, { x: number; z: number }>());
  const last = useRef(new Map<string, { walk: Walk; gait: Gait }>());

  const poses = people.map((p) => {
    if (!p.walk) return null;
    if (p.me) return drawnPose(p.walk, p.gait ?? restingGait(p.walk), now);
    const track = tracks[p.memberId];
    const current = track?.startedAt === p.walk.startedAt ? track : undefined;
    const pose = drawnPose(p.walk, current?.gait ?? restingGait(p.walk), now);
    const o = current?.offset;
    if (!o) return pose;
    const k = Math.exp(-(now - o.at) / GLIDE_MS);
    if (k < 0.01) return pose;
    // Still easing: count as moving, so the garden keeps drawing frames.
    return { ...pose, x: pose.x + o.dx * k, z: pose.z + o.dz * k, walking: true };
  });

  // When someone's walk changes, keep the gap from where they were drawn.
  const walks = people.map((p) => `${p.memberId}:${p.walk?.startedAt ?? ""}`).join(",");
  useLayoutEffect(() => {
    const fresh: Record<string, Track> = {};
    for (const p of people) {
      if (p.me || !p.walk) continue;
      const before = last.current.get(p.memberId);
      if (before?.walk.startedAt === p.walk.startedAt) continue;
      const gait = carryGait(before ?? null, p.walk, now);
      last.current.set(p.memberId, { walk: p.walk, gait });
      const was = shown.current.get(p.memberId);
      if (!before || !was) continue;
      const start = posAt(p.walk, now);
      const dx = was.x - start.x;
      const dz = was.z - start.z;
      fresh[p.memberId] = {
        startedAt: p.walk.startedAt,
        gait,
        offset: Math.hypot(dx, dz) < SNAP ? { dx, dz, at: now } : undefined,
      };
    }
    if (Object.keys(fresh).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a new walk arrived; start its glide from where it was drawn
      setTracks((all) => ({ ...all, ...fresh }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on which walks are current, not the arrays
  }, [walks]);

  // Remember where everyone was drawn, for the next walk's glide.
  useEffect(() => {
    people.forEach((p, i) => {
      const pose = poses[i];
      if (pose) shown.current.set(p.memberId, { x: pose.x, z: pose.z });
    });
  });

  return poses;
};

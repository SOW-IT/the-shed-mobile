import { posAt, type Pose, type Walk } from "@shared/world";
import { useEffect, useRef, useState } from "react";

/** How quickly a remote person's leftover offset fades (ms for ~63%). */
const GLIDE_MS = 300;
/** A gap bigger than this is a jump (a join, a long absence): no glide. */
const SNAP = 3;

type Glider = { memberId: string; me: boolean; walk: Walk | null };
type Offset = { dx: number; dz: number; at: number };

/**
 * Where to draw each person. Your own walk is drawn as it is, every frame.
 * Someone else's arrives from the server about twice a second at most while
 * they drag; when a new walk starts somewhere a little off from where they
 * were being drawn, the difference fades out over GLIDE_MS, so they glide to
 * the new line instead of jumping. Nothing here is sent anywhere.
 */
export const useGlide = (people: Glider[], now: number): (Pose | null)[] => {
  const [offsets, setOffsets] = useState<Record<string, Offset>>({});
  const shown = useRef(new Map<string, { x: number; z: number }>());
  const started = useRef(new Map<string, number>());

  const poses = people.map((p) => {
    if (!p.walk) return null;
    const pose = posAt(p.walk, now);
    const o = offsets[p.memberId];
    if (p.me || !o) return pose;
    const k = Math.exp(-(now - o.at) / GLIDE_MS);
    if (k < 0.01) return pose;
    // Still easing: count as moving, so the garden keeps drawing frames.
    return { ...pose, x: pose.x + o.dx * k, z: pose.z + o.dz * k, walking: true };
  });

  // When someone's walk changes, keep the gap from where they were drawn.
  const walks = people.map((p) => `${p.memberId}:${p.walk?.startedAt ?? ""}`).join(",");
  useEffect(() => {
    const fresh: Record<string, Offset> = {};
    for (const p of people) {
      if (p.me || !p.walk) continue;
      const before = started.current.get(p.memberId);
      started.current.set(p.memberId, p.walk.startedAt);
      const was = shown.current.get(p.memberId);
      if (before === undefined || before === p.walk.startedAt || !was) continue;
      const start = posAt(p.walk, now);
      const dx = was.x - start.x;
      const dz = was.z - start.z;
      if (Math.hypot(dx, dz) < SNAP) fresh[p.memberId] = { dx, dz, at: now };
    }
    if (Object.keys(fresh).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a new walk arrived; start its glide from where it was drawn
      setOffsets((all) => ({ ...all, ...fresh }));
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

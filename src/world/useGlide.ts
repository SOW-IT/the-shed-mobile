import { posAt, type Walk } from "@shared/world";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { carryGait, drawnPose, restingGait, type DrawnPose, type Gait } from "./gait";

const GLIDE_MS = 300;
const SNAP = 3;

type Glider = { memberId: string; me: boolean; walk: Walk | null; gait?: Gait };
type Offset = { dx: number; dz: number; at: number };
type Track = { startedAt: number; gait: Gait; offset?: Offset };

export const useGlide = (people: Glider[], now: number): (DrawnPose | null)[] => {
  const [tracks, setTracks] = useState<Record<string, Track>>({});
  const shown = useRef(new Map<string, { x: number; z: number }>());
  const last = useRef(new Map<string, { walk: Walk; gait: Gait }>());

  const poses: (DrawnPose | null)[] = new Array(people.length);
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    if (!p.walk) {
      poses[i] = null;
      continue;
    }
    if (p.me) {
      poses[i] = drawnPose(p.walk, p.gait ?? restingGait(p.walk), now);
      continue;
    }
    const track = tracks[p.memberId];
    const current = track?.startedAt === p.walk.startedAt ? track : undefined;
    const pose = drawnPose(p.walk, current?.gait ?? restingGait(p.walk), now);
    const o = current?.offset;
    if (!o) {
      poses[i] = pose;
      continue;
    }
    const k = Math.exp(-(now - o.at) / GLIDE_MS);
    poses[i] = k < 0.01 ? pose : { ...pose, x: pose.x + o.dx * k, z: pose.z + o.dz * k, walking: true };
  }

  useLayoutEffect(() => {
    const fresh: Record<string, Track> = {};
    let hasFresh = false;
    const present = new Set<string>();
    for (const p of people) {
      present.add(p.memberId);
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
      hasFresh = true;
    }
    let pruned = false;
    for (const id of shown.current.keys()) {
      if (!present.has(id)) {
        shown.current.delete(id);
        last.current.delete(id);
        pruned = true;
      }
    }
    if (hasFresh || pruned) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync glide tracks when walks change or members leave
      setTracks((all) => {
        if (!pruned) return { ...all, ...fresh };
        const next: Record<string, Track> = {};
        for (const id of Object.keys(all)) {
          if (present.has(id)) next[id] = all[id];
        }
        return hasFresh ? { ...next, ...fresh } : next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on member list updates, not every clock tick
  }, [people]);

  useEffect(() => {
    for (let i = 0; i < people.length; i++) {
      const pose = poses[i];
      if (!pose) continue;
      const id = people[i].memberId;
      const slot = shown.current.get(id);
      if (slot) {
        slot.x = pose.x;
        slot.z = pose.z;
      } else {
        shown.current.set(id, { x: pose.x, z: pose.z });
      }
    }
  });

  useEffect(() => {
    const shownMap = shown.current;
    const lastMap = last.current;
    return () => {
      shownMap.clear();
      lastMap.clear();
    };
  }, []);

  return poses;
};

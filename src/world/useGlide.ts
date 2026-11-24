import { posAt, type Walk } from "../../shared/world";
import { useState } from "react";
import { carryGait, drawnPose, restingGait, type DrawnPose, type Gait } from "./gait";

const GLIDE_MS = 300;
const SNAP = 3;

type Glider = { memberId: string; me: boolean; walk: Walk | null; gait?: Gait };
type Offset = { dx: number; dz: number; at: number };
type Track = { walk: Walk; gait: Gait; offset?: Offset };
export type Tracks = ReadonlyMap<string, Track>;

const NO_TRACKS: Tracks = new Map();

const glidePose = (track: Track, now: number): DrawnPose => {
  const pose = drawnPose(track.walk, track.gait, now);
  const o = track.offset;
  if (!o) return pose;
  const k = Math.exp(-(now - o.at) / GLIDE_MS);
  return k < 0.01 ? pose : { ...pose, x: pose.x + o.dx * k, z: pose.z + o.dz * k, walking: true };
};

const samePath = (a: Walk["path"], b: Walk["path"]) => {
  const la = a?.length ?? 0;
  const lb = b?.length ?? 0;
  if (la !== lb) return false;
  if (!a || !b) return true;
  for (let i = 0; i < la; i++) {
    if (a[i].x !== b[i].x || a[i].z !== b[i].z) return false;
  }
  return true;
};

const sameWalk = (a: Walk, b: Walk) =>
  a.startedAt === b.startedAt &&
  a.fromX === b.fromX &&
  a.fromZ === b.fromZ &&
  a.toX === b.toX &&
  a.toZ === b.toZ &&
  samePath(a.path, b.path);

export const followWalks = (tracks: Tracks, people: Glider[], now: number): Tracks => {
  let next: Map<string, Track> | null = null;
  let kept = 0;
  for (const p of people) {
    if (p.me) continue;
    const before = tracks.get(p.memberId);
    if (before) kept++;
    if (!p.walk || (before && sameWalk(before.walk, p.walk))) continue;
    let offset: Offset | undefined;
    if (before) {
      const was = glidePose(before, now);
      const start = posAt(p.walk, now);
      const dx = was.x - start.x;
      const dz = was.z - start.z;
      if (Math.hypot(dx, dz) < SNAP) offset = { dx, dz, at: now };
    }
    next ??= new Map(tracks);
    next.set(p.memberId, { walk: p.walk, gait: carryGait(before ?? null, p.walk, now), offset });
  }
  if (kept < tracks.size) {
    const here = new Set(people.map((p) => p.memberId));
    next ??= new Map(tracks);
    for (const id of tracks.keys()) if (!here.has(id)) next.delete(id);
  }
  return next ?? tracks;
};

export const glidePoses = (tracks: Tracks, people: Glider[], now: number): (DrawnPose | null)[] =>
  people.map((p) => {
    if (!p.walk) return null;
    if (p.me) return drawnPose(p.walk, p.gait ?? restingGait(p.walk), now);
    const track = tracks.get(p.memberId);
    return track ? glidePose(track, now) : drawnPose(p.walk, restingGait(p.walk), now);
  });

export const useGlide = (people: Glider[], now: number): (DrawnPose | null)[] => {
  const [tracks, setTracks] = useState(NO_TRACKS);
  const current = followWalks(tracks, people, now);
  if (current !== tracks) setTracks(current);
  return glidePoses(current, people, now);
};

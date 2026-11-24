type Box = { x: number; bottom: number; width: number; height: number };

const GAP = 4;
export const MAX_NUDGE = 0.35;

const overlap = (a: Box, b: Box) => {
  const across = (a.width + b.width) / 2 + GAP - Math.abs(a.x - b.x);
  const up = Math.min(a.bottom, b.bottom) - Math.max(a.bottom - a.height, b.bottom - b.height) + GAP;
  return across > 0 && up > 0 ? across : 0;
};

export const spreadTags = <T extends Box>(tags: readonly T[]): T[] => {
  const out = tags.map((tag) => ({ ...tag }));
  const home = out.map((tag) => tag.x);
  const floor = out.map((tag) => tag.bottom);
  for (let i = 1; i < out.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = out[j];
      const b = out[i];
      const across = overlap(a, b);
      if (across === 0) continue;
      const side = b.x >= a.x ? 1 : -1;
      const room = (tag: T, k: number) => tag.width * MAX_NUDGE - Math.abs(tag.x - home[k]);
      const half = across / 2;
      const moveB = Math.min(half, Math.max(0, room(b, i)));
      const moveA = Math.min(across - moveB, Math.max(0, room(a, j)));
      b.x += side * moveB;
      a.x -= side * moveA;
      const lifted = a.bottom - a.height - GAP;
      if (overlap(a, b) > 0 && floor[i] - lifted <= Math.max(a.height, b.height) + GAP * 3) b.bottom = Math.min(b.bottom, lifted);
    }
  }
  return out;
};

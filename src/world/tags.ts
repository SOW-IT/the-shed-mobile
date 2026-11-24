type Box = { x: number; bottom: number; width: number; height: number };

const GAP = 4;
export const MAX_NUDGE = 0.35;

const overlap = (a: Box, b: Box) => {
  const across = (a.width + b.width) / 2 + GAP - Math.abs(a.x - b.x);
  const up = Math.min(a.bottom, b.bottom) - Math.max(a.bottom - a.height, b.bottom - b.height) + GAP;
  return across > 0 && up > 0 ? across : 0;
};

export const spreadTags = <T extends Box>(tags: readonly T[], top = -Infinity, fixed: readonly Box[] = []): T[] => {
  const pinned = fixed.length;
  const out: Box[] = [...fixed.map((box) => ({ ...box })), ...tags.map((tag) => ({ ...tag, bottom: Math.max(tag.bottom, top + tag.height) }))];
  const home = out.map((tag) => tag.x);
  const floor = out.map((tag) => tag.bottom);
  const room = (k: number) => (k < pinned ? 0 : out[k].width * MAX_NUDGE - Math.abs(out[k].x - home[k]));
  const clashesBefore = (k: number, x: number, until: number, skip: number) =>
    out.some((other, n) => n < until && n !== k && n !== skip && overlap({ ...out[k], x }, other) > 0 && overlap(out[k], other) === 0);
  for (let i = Math.max(1, pinned); i < out.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = out[j];
      const b = out[i];
      const across = overlap(a, b);
      if (across === 0) continue;
      const side = b.x >= a.x ? 1 : -1;
      const half = across / 2;
      const wantA = Math.min(half, Math.max(0, room(j)));
      const moveA = clashesBefore(j, a.x - side * wantA, i, i) ? 0 : wantA;
      const wantB = Math.min(across - moveA, Math.max(0, room(i)));
      const moveB = clashesBefore(i, b.x + side * wantB, i, j) ? 0 : wantB;
      b.x += side * moveB;
      a.x -= side * moveA;
      if (overlap(a, b) === 0) continue;
      const reach = Math.max(a.height, b.height) + GAP * 3;
      const lifted = a.bottom - a.height - GAP;
      const dropped = a.bottom + b.height + GAP;
      if (lifted - b.height >= top) {
        if (floor[i] - lifted <= reach) b.bottom = Math.min(b.bottom, lifted);
      } else if (dropped - floor[i] <= reach) b.bottom = Math.max(b.bottom, dropped);
    }
  }
  return out.slice(pinned) as T[];
};

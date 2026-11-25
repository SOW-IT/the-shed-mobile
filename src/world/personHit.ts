type Box = { left: number; right: number; top: number; bottom: number };

export const personAt = <T extends { me: boolean; box: Box; depth: number }>(people: readonly T[], x: number, y: number): T | null =>
  people
    .filter((h) => !h.me && x >= h.box.left && x <= h.box.right && y >= h.box.top && y <= h.box.bottom)
    .sort((a, b) => a.depth - b.depth)[0] ?? null;

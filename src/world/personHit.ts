type Box = { left: number; right: number; top: number; bottom: number };

const PROP_SLOP = 6;

const inside = (box: Box, x: number, y: number, slop = 0) =>
  x >= box.left - slop && x <= box.right + slop && y >= box.top - slop && y <= box.bottom + slop;

export const personAt = <T extends { me: boolean; box: Box; depth: number }>(people: readonly T[], x: number, y: number): T | null =>
  people.filter((h) => !h.me && inside(h.box, x, y)).sort((a, b) => a.depth - b.depth)[0] ?? null;

export const tapTarget = <T extends { me: boolean; box: Box; depth: number }, P extends { box: Box; depth: number }>(
  people: readonly T[],
  props: readonly P[],
  x: number,
  y: number
): { kind: "person"; person: T } | { kind: "prop"; prop: P } | null => {
  const person = personAt(people, x, y);
  const prop = props.filter((p) => inside(p.box, x, y, PROP_SLOP)).sort((a, b) => a.depth - b.depth)[0] ?? null;
  if (person && !(prop && prop.depth < person.depth)) return { kind: "person", person };
  return prop ? { kind: "prop", prop } : null;
};

type Layered = { depth: number; tag?: boolean };

export const layerOrder = <T extends Layered>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => b.depth - a.depth || Number(a.tag === true) - Number(b.tag === true));

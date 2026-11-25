export type ScrollEdges = { above: boolean; below: boolean };

export const scrollEdges = ({ offset, content, viewport }: { offset: number; content: number; viewport: number }, slack: number): ScrollEdges => {
  if (viewport <= 0 || content <= viewport + slack) return { above: false, below: false };
  return { above: offset > slack, below: offset + viewport < content - slack };
};

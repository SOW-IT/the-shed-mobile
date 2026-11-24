export const CHAT_ROLL = 20;

type Line = { id: string; at: number };

export const splitAfter = <L extends Line>(tail: readonly L[]): number | null => (tail.length >= CHAT_ROLL ? tail[0].at + 1 : null);

export const joinPages = <L extends Line>(tail: readonly L[], head: readonly L[], limit: number): L[] => {
  const seen = new Set(tail.map((line) => line.id));
  return [...tail, ...head.filter((line) => !seen.has(line.id))].slice(0, limit);
};

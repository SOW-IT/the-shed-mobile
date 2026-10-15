const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const typedMatches = (typed: string, expected: string): boolean =>
  normalize(typed) !== "" && normalize(typed) === normalize(expected);

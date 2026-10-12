const MINOR_WORDS = new Set(["of", "the", "and", "&", "at", "in"]);

export const churchAcronym = (name: string): string =>
  name
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word && !MINOR_WORDS.has(word.toLowerCase()))
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .join("")
    .toUpperCase() || name.trim();

export const churchPagePath = (churchId: string) => `/churches?church=${encodeURIComponent(churchId)}`;

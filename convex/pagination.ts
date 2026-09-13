/**
 * A `convex-helpers` paginator cursor is a JSON array; anything else (an
 * app-specific cursor, garbage from a client) is treated as "start over".
 */
export const asPaginatorCursor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return Array.isArray(JSON.parse(value)) ? value : null;
  } catch {
    return null;
  }
};

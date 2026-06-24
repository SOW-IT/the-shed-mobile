/** Tailwind-style tag colour tokens (ported from time-to-rollcall). */
export const TAG_COLOUR_NAMES = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

export type TagColourName = (typeof TAG_COLOUR_NAMES)[number];

/** Hex swatches for rendering tag pills in React Native. */
export const TAG_COLOUR_HEX: Record<TagColourName, string> = {
  gray: "#6B7280",
  red: "#EF4444",
  orange: "#F97316",
  amber: "#F59E0B",
  yellow: "#EAB308",
  lime: "#84CC16",
  green: "#22C55E",
  emerald: "#10B981",
  teal: "#14B8A6",
  cyan: "#06B6D4",
  blue: "#3B82F6",
  indigo: "#6366F1",
  violet: "#8B5CF6",
  purple: "#A855F7",
  fuchsia: "#D946EF",
  pink: "#EC4899",
  rose: "#F43F5E",
};

export const tagColourHex = (name?: string): string =>
  TAG_COLOUR_HEX[(name as TagColourName) ?? "blue"] ?? TAG_COLOUR_HEX.blue;

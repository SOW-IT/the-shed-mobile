// The colours a tag, or an event added to the calendar, can wear: a wheel of
// mid tones that read on both the cream and the dark theme. Names are stored,
// so a colour keeps its name when its shade is tuned.
export const TAG_COLOUR_NAMES = [
  "gray",
  "slate",
  "stone",
  "brown",
  "maroon",
  "crimson",
  "red",
  "rose",
  "coral",
  "orange",
  "amber",
  "gold",
  "yellow",
  "olive",
  "lime",
  "green",
  "forest",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "navy",
  "indigo",
  "violet",
  "lavender",
  "purple",
  "plum",
  "fuchsia",
  "pink",
] as const;

export type TagColourName = (typeof TAG_COLOUR_NAMES)[number];

export const TAG_COLOUR_HEX: Record<TagColourName, string> = {
  gray: "#6B7280",
  slate: "#64748B",
  stone: "#78716C",
  brown: "#92400E",
  maroon: "#9F1239",
  crimson: "#B91C1C",
  red: "#EF4444",
  rose: "#F43F5E",
  coral: "#FB7C5C",
  orange: "#F97316",
  amber: "#F59E0B",
  gold: "#B8860B",
  yellow: "#EAB308",
  olive: "#7C8A1A",
  lime: "#84CC16",
  green: "#22C55E",
  forest: "#15803D",
  emerald: "#10B981",
  teal: "#14B8A6",
  cyan: "#06B6D4",
  sky: "#0EA5E9",
  blue: "#3B82F6",
  navy: "#2541B2",
  indigo: "#6366F1",
  violet: "#8B5CF6",
  lavender: "#A78BFA",
  purple: "#A855F7",
  plum: "#7E22CE",
  fuchsia: "#D946EF",
  pink: "#EC4899",
};

export const isTagColour = (name: string | null | undefined): name is TagColourName =>
  name != null && Object.prototype.hasOwnProperty.call(TAG_COLOUR_HEX, name);

export const tagColourHex = (name?: string): string =>
  TAG_COLOUR_HEX[isTagColour(name) ? name : "blue"];

export const tagHexOf = (colour: string | null | undefined): string | undefined => {
  if (isTagColour(colour)) return TAG_COLOUR_HEX[colour];
  return colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : undefined;
};

// The Garden's colours (style C). The garden is daylight in both themes, like
// the offline games' scenes, so these don't follow the app theme. Lint allows
// colour literals in this file only, under src/world.

export const garden = {
  sky: "#CDE9EC",
  skyLow: "#DDF0EA",
  ink: "#1F3A33",
  shadow: "rgba(31, 58, 51, 0.2)",
  lawn: "#A8D58C",
  stripe: "#B4DC99",
  pave: "#F1E6CC",
  stone: "#EADCBD",
  bathStone: "#E7DCC4",
  bathTop: "#EFE6D2",
  water: "#9AD4E2",
  pond: "#8DCFE0",
  pondRim: "#E7DCC4",
  pad: "#5FA066",
  hedge: "#5FA066",
  wood: "#B7845E",
  trunk: "#9A6B4A",
  canopy: "#6DB46A",
  canopyLight: "#7EC277",
  leaves: "#7DBF6C",
  blooms: ["#F4A6B8", "#F6D365", "#FFFFFF", "#F08A6C"],
  blanketA: "#C9603A",
  blanketB: "#FFFEF8",
  basket: "#D9A35F",
  sign: "#1D4A41",
  signText: "#F5F3E3",
  arcade: "#1D4A41",
  arcadeTrim: "#C9603A",
  arcadeScreen: "#9AD4E2",
  ring: "#FFFEF8",
  markerPetal: "#F4A6B8",
  markerMiddle: "#F6D365",
  markerPin: "#C9603A",
  butterflies: ["#F6D365", "#F4A6B8", "#FFFFFF"],
} as const;

export const people = {
  skins: ["#F0C7A5", "#F6D9C2", "#B27B58", "#F2CDAE", "#C9926C", "#EFCBA9"],
  hairColours: ["#3A2A20", "#D49A5A", "#1C1714", "#7A4A2C", "#2A201A", "#141414"],
  shirts: ["#C9603A", "#F6E3D8", "#BCDCCD", "#F4A6B8", "#9DC5E0", "#D9CDEE", "#F6D365", "#A9D8A6"],
  feet: "#3F4A46",
  eye: "#1F2A28",
  eyeShine: "#FFFFFF",
  cheek: "#F4A0A0",
} as const;

/** The heads-up display over the garden: cream, forest and terracotta. */
export const hud = {
  card: "#FFFEF8",
  cream: "#F5F3E3",
  forest: "#0F2523",
  primary: "#1D4A41",
  primarySoft: "#DCE8E0",
  accent: "#C9603A",
  accentSoft: "#F6E3D8",
  onAccent: "#FFFFFF",
  placeholder: "#7F8C85",
  chip: "rgba(29, 74, 65, 0.92)",
  chipRing: "#BCDCCD",
  nameBg: "rgba(255, 254, 248, 0.92)",
  farBubble: "#E9EEE4",
  farText: "#6A7A72",
  farEdge: "#8FA197",
  scrim: "rgba(15, 37, 35, 0.35)",
} as const;

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/**
 * A colour mixed toward white (amount > 0) or black (amount < 0): the steps
 * of the toon ramp on a face or a ball.
 */
export const shade = (hex: string, amount: number): string => {
  const target = amount > 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  const parts = [0, 1, 2].map((i) => {
    const c = channel(hex, i);
    return Math.round(c + (target - c) * k)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${parts.join("")}`;
};

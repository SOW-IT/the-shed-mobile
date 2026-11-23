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
  ripple: "rgba(255, 255, 255, 0.55)",
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

export const places = {
  padRim: "#1F3A33",
  padFill: "#FFF1B8",
  padLabel: "rgba(29, 74, 65, 0.92)",
  padLabelText: "#F5F3E3",
  chapel: {
    sky: "#EFE2C8",
    floor: "#D7B98A",
    plank: "#CFAF7F",
    carpet: "#B8473A",
    carpetEdge: "#E9C46A",
    stage: "#C49A68",
    wall: "#F3E9D2",
    wood: "#8A5A3A",
    woodDark: "#5E3A26",
    cloth: "#FFFEF8",
    glass: ["#7FB8E6", "#F4A6B8", "#F6D365", "#8FCB9B"],
    candle: "#FFFEF8",
    flame: "#F6A93B",
    piano: "#2B2A33",
    keys: "#FFFEF8",
  },
  campfire: {
    sky: "#1D2A4A",
    grass: "#3F6B52",
    stripe: "#457358",
    dirt: "#7A6248",
    glow: "rgba(246, 169, 59, 0.28)",
    stone: "#9AA3A8",
    log: "#8A5A3A",
    logEnd: "#D9B98C",
    flame: "#F0703A",
    flameHot: "#F6D365",
    pine: "#2E5B46",
    pineLight: "#3A6E55",
    trunk: "#5E3A26",
    tentA: "#E0714F",
    tentB: "#5B8DB8",
    tentDoor: "#22303F",
    lantern: "#F6D365",
  },
  cafe: {
    sky: "#F2E4D0",
    floor: "#D9B48A",
    plank: "#CFA87C",
    rug: "#B8473A",
    rugInner: "#E9C46A",
    wall: "#F6ECDC",
    board: "#1D4A41",
    chalk: "#F5F3E3",
    window: "#BFE3EE",
    counter: "#8A5A3A",
    counterTop: "#F1E6CC",
    steel: "#AEB6BC",
    cup: "#FFFEF8",
    cake: "#F4A6B8",
    table: "#F1E6CC",
    leg: "#5E6B66",
    stool: "#C9603A",
    couch: "#5B8DB8",
    pot: "#C9603A",
    plant: "#5FA066",
  },
  beach: {
    sky: "#BFE6F2",
    sand: "#F3E2B3",
    sandDark: "#E6D09A",
    wet: "#DCC592",
    sea: "#5DB3CF",
    shallow: "#8DD3E3",
    foam: "#FFFFFF",
    plank: "#C89B6B",
    plankDark: "#B7895A",
    umbrella: "#E0514F",
    umbrellaStripe: "#FFFEF8",
    pole: "#F5F3E3",
    towel: "#5B8DB8",
    towelStripe: "#FFFEF8",
    castle: "#E6CB8C",
    flag: "#E0514F",
    post: "#F5F3E3",
    net: "#FFFEF8",
    ball: "#F6D365",
    palmTrunk: "#9A6B4A",
    palm: "#4F9A5E",
    palmLight: "#67B372",
    rock: "#9AA3A8",
  },
} as const;

// Choices grow by appending, so a saved index keeps its colour.
export const people = {
  skins: ["#F0C7A5", "#F6D9C2", "#B27B58", "#F2CDAE", "#C9926C", "#EFCBA9", "#8D5A3B", "#5E3A26"],
  hairColours: ["#3A2A20", "#D49A5A", "#1C1714", "#7A4A2C", "#2A201A", "#141414", "#E8C77A", "#B8473A", "#8A8F98"],
  shirts: ["#C9603A", "#F6E3D8", "#BCDCCD", "#F4A6B8", "#9DC5E0", "#D9CDEE", "#F6D365", "#A9D8A6", "#1D4A41", "#FFFEF8"],
  hats: { cap: "#C9603A", beanie: "#9DC5E0", pompom: "#FFFEF8", sunHat: "#F1D9A6", band: "#C9603A" },
  denim: "#5B7FA6",
  drawstring: "#FFFEF8",
  backpack: "#E5AD66",
  backpackStrap: "#8A5A2C",
  scarf: "#B8473A",
  glasses: "#1F2A28",
  mouth: "#7A2E2A",
  tear: "#8DCFE0",
  freckle: "#B07A5A",
  // Eye colours: dark, brown, blue, green, hazel, grey.
  eyeColours: ["#1F2A28", "#6B4226", "#3A6EA5", "#3E7D4F", "#8A6A2F", "#5F6B73"],
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
  scrim: "rgba(15, 37, 35, 0.35)",
} as const;

export const chatLog = {
  text: "#FFFFFF",
  shadow: "rgba(20, 20, 20, 0.85)",
  time: "#D4D4D4",
  me: "#FFFF55",
  place: "#7FF6FF",
  name: "#FFFFFF",
  status: "#E0E0E0",
} as const;

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

const lightness = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);

export const lightToDark = (colours: readonly string[]): number[] =>
  colours.map((_, i) => i).sort((a, b) => lightness(colours[b]) - lightness(colours[a]));

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

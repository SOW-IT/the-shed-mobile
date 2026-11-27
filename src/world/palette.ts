// The Garden's colours (style C). The garden is daylight in both themes, like
// the offline games' scenes, so these don't follow the app theme. Lint allows
// colour literals in this file only, under src/world.

import { customRgb, lookPart, type Look } from "../../shared/world";
import { worldColours } from "../worldColours";

export const garden = {
  sky: worldColours.sky,
  skyLow: "#DDF0EA",
  ink: "#1F3A33",
  shadow: "rgba(31, 58, 51, 0.2)",
  lawn: worldColours.lawn,
  stripe: worldColours.stripe,
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
  noticePaper: "#FFFEF8",
  noticeHeader: "#C9603A",
  noticeGrid: "#D8D2BE",
  cork: "#C99A62",
  corkFrame: "#8A5A3A",
  notes: ["#FFFEF8", "#FFF1B8", "#F6E3D8", "#DCE8E0"],
  highlight: "#F6D365",
  highlightGlow: "rgba(246, 211, 101, 0.35)",
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
    smoke: "#C9CED6",
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
    felt: "#2F7A55",
    feltEdge: "#7A4A2C",
    tile: "#FFFEF8",
    tileBack: "#3E8E6A",
  },
  home: {
    sky: "#EFE6D6",
    floor: "#C99A6B",
    plank: "#BF8F60",
    mat: "#B8473A",
    window: "#BFE3EE",
    frame: "#F6D365",
    door: "#8A5A3A",
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
    ballRed: "#E0514F",
    ballBlue: "#4A8FD1",
    ballWhite: "#FFFEF8",
    palmTrunk: "#9A6B4A",
    palm: "#4F9A5E",
    palmLight: "#67B372",
    rock: "#9AA3A8",
  },
  library: {
    sky: "#EDE3D0",
    floor: "#B98A5E",
    plank: "#AF8155",
    wall: "#EFE4CE",
    rug: "#2F5D50",
    rugInner: "#B8473A",
    rugCentre: "#E9C46A",
    runner: "#2F5D50",
    runnerEdge: "#E9C46A",
    shelf: "#6E4630",
    shelfDark: "#4E3022",
    books: ["#B8473A", "#2F5D50", "#E9C46A", "#5B8DB8", "#F1E6CC", "#8A5A3A", "#C9603A"],
    table: "#8A5A3A",
    tableTop: "#6E4630",
    chair: "#5E3A26",
    armchair: "#7A3B3B",
    armchairLight: "#934A48",
    lampShade: "#F6D365",
    deskLamp: "#2F6B4F",
    brass: "#C9A24A",
    glow: "rgba(246, 211, 101, 0.3)",
    window: "#BFE3EE",
    clock: "#FFFEF8",
    globe: "#5B8DB8",
    globeLand: "#8FCB9B",
    paper: "#FFFEF8",
  },
  backyard: {
    sky: "#CDE9EC",
    grass: "#A8D58C",
    stripe: "#B4DC99",
    path: "#E3D2AE",
    soil: "#8A6244",
    soilDark: "#6E4B34",
    furrow: "#7A553B",
    locked: "#C3DFA8",
    fence: "#D9B98C",
    fenceDark: "#B7845E",
    shed: "#5B8DB8",
    roof: "#B8473A",
    door: "#F1E6CC",
    barrel: "#8A5A3A",
    barrelBand: "#5E6B66",
    water: "#9AD4E2",
    coopWall: "#E9CD97",
    coopRoof: "#B8473A",
    coopDoor: "#5B4636",
    coopGround: "#D9C48F",
    barnWall: "#C8513F",
    barnRoof: "#6B5B53",
    barnTrim: "#FFF6E6",
    barnGround: "#93C47A",
    straw: "#F1DC97",
    hay: "#E7C35E",
    trough: "#8A6244",
  },
} as const;

export const animals = {
  chick: "#F6D365",
  chickWing: "#EDC24A",
  pullet: "#E9C89A",
  pulletWing: "#D7A877",
  hen: "#FFF9EE",
  henWing: "#EFE2CC",
  comb: "#E0514F",
  beak: "#F0A23B",
  legs: "#E9A23B",
  calf: "#C99A6B",
  cow: "#FFFDF7",
  spot: "#3A3433",
  youngSpot: "#8A5A3A",
  cowLeg: "#5B4C46",
  udder: "#F2A7A0",
  muzzle: "#F4C1B8",
  horn: "#EFE3C4",
  badge: "#FFFEF8",
  bowl: "#B9C2C4",
  egg: "#FFF6E6",
  nest: "#B7845E",
  milk: "#FFFFFF",
  cap: "#4A9FD1",
  hay: "#E7C35E",
  hayBand: "#B7845E",
  grain: "#F1D27A",
  tag: "#F6D365",
  frail: "#9AA0A0",
  namePill: "rgba(255, 254, 248, 0.86)",
  nameText: "#1D4A41",
} as const;

export const farm = {
  leaf: "#5FA066",
  leafLight: "#7EC277",
  stem: "#4A8A55",
  mound: "#7A553B",
  seed: "#E9D3A6",
  wilt: "#9A7B4A",
  dead: "#9AA0A0",
  deadDark: "#7D8282",
  drop: "#4A9FD1",
  dropLight: "#BFE3F5",
  sparkle: "#F6D365",
  can: "#5B8DB8",
  canDark: "#41698C",
  tag: "rgba(29, 74, 65, 0.92)",
  tagText: "#F5F3E3",
  card: "#FFF9EE",
  cardMuted: "#5E6B66",
  cardTrack: "#E6DEC8",
  cardBadgeBg: "#F1E6CC",
  cardTones: {
    good: { accent: "#5FA066", pillBg: "#DFF0DF", pillText: "#1D4A41", bar: "#5FA066" },
    ready: { accent: "#E9A23B", pillBg: "#FFF0BF", pillText: "#7A4A0B", bar: "#E9A23B" },
    water: { accent: "#4A9FD1", pillBg: "#D8EFFA", pillText: "#1B557A", bar: "#4A9FD1" },
    warn: { accent: "#C9603A", pillBg: "#F9E2D8", pillText: "#8C3719", bar: "#C9603A" },
    muted: { accent: "#8A8F98", pillBg: "#E6E8EB", pillText: "#4B5259", bar: "#8A8F98" },
  },
  petal: "#FFFEF8",
  bloom: "#F6D365",
  bloomDeep: "#E9A23B",
  wet: "rgba(46, 30, 20, 0.35)",
  dust: "#C7A37E",
  seeds: {
    lettuce: "#4A3B2C",
    carrot: "#C9A36A",
    strawberry: "#E9C64B",
    tomato: "#F1E6C8",
    pumpkin: "#F3E7C4",
    watermelon: "#1E1A1A",
  },
  seedRim: "#D8C79A",
  dish: "#E9D9B4",
  seedShine: "#FFFFFF",
  crops: {
    lettuce: { fruit: "#8FCB6B", light: "#B9E08F", dark: "#5FA066" },
    carrot: { fruit: "#F0883A", light: "#F6B06A", dark: "#C9603A" },
    strawberry: { fruit: "#E0514F", light: "#F48A86", dark: "#B23A3A" },
    tomato: { fruit: "#E8473A", light: "#F47F6C", dark: "#B8473A" },
    pumpkin: { fruit: "#F08A3C", light: "#F6B26B", dark: "#C9682A" },
    watermelon: { fruit: "#4F9A5E", light: "#7EC277", dark: "#2E6B40" },
  },
} as const;

// Choices grow by appending, so a saved index keeps its colour.
export const people = {
  // Then porcelain, golden, deep brown and the deepest.
  skins: ["#F0C7A5", "#F6D9C2", "#B27B58", "#F2CDAE", "#C9926C", "#EFCBA9", "#8D5A3B", "#5E3A26", "#FCE9DE", "#DDAA80", "#734730", "#42291B"],
  // Then pink, blue and platinum.
  hairColours: ["#3A2A20", "#D49A5A", "#1C1714", "#7A4A2C", "#2A201A", "#141414", "#E8C77A", "#B8473A", "#8A8F98", "#E896B4", "#5E86C2", "#ECE6D8"],
  // Tops. Then red, coral, orange, mustard, lime, teal, sky, navy, royal blue,
  // purple, plum, burgundy, grey and black.
  shirts: [
    "#C9603A", "#F6E3D8", "#BCDCCD", "#F4A6B8", "#9DC5E0", "#D9CDEE", "#F6D365", "#A9D8A6", "#1D4A41", "#FFFEF8",
    "#D9473A", "#F08A6C", "#F0A04B", "#E2B23E", "#B5D86A", "#3E9A9A", "#7EC8E8", "#2E3F5E", "#3A64B8", "#8A5CC2",
    "#7A3A5C", "#8E2E3E", "#9AA3A8", "#26302E",
  ],
  hats: {
    cap: "#C9603A",
    beanie: "#9DC5E0",
    pompom: "#FFFEF8",
    sunHat: "#F1D9A6",
    band: "#C9603A",
    // Worn in the favourite colour; these until one is picked.
    beret: "#B8473A",
    bow: "#F4A6B8",
    headband: "#9DC5E0",
    party: "#9DC5E0",
    crown: "#F6C744",
  },
  denim: "#5B7FA6",
  drawstring: "#FFFEF8",
  backpack: "#E5AD66",
  backpackStrap: "#8A5A2C",
  scarf: "#B8473A",
  glasses: "#1F2A28",
  clearRim: "#D9E4E6",
  clearLens: "rgba(255, 255, 255, 0.18)",
  tieDye: "#E0514F",
  // The sailor top's collar and neckerchief, and the Hawaiian shirt's flowers.
  sailor: "#2E3F5E",
  sailorStripe: "#FFFEF8",
  neckerchief: "#D9473A",
  hibiscus: ["#FFFEF8", "#F6D365", "#F08A6C"],
  shades: "#26302E",
  collar: "#FFFEF8",
  plaid: "#E8893A",
  headphones: "#3F4A46",
  pearl: "#FFFEF8",
  mole: "#5A3B2C",
  // Bottoms: denim, charcoal, khaki, navy, brown, cream, olive and pink, then
  // black, white, grey, burgundy, teal, mustard, lilac and sky.
  pants: [
    "#5B7FA6", "#3F4A46", "#C9B48A", "#2E3F5E", "#7A5238", "#F1ECE0", "#6E7F4E", "#E8A0B8",
    "#26302E", "#FFFEF8", "#9AA3A8", "#8E2E3E", "#3E8A8A", "#D9A83E", "#B9A3E3", "#9DC5E0",
  ],
  // Makeup, after "None": lilac, peach, teal, gold and rose eyeshadow, and
  // rose, red, coral, plum and pink lipstick.
  eyeshadow: ["#B9A3E3", "#F2B48C", "#6FC1B8", "#E2C36A", "#E89AAE"],
  lipstick: ["#D46A7E", "#C9302C", "#EE7B62", "#8A3A5C", "#F08FB4"],
  tongue: "#E8828A",
  mouth: "#7A2E2A",
  tear: "#8DCFE0",
  freckle: "#B07A5A",
  // Eye colours: dark, brown, blue, green, hazel, grey.
  eyeColours: ["#1F2A28", "#6B4226", "#3A6EA5", "#3E7D4F", "#8A6A2F", "#5F6B73"],
  // Favourite colours, worn as shoes. The first is the shoes everyone had
  // before, then red, orange, yellow, lime, green, sky, blue, purple, pink,
  // brown and white, then teal, coral, navy, lilac, black and gold.
  backdrops: ["#BFE3DA", "#BFD9F0", "#F6D2BC", "#F3E3A6", "#D9CCEF", "#F2C4D0", "#C9DDB5", "#E6D5BC", "#9FB4C2", "#F0A99A"],
  favourites: [
    "#3F4A46", "#D9473A", "#F08A3C", "#F6CF45", "#A6D65A", "#3E9A5A", "#7EC8E8", "#3A64B8", "#8A5CC2", "#F08FB4", "#8A5A3A", "#F5F3EC",
    "#3E9A9A", "#F08A6C", "#2E3F5E", "#B9A3E3", "#26302E", "#E2B23E",
  ],
  eye: "#1F2A28",
  eyeShine: "#FFFFFF",
  cheek: "#F4A0A0",
} as const;

/** The heads-up display over the garden: cream, forest and terracotta. */
export const hud = worldColours.hud;

/** The notice board's panel: a cork board in a wooden frame, papers pinned on. */
export const board = {
  frame: "#8A5A3A",
  frameDark: "#5E3A26",
  frameLight: "#B7845E",
  cork: "#C99A62",
  speck: "rgba(94, 58, 38, 0.22)",
  ink: "#1F3A33",
  muted: "rgba(31, 58, 51, 0.62)",
  paper: "#FFFEF8",
  notice: "#FFF1B8",
  unread: "#F6E3D8",
  pins: ["#C9603A", "#5B8DB8", "#5FA066", "#F6D365"],
  pinShine: "rgba(255, 255, 255, 0.6)",
  tag: "#C9603A",
  onTag: "#FFFFFF",
  plaque: "#F5F3E3",
  scrim: "rgba(6, 16, 15, 0.45)",
  drop: "#000000",
  pinEdge: "rgba(0, 0, 0, 0.25)",
  space: "rgba(255, 254, 248, 0.35)",
  line: "rgba(31, 58, 51, 0.25)",
} as const;

export const glass = worldColours.glass;

export const home = {
  rug: "#5B8DB8",
  rugInner: "#F6D365",
  pot: "#C9603A",
  leaf: "#5FA066",
  leafLight: "#7DBB7F",
  metal: "#5E6B66",
  shade: "#F6E3B4",
  wood: "#C89B6B",
  woodDark: "#8A5A3A",
  cup: "#FFFEF8",
  books: ["#B8473A", "#5B8DB8", "#F6D365", "#5FA066", "#D9CDEE"],
  screen: "#22303F",
  tvFrame: "#26302E",
  sofa: "#C9603A",
  sofaDark: "#A84E2E",
  cushion: "#F6D365",
  brick: "#B8604A",
  mantel: "#F1E6CC",
  flame: "#F0703A",
  flameHot: "#F6D365",
  sheet: "#FFFEF8",
  blanket: "#9DC5E0",
  pillow: "#F6E3D8",
  beanbag: "#D9CDEE",
} as const;

export const gold = worldColours.gold;

export const wallpapers = {
  plain: { base: "#F6ECDC", accent: "#F6ECDC", pattern: "plain" },
  mint: { base: "#D8EFE2", accent: "#A9D8BC", pattern: "stripes" },
  rose: { base: "#F8E1E6", accent: "#E89AAE", pattern: "dots" },
  sky: { base: "#CFE8F5", accent: "#FFFFFF", pattern: "dots" },
  sunset: { base: "#F8D9B8", accent: "#E9946A", pattern: "stripes" },
  lavender: { base: "#E6DDF4", accent: "#C4B2E4", pattern: "check" },
  forest: { base: "#2F5A4A", accent: "#3D6E5B", pattern: "stripes" },
  stars: { base: "#22305A", accent: "#F6D365", pattern: "stars" },
  lemon: { base: "#FBF1BE", accent: "#F2D86A", pattern: "check" },
} as const;

export const signal = {
  good: "#4CD07D",
  fair: "#F2B134",
  poor: "#EF5B45",
  offOnGlass: "rgba(245, 243, 227, 0.22)",
  offOnCard: "rgba(15, 37, 35, 0.18)",
} as const;

export const signalColour = (bars: number) => (bars >= 3 ? signal.good : bars === 2 ? signal.fair : signal.poor);

export const chatLog = {
  backing: "rgba(10, 14, 13, 0.38)",
  fade: "rgba(10, 14, 13, 0.85)",
  text: "#FFFFFF",
  shadow: "rgba(20, 20, 20, 0.85)",
  time: "#D4D4D4",
  me: "#FFFF55",
  place: "#7FF6FF",
  name: "#FFFFFF",
  status: "#E0E0E0",
  system: "#FFFF55",
} as const;

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

export const mix = (from: string, to: string, k: number): string => {
  const step = (i: number) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * k).toString(16).padStart(2, "0");
  return `#${step(0)}${step(1)}${step(2)}`;
};

const lightness = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);

/** Whether a colour is pale enough that something on it should be dark. */
export const isLight = (hex: string) => lightness(hex) > 200;

export const lightToDark = (colours: readonly string[]): number[] =>
  colours.map((_, i) => i).sort((a, b) => lightness(colours[b]) - lightness(colours[a]));

const SHADE_CACHE_MAX = 512;
const shadeCache = new Map<string, string>();

/**
 * A colour mixed toward white (amount > 0) or black (amount < 0): the steps
 * of the toon ramp on a face or a ball.
 */
export const shade = (hex: string, amount: number): string => {
  const key = `${hex}:${amount}`;
  const cached = shadeCache.get(key);
  if (cached !== undefined) return cached;
  const target = amount > 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  const r = Math.round(channel(hex, 0) + (target - channel(hex, 0)) * k).toString(16).padStart(2, "0");
  const g = Math.round(channel(hex, 1) + (target - channel(hex, 1)) * k).toString(16).padStart(2, "0");
  const b = Math.round(channel(hex, 2) + (target - channel(hex, 2)) * k).toString(16).padStart(2, "0");
  const result = `#${r}${g}${b}`;
  if (shadeCache.size >= SHADE_CACHE_MAX) shadeCache.clear();
  shadeCache.set(key, result);
  return result;
};

/** A mahjong bot's face: a screen with glowing eyes. The same in both themes, like the World. */
export const botFace = { head: "#8FB7C9", face: "#21343D", eye: "#9BF0E1", edge: "#F5F3E3", antenna: "#F6D365" };

/** The mahjong table: felt, wood, ivory tiles, and each suit's ink. The same in both themes. */
export const mahjong = {
  felt: "#1F5E45",
  feltLight: "#2B7556",
  feltDark: "#163F30",
  rail: "#6B3F24",
  tile: "#FFFDF4",
  tileEdge: "#D9CFB4",
  tileSide: "#E9C46A",
  back: "#2F8F68",
  backEdge: "#1E6A4C",
  dots: "#2563B8",
  bamboo: "#1E7F45",
  characters: "#C0392B",
  honour: "#1F2A2E",
  flower: "#8E44AD",
  lit: "#F6D365",
  litSoft: "rgba(246, 211, 101, 0.35)",
  text: "#F5F3E3",
  muted: "rgba(245, 243, 227, 0.7)",
  chip: "rgba(0, 0, 0, 0.28)",
  win: "#F6D365",
  lose: "#FFB4A6",
  gain: "#9BF0B4",
  shout: "#FFFFFF",
  shoutEdge: "#C9603A",
  face: "#FCFCFA",
  faceEdge: "#D8D8D2",
  faceSide: "#C9CCC4",
  backOrange: "#F08419",
  backOrangeEdge: "#C2620A",
  inkBlue: "#2B2FA8",
  inkGreen: "#1F6B45",
  inkRed: "#C8193C",
};

/** 0xRRGGBB as "#rrggbb". */
export const rgbHex = (rgb: number): string => `#${(Math.round(rgb) & 0xffffff).toString(16).padStart(6, "0")}`;

/** "#rrggbb" as 0xRRGGBB. */
export const hexRgb = (hex: string): number => parseInt(hex.slice(1, 7), 16);

/** The top's colour: a custom one, or one of the palette's. */
export const shirtColour = (look: Look): string => {
  const custom = customRgb(look.shirt);
  return custom !== null ? rgbHex(custom) : (people.shirts[look.shirt] ?? people.shirts[0]);
};

/** The bottoms' colour: a custom one, or one of the palette's. */
export const pantsColour = (look: Look): string => {
  const custom = customRgb(look.pantsColour);
  return custom !== null ? rgbHex(custom) : (people.pants[lookPart(look, "pantsColour")] ?? people.pants[0]);
};

/** The favourite colour, or null before one is picked (the first swatch). */
export const favouriteColour = (look: Look): string | null => {
  const custom = customRgb(look.favourite);
  if (custom !== null) return rgbHex(custom);
  const pick = lookPart(look, "favourite");
  return pick > 0 ? (people.favourites[pick] ?? null) : null;
};

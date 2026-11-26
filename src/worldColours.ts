// The World's heads-up display and menus, daylight in both themes. They live
// here rather than in src/world/palette.ts so the Games list, which loads at
// startup, can wear the same look without loading the World; the World's
// palette re-exports them. Lint allows colour literals in this file.

export const worldColours = {
  /** Chips and buttons over the garden: cream, forest and terracotta. */
  hud: {
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
    npcBg: "#F6D365",
    scrim: "rgba(15, 37, 35, 0.35)",
  },
  /** The menus and panels: dark glass over the garden. */
  glass: {
    panel: "rgba(12, 30, 28, 0.84)",
    /** A panel on a phone, where nothing blurs what's behind it: solid, so labels under it don't show through. */
    panelSolid: "#0C1E1C",
    edge: "rgba(255, 255, 255, 0.16)",
    row: "rgba(255, 255, 255, 0.07)",
    rowPressed: "rgba(255, 255, 255, 0.16)",
    here: "rgba(201, 96, 58, 0.34)",
    text: "#F5F3E3",
    muted: "rgba(245, 243, 227, 0.68)",
    error: "#FFB4A6",
    scrim: "rgba(6, 16, 15, 0.32)",
    scrimDeep: "rgba(6, 16, 15, 0.55)",
  },
  gold: { light: "#F6D365", text: "#B07A10" },
  /** The garden's sky and lawn, behind the Games list outside the World. */
  sky: "#CDE9EC",
  lawn: "#A8D58C",
  stripe: "#B4DC99",
} as const;

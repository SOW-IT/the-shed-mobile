import { Platform, TextStyle, useColorScheme, ViewStyle } from "react-native";

export const USE_NATIVE_DRIVER = Platform.OS !== "web";

const OVERLAY_OUT = 100;

export const durations = {
  overlayIn: 130,
  overlayOut: OVERLAY_OUT,
  sheetHandoff: OVERLAY_OUT + 80,
  screen: 220,
  fadeIn: 190,
} as const;

export const BOTTOM_TAB_HEIGHT = 50;

export const WIDE_SCREEN_MIN_WIDTH = 700;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
} as const;

export const fonts = {
  display: "FamiljenGrotesk-Bold",
  displaySemi: "FamiljenGrotesk-SemiBold",
} as const;

export const typography = {
  largeTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 37, letterSpacing: -0.6 } as TextStyle,
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.3 } as TextStyle,
  section: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, letterSpacing: -0.2 } as TextStyle,
  headline: { fontFamily: fonts.displaySemi, fontSize: 16.5, lineHeight: 21, letterSpacing: -0.1 } as TextStyle,
  body: { fontSize: 15, letterSpacing: -0.15, lineHeight: 21 } as TextStyle,
  caption: { fontSize: 13, letterSpacing: -0.05, lineHeight: 18 } as TextStyle,
  label: { fontSize: 13, fontWeight: "600", letterSpacing: -0.05 } as TextStyle,
  amount: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 } as TextStyle,
} as const;

export interface AppTheme {
  dark: boolean;
  background: string;
  card: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  separator: string;
  inputBackground: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  dangerStrong: string;
  dangerStrongEdge: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  ghost: string;
  ghostText: string;
  overlay: string;
  /** The shade at a scrolled edge of a grid. */
  edgeShade: string;
  chip: Record<"PAID" | "DECLINED" | "default", { bg: string; fg: string }>;
  errorBackground: string;
  errorText: string;
  surfaceEdge: ViewStyle;
  shadowFloat: ViewStyle;
}

const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const shadowStyle = (
  color: string,
  opacity: number,
  radius: number,
  offsetY: number,
  elevation: number
): ViewStyle =>
  Platform.OS === "web"
    ? { boxShadow: `0px ${offsetY}px ${radius}px ${hexToRgba(color, opacity)}` }
    : {
        shadowColor: color,
        shadowOpacity: opacity,
        shadowRadius: radius,
        shadowOffset: { width: 0, height: offsetY },
        elevation,
      };

const lightShadowFloat = shadowStyle("#0F2523", 0.14, 24, 10, 8);
const darkShadowFloat = shadowStyle("#000000", 0.45, 24, 10, 8);

const light: AppTheme = {
  dark: false,
  background: "#F5F3E3",
  card: "#FFFEF8",
  text: "#0F2523",
  muted: "#56665E",
  faint: "#87938B",
  border: "#DCD9C4",
  separator: "#ECE9D8",
  inputBackground: "#F3F1E3",
  primary: "#1D4A41",
  onPrimary: "#F5F3E3",
  primarySoft: "#DCE8E0",
  accent: "#C9603A",
  accentSoft: "#F6E3D8",
  success: "#356B48",
  successSoft: "#DDEED6",
  danger: "#B03E37",
  dangerSoft: "#F5DED8",
  dangerStrong: "#B3261E",
  dangerStrongEdge: "#7A1712",
  onDanger: "#FFFFFF",
  warning: "#7F5612",
  warningSoft: "#F2E2B4",
  ghost: "#EAE8D8",
  ghostText: "#0F2523",
  overlay: "rgba(15, 37, 35, 0.45)",
  edgeShade: "rgba(15, 37, 35, 0.14)",
  chip: {
    PAID: { bg: "#E2F1DA", fg: "#2C5239" },
    DECLINED: { bg: "#F6DFD9", fg: "#9C3A23" },
    default: { bg: "#F6E8CD", fg: "#8A5E1A" },
  },
  errorBackground: "#F5DED8",
  errorText: "#7C3015",
  surfaceEdge: { borderWidth: 1, borderColor: "#E4E1CD" },
  shadowFloat: lightShadowFloat,
};

const dark: AppTheme = {
  dark: true,
  background: "#0B1D1B",
  card: "#132A27",
  text: "#F5F3E3",
  muted: "#A6BAAF",
  faint: "#71877C",
  border: "#2A4842",
  separator: "#1F3A35",
  inputBackground: "#0F2421",
  primary: "#BCDCCD",
  onPrimary: "#0B1D1B",
  primarySoft: "#1F3E37",
  accent: "#E5AD66",
  accentSoft: "#3C3122",
  success: "#6FA983",
  successSoft: "#1E4634",
  danger: "#E08A63",
  dangerSoft: "#46251B",
  dangerStrong: "#8C1D18",
  dangerStrongEdge: "#E5574B",
  onDanger: "#FFF4F1",
  warning: "#E5AD66",
  warningSoft: "#4A3A1C",
  ghost: "#21403A",
  ghostText: "#F5F3E3",
  overlay: "rgba(0, 0, 0, 0.6)",
  edgeShade: "rgba(0, 0, 0, 0.5)",
  chip: {
    PAID: { bg: "#1E4634", fg: "#DDF0DC" },
    DECLINED: { bg: "#52281A", fg: "#F2D4C6" },
    default: { bg: "#4A3A1C", fg: "#F0DDB6" },
  },
  errorBackground: "#52281A",
  errorText: "#F2D4C6",
  surfaceEdge: { borderWidth: 1, borderColor: "#1F3A35" },
  shadowFloat: darkShadowFloat,
};

// Colours that are the same in both themes. Lint keeps colour literals in
// this file, so a colour that does change with the theme goes in AppTheme.
export const fixedColours = {
  /** Text and icons on a saturated fill: a badge, a tag, a filled action. */
  onColour: "#ffffff",
  shadow: "#000000",
  /** Behind the nav drawer, faded in with its own opacity. */
  backdrop: "#000000",
  /** The unread-messages badge, white with a grey edge. */
  messageBadge: { bg: "#ffffff", border: "#cccccc", text: "#333333" },
  /** Scanners need dark modules on a light ground, whatever the theme. */
  qr: { light: "#ffffff", dark: "#000000" },
  spotifyGreen: "#1DB954",
  /** The offline games draw their own scenes, the same in both themes. */
  games: {
    text: "#ffffff",
    scrim: "rgba(8, 14, 20, 0.62)",
    panel: "rgba(8, 14, 20, 0.82)",
    card: "#121A23",
    cardEdge: "#2E3A48",
    button: { bg: "#BCDCCD", text: "#0B1D1B", onDark: false },
    buttonGhost: { bg: "#2E3A48", text: "#ffffff", onDark: true },
    /** A character's face while its drawing loads. */
    loadingFace: "rgba(255, 255, 255, 0.18)",
    coin: { face: "#F8D25C", rim: "#B8860B", mark: "#9A6B08", text: "#F6D365", chip: "rgba(248, 210, 92, 0.16)" },
    shooter: {
      sky: "#0E1B3D",
      star: "#C9D6FF",
      plane: "#F5F3E3",
      wing: "#BCDCCD",
      core: "#FF4D6D",
      shot: "#9BF6FF",
      enemy: "#E08A63",
      enemyBig: "#C9603A",
      enemyEye: "#2B1B3F",
      bullet: "#FF5C8A",
      bulletCore: "#ffffff",
    },
    runner: {
      sky: "#2B1B3F",
      moon: "#F6E3D8",
      hill: "#3F2A55",
      ground: "#1E1430",
      groundLine: "#E5AD66",
      rock: "#8C6BA8",
      rockEdge: "#5B3A7A",
      beam: "#F2B84B",
      beamEdge: "#B07A1C",
      tall: "#A487BE",
      log: "#7A5532",
      logEdge: "#4E351F",
      vine: "#3E6B3A",
      leaf: "#6FA05A",
      cloak: "#FF6F59",
      cloakDark: "#D9503F",
      trim: "#FFF1E6",
      rim: "#FFE2D6",
      face: "#1A0F2E",
      eyes: "#9BF6FF",
    },
    flappy: {
      sky: "#9FD8E0",
      cloud: "#EAF7F6",
      pipe: "#4E9A5E",
      pipeEdge: "#2C6B3E",
      ground: "#D9C38C",
      grass: "#7FA650",
      bird: "#F2B84B",
      wing: "#E5AD66",
      beak: "#C9603A",
      eye: "#0F2523",
      eyeWhite: "#ffffff",
    },
    glider: {
      /** The sky through the day, from sunrise (0) to nightfall (1). */
      sky: [
        [0, "#F4C7A8"],
        [0.14, "#97D1E4"],
        [0.6, "#97D1E4"],
        [0.78, "#F1C36E"],
        [0.91, "#E57A5E"],
        [1, "#232B4A"],
      ],
      sun: "#FFE9A8",
      sunset: "#FF8F5A",
      star: "#FFF6DE",
      farHill: "#5E8F86",
      nearHill: "#3F7468",
      ground: "#2F6B57",
      grass: "#8CCB72",
      night: "#0C1230",
      ink: "#14303A",
      bird: "#2A8E86",
      belly: "#F4EAD2",
      wing: "#1C655F",
      beak: "#F2A541",
      cheek: "#F28C7A",
      scarf: "#BCDCCD",
      eye: "#0F2523",
      eyeWhite: "#ffffff",
      pole: "#F4EAD2",
      flag: "#FF6F59",
      track: "rgba(8, 14, 20, 0.35)",
      trackNight: "rgba(255, 255, 255, 0.22)",
      trackFill: "#FFE9A8",
      perfect: "#FFE9A8",
      rough: "#FFB4A3",
      label: "#ffffff",
      shadow: "rgba(0, 0, 0, 0.4)",
    },
  },
} as const;

export const useAppTheme = (): AppTheme => {
  const scheme = useColorScheme();
  const prefersDark =
    scheme === "dark" ||
    (scheme === null &&
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  return prefersDark ? dark : light;
};

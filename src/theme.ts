import { Platform, TextStyle, useColorScheme, ViewStyle } from "react-native";

export const USE_NATIVE_DRIVER = Platform.OS !== "web";

export const durations = {
  overlayIn: 130,
  overlayOut: 100,
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

// One radius per level: surfaces (lg), controls and nested blocks (md),
// small marks (sm), and full only for chips, pills and avatars.
export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
} as const;

/**
 * Familjen Grotesk, loaded in the root layout, carries titles, headings and
 * big numbers; everything else is the system font. Each weight is its own
 * family, so display styles never set fontWeight (iOS would swap the face).
 */
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
  stat: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 } as TextStyle,
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
  warning: string;
  warningSoft: string;
  ghost: string;
  ghostText: string;
  overlay: string;
  chip: Record<"PAID" | "DECLINED" | "default", { bg: string; fg: string }>;
  errorBackground: string;
  errorText: string;
  /** The hairline edge of a resting surface (cards, list blocks). Surfaces are flat; only floating things get a shadow. */
  surfaceEdge: ViewStyle;
  shadowFloat: ViewStyle;
}

const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export const shadowStyle = (
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
  warning: "#7F5612",
  warningSoft: "#F2E2B4",
  ghost: "#EAE8D8",
  ghostText: "#0F2523",
  overlay: "rgba(15, 37, 35, 0.45)",
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
  warning: "#E5AD66",
  warningSoft: "#4A3A1C",
  ghost: "#21403A",
  ghostText: "#F5F3E3",
  overlay: "rgba(0, 0, 0, 0.6)",
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

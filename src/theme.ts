import { Platform, TextStyle, useColorScheme, ViewStyle } from "react-native";

/**
 * SOW brand palette (Brand Guidelines 2022):
 *   #0F2523 deep green   #283E42 teal      #E2F1DA light green
 *   #DDE2D5 sage         #C3D9D8 light blue #F5F3E3 cream
 *   #CD643C dark orange  #E5AD66 light orange
 */

/**
 * Animated's native driver isn't available on web (react-native-web logs a
 * warning and falls back to JS), so gate it off there. Native keeps the
 * native driver for performance.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== "web";

/**
 * Height of the bottom tab bar, excluding the safe-area inset. Shared between
 * the tab bar itself and floating overlays (year picker, Make Request) so they
 * clear it consistently.
 */
export const BOTTOM_TAB_HEIGHT = 50;

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

/** Corner radii — generous and soft throughout. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

/**
 * Type scale tuned for the system font (SF Pro on iOS): tight negative
 * tracking on display sizes, slightly open tracking on micro labels.
 */
export const typography = {
  largeTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  } as TextStyle,
  title: { fontSize: 21, fontWeight: "800", letterSpacing: -0.5 } as TextStyle,
  headline: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3 } as TextStyle,
  body: { fontSize: 15, letterSpacing: -0.15, lineHeight: 21 } as TextStyle,
  caption: { fontSize: 13, letterSpacing: -0.05 } as TextStyle,
  /** Uppercase micro label for sections and form fields. */
  label: {
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  } as TextStyle,
  amount: { fontSize: 26, fontWeight: "800", letterSpacing: -0.8 } as TextStyle,
} as const;

export interface AppTheme {
  dark: boolean;
  background: string;
  card: string;
  text: string;
  muted: string;
  /** Even quieter than muted — timestamps, helper text. */
  faint: string;
  border: string;
  /** Hairline separators inside cards. */
  separator: string;
  inputBackground: string;
  primary: string;
  onPrimary: string;
  /** Soft tinted fill for selected/highlighted states of the primary. */
  primarySoft: string;
  /** Warm brand orange for badges and moments of emphasis. */
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  /** Amber for pending/in-progress states (active approval steps). */
  warning: string;
  warningSoft: string;
  ghost: string;
  ghostText: string;
  /** Modal / sheet backdrop. */
  overlay: string;
  chip: Record<"PAID" | "DECLINED" | "default", { bg: string; fg: string }>;
  errorBackground: string;
  errorText: string;
  /** Soft, brand-tinted elevation. */
  shadowCard: ViewStyle;
  shadowFloat: ViewStyle;
}

const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * Cross-platform elevation. On web the `shadow*` style props are deprecated in
 * favour of `boxShadow`, so emit that there; native keeps the `shadow*` props
 * plus Android `elevation` so its rendering is unchanged.
 */
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

const lightShadowCard = shadowStyle("#0F2523", 0.07, 14, 5, 2);
const lightShadowFloat = shadowStyle("#0F2523", 0.16, 22, 10, 8);
const darkShadowCard = shadowStyle("#000000", 0.3, 14, 5, 2);
const darkShadowFloat = shadowStyle("#000000", 0.45, 22, 10, 8);

const light: AppTheme = {
  dark: false,
  background: "#F5F3E3", // brand cream
  card: "#FFFFFF",
  text: "#0F2523",
  muted: "#5C6B62",
  faint: "#8C988F",
  border: "#DDE2D5",
  separator: "#EDEBDD",
  inputBackground: "#F4F2E6", // soft filled fields on white cards
  primary: "#283E42",
  onPrimary: "#F5F3E3",
  primarySoft: "#DFEAE9", // brand light blue, lifted
  accent: "#CD643C",
  accentSoft: "#F8E6DB",
  success: "#3E6B4F",
  successSoft: "#E2F1DA", // brand light green
  danger: "#B5403D",
  dangerSoft: "#F6DFD9",
  warning: "#8A5E1A", // dark amber — 5.1:1 against cream, meets WCAG AA
  warningSoft: "#EDD88A", // warm yellow, visibly distinct from cream background
  ghost: "#ECEFE4",
  ghostText: "#0F2523",
  overlay: "rgba(15, 37, 35, 0.45)",
  chip: {
    PAID: { bg: "#E2F1DA", fg: "#2C5239" },
    DECLINED: { bg: "#F6DFD9", fg: "#9C3A23" },
    default: { bg: "#F6E8CD", fg: "#8A5E1A" }, // pending — light orange
  },
  errorBackground: "#F6DFD9",
  errorText: "#7C3015",
  shadowCard: lightShadowCard,
  shadowFloat: lightShadowFloat,
};

const dark: AppTheme = {
  dark: true,
  background: "#0F2523", // brand deep green
  card: "#1B3330",
  text: "#F5F3E3",
  muted: "#A9BDB2",
  faint: "#74897E",
  border: "#2C4A45",
  separator: "#27433E",
  inputBackground: "#142B28",
  primary: "#C3D9D8", // brand light blue pops on deep green
  onPrimary: "#0F2523",
  primarySoft: "#24403C",
  accent: "#E5AD66",
  accentSoft: "#3C3122",
  success: "#6FA983",
  successSoft: "#1E4634",
  danger: "#E08A63",
  dangerSoft: "#46251B",
  warning: "#E5AD66", // brand light orange pops on deep green
  warningSoft: "#4A3A1C",
  ghost: "#27433E",
  ghostText: "#F5F3E3",
  overlay: "rgba(0, 0, 0, 0.6)",
  chip: {
    PAID: { bg: "#1E4634", fg: "#DDF0DC" },
    DECLINED: { bg: "#52281A", fg: "#F2D4C6" },
    default: { bg: "#4A3A1C", fg: "#F0DDB6" },
  },
  errorBackground: "#52281A",
  errorText: "#F2D4C6",
  shadowCard: darkShadowCard,
  shadowFloat: darkShadowFloat,
};

/** The app palette for the current system colour scheme. */
export const useAppTheme = (): AppTheme => {
  const scheme = useColorScheme();
  // On web, useColorScheme() returns null on the first render before it reads
  // the system preference — fall back to matchMedia to avoid a light-theme flash.
  const prefersDark =
    scheme === "dark" ||
    (scheme === null &&
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  return prefersDark ? dark : light;
};

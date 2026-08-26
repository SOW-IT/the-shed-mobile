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

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

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
  shadowCard: ViewStyle;
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

const lightShadowCard = shadowStyle("#0F2523", 0.07, 14, 5, 2);
const lightShadowFloat = shadowStyle("#0F2523", 0.16, 22, 10, 8);
const darkShadowCard = shadowStyle("#000000", 0.3, 14, 5, 2);
const darkShadowFloat = shadowStyle("#000000", 0.45, 22, 10, 8);

const light: AppTheme = {
  dark: false,
  background: "#F5F3E3",
  card: "#FFFFFF",
  text: "#0F2523",
  muted: "#5C6B62",
  faint: "#8C988F",
  border: "#DDE2D5",
  separator: "#EDEBDD",
  inputBackground: "#F4F2E6",
  primary: "#283E42",
  onPrimary: "#F5F3E3",
  primarySoft: "#DFEAE9",
  accent: "#CD643C",
  accentSoft: "#F8E6DB",
  success: "#3E6B4F",
  successSoft: "#E2F1DA",
  danger: "#B5403D",
  dangerSoft: "#F6DFD9",
  warning: "#8A5E1A",
  warningSoft: "#EDD88A",
  ghost: "#ECEFE4",
  ghostText: "#0F2523",
  overlay: "rgba(15, 37, 35, 0.45)",
  chip: {
    PAID: { bg: "#E2F1DA", fg: "#2C5239" },
    DECLINED: { bg: "#F6DFD9", fg: "#9C3A23" },
    default: { bg: "#F6E8CD", fg: "#8A5E1A" },
  },
  errorBackground: "#F6DFD9",
  errorText: "#7C3015",
  shadowCard: lightShadowCard,
  shadowFloat: lightShadowFloat,
};

const dark: AppTheme = {
  dark: true,
  background: "#0F2523",
  card: "#1B3330",
  text: "#F5F3E3",
  muted: "#A9BDB2",
  faint: "#74897E",
  border: "#2C4A45",
  separator: "#27433E",
  inputBackground: "#142B28",
  primary: "#C3D9D8",
  onPrimary: "#0F2523",
  primarySoft: "#24403C",
  accent: "#E5AD66",
  accentSoft: "#3C3122",
  success: "#6FA983",
  successSoft: "#1E4634",
  danger: "#E08A63",
  dangerSoft: "#46251B",
  warning: "#E5AD66",
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

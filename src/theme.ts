import { useColorScheme } from "react-native";

export interface AppTheme {
  dark: boolean;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  inputBackground: string;
  primary: string;
  success: string;
  danger: string;
  ghost: string;
  ghostText: string;
  chip: Record<"PAID" | "DECLINED" | "default", { bg: string; fg: string }>;
  errorBackground: string;
  errorText: string;
}

// SOW brand primary (the web app's ColoursCampuses.STAFF).
const BRAND = "#283E42";
// Lighter brand tint that stays readable on dark surfaces.
const BRAND_LIGHT = "#6fa3ad";

const light: AppTheme = {
  dark: false,
  background: "#f3f4f6",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#d1d5db",
  inputBackground: "#ffffff",
  primary: BRAND,
  success: "#16a34a",
  danger: "#dc2626",
  ghost: "#e5e7eb",
  ghostText: "#111827",
  chip: {
    PAID: { bg: "#dcfce7", fg: "#166534" },
    DECLINED: { bg: "#fee2e2", fg: "#991b1b" },
    default: { bg: "#fef3c7", fg: "#92400e" },
  },
  errorBackground: "#fee2e2",
  errorText: "#991b1b",
};

const dark: AppTheme = {
  dark: true,
  background: "#0f172a",
  card: "#1e293b",
  text: "#f1f5f9",
  muted: "#94a3b8",
  border: "#334155",
  inputBackground: "#0f172a",
  primary: BRAND_LIGHT,
  success: "#22c55e",
  danger: "#ef4444",
  ghost: "#334155",
  ghostText: "#f1f5f9",
  chip: {
    PAID: { bg: "#14532d", fg: "#bbf7d0" },
    DECLINED: { bg: "#7f1d1d", fg: "#fecaca" },
    default: { bg: "#78350f", fg: "#fde68a" },
  },
  errorBackground: "#7f1d1d",
  errorText: "#fecaca",
};

/** The app palette for the current system colour scheme. */
export const useAppTheme = (): AppTheme =>
  useColorScheme() === "dark" ? dark : light;

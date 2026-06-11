import { useColorScheme } from "react-native";

/**
 * SOW brand palette (Brand Guidelines 2022):
 *   #0F2523 deep green   #283E42 teal      #E2F1DA light green
 *   #DDE2D5 sage         #C3D9D8 light blue #F5F3E3 cream
 *   #CD643C dark orange  #E5AD66 light orange
 */
export interface AppTheme {
  dark: boolean;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  inputBackground: string;
  primary: string;
  onPrimary: string;
  success: string;
  danger: string;
  ghost: string;
  ghostText: string;
  chip: Record<"PAID" | "DECLINED" | "default", { bg: string; fg: string }>;
  errorBackground: string;
  errorText: string;
}

const light: AppTheme = {
  dark: false,
  background: "#F5F3E3", // brand cream
  card: "#FDFCF4",
  text: "#0F2523",
  muted: "#5C6B62",
  border: "#DDE2D5",
  inputBackground: "#FFFFFF",
  primary: "#283E42",
  onPrimary: "#F5F3E3",
  success: "#3E6B4F",
  danger: "#B5403D",
  ghost: "#DDE2D5",
  ghostText: "#0F2523",
  chip: {
    PAID: { bg: "#E2F1DA", fg: "#0F2523" },
    DECLINED: { bg: "#F2D4C6", fg: "#7C3015" },
    default: { bg: "#F6E4C4", fg: "#6B4A14" }, // pending — light orange
  },
  errorBackground: "#F2D4C6",
  errorText: "#7C3015",
};

const dark: AppTheme = {
  dark: true,
  background: "#0F2523", // brand deep green
  card: "#1B3330",
  text: "#F5F3E3",
  muted: "#A9BDB2",
  border: "#2C4A45",
  inputBackground: "#142B28",
  primary: "#C3D9D8", // brand light blue pops on deep green
  onPrimary: "#0F2523",
  success: "#4E8A63",
  danger: "#CD643C", // brand dark orange
  ghost: "#2C4A45",
  ghostText: "#F5F3E3",
  chip: {
    PAID: { bg: "#1E4634", fg: "#DDF0DC" },
    DECLINED: { bg: "#5A2A1C", fg: "#F2D4C6" },
    default: { bg: "#5A431C", fg: "#F6E4C4" },
  },
  errorBackground: "#5A2A1C",
  errorText: "#F2D4C6",
};

/** The app palette for the current system colour scheme. */
export const useAppTheme = (): AppTheme =>
  useColorScheme() === "dark" ? dark : light;

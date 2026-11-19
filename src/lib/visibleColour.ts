import type { AppTheme } from "@/theme";

export const visibleColour = (colour: string, t: Pick<AppTheme, "dark" | "text">): string =>
  t.dark && colour.toLowerCase() === "#000000" ? t.text : colour;

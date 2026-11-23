import type { AppTheme } from "@/theme";

export const visibleColour = (colour: string, t: Pick<AppTheme, "dark" | "text">): string =>
  // eslint-disable-next-line no-restricted-syntax -- matches a stored colour of pure black, which vanishes on the dark theme
  t.dark && colour.toLowerCase() === "#000000" ? t.text : colour;

import { useWindowDimensions } from "react-native";
import { WIDE_SCREEN_MIN_WIDTH } from "@/theme";

/** Width of the permanent left sidebar on wide screens (iPad, desktop web). */
export const SIDEBAR_WIDTH = 260;

/**
 * Wide screens swap the top bar, bottom tabs and swipe-in drawer for one
 * permanent sidebar. The app is portrait-only, so phones never get it.
 */
export const useWideLayout = () => useWindowDimensions().width >= WIDE_SCREEN_MIN_WIDTH;

/** The window width left over for screens, after the sidebar takes its share. */
export const useContentWidth = () => {
  const { width } = useWindowDimensions();
  return width >= WIDE_SCREEN_MIN_WIDTH ? width - SIDEBAR_WIDTH : width;
};

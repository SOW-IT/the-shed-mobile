import { useWindowDimensions } from "react-native";
import { WIDE_SCREEN_MIN_WIDTH } from "@/theme";

export const SIDEBAR_WIDTH = 260;

export const useWideLayout = () => useWindowDimensions().width >= WIDE_SCREEN_MIN_WIDTH;

export const useContentWidth = () => {
  const { width } = useWindowDimensions();
  return width >= WIDE_SCREEN_MIN_WIDTH ? width - SIDEBAR_WIDTH : width;
};

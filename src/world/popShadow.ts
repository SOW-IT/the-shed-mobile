import { Platform, type ViewStyle } from "react-native";
import { hud } from "./palette";

export const popShadow = (drop = 3): ViewStyle =>
  Platform.OS === "android"
    ? { boxShadow: `0px ${drop}px 0px ${hud.forest}` }
    : { shadowColor: hud.forest, shadowOffset: { width: 0, height: drop }, shadowOpacity: 1, shadowRadius: 0 };

import { Platform, type ViewStyle } from "react-native";
import { worldColours } from "../../worldColours";

/**
 * The hard drop under the World's cream chips and pills. Android ignores
 * shadow offsets, so it gets a box shadow. Here, not under src/world, so the
 * Games list can use it without loading the World.
 */
export const popShadow = (drop = 3): ViewStyle =>
  Platform.OS === "android"
    ? { boxShadow: `0px ${drop}px 0px ${worldColours.hud.forest}` }
    : { shadowColor: worldColours.hud.forest, shadowOffset: { width: 0, height: drop }, shadowOpacity: 1, shadowRadius: 0 };

import { ImageSourcePropType } from "react-native";
import { acronym } from "../../shared/flow";
import { ALL_SUBGROUP } from "../../shared/rollcall";

/**
 * Coloured campus wordmarks, keyed by acronym (see shared/flow DISPLAY_ACRONYMS).
 * The image colours match shared/flow UNIVERSITY_COLOURS. Note Macquarie's asset
 * files are prefixed "MQU" while its acronym is "MACQ". Campuses without a
 * wordmark asset (ACU, WSU) fall back to a colour swatch in the UI.
 */
const LOGOS: Record<string, ImageSourcePropType> = {
  USYD: require("../../assets/images/USYD-red.png"),
  UNSW: require("../../assets/images/UNSW-green.png"),
  UTS: require("../../assets/images/UTS-blue.png"),
  MACQ: require("../../assets/images/MQU-yellow.png"),
};

/** SOW mark for the org-wide "ALL" sub-group — light on dark UI, dark on light UI. */
export const sowLogo = (darkTheme: boolean): ImageSourcePropType =>
  darkTheme
    ? require("../../assets/images/mark-cream.png")
    : require("../../assets/images/mark-dark.png");

/** The coloured wordmark for a campus by full name or acronym, or null. */
export const universityLogo = (name: string): ImageSourcePropType | null =>
  LOGOS[acronym(name)] ?? null;

/** Wordmark for an attendance sub-group (campus name or the synthetic ALL). */
export const subgroupLogo = (
  subgroup: string,
  darkTheme = false
): ImageSourcePropType | null =>
  subgroup === ALL_SUBGROUP ? sowLogo(darkTheme) : universityLogo(subgroup);

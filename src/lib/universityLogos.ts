import { ImageSourcePropType } from "react-native";
import { acronym } from "../../shared/flow";
import { SOW_SUBGROUP } from "../../shared/rollcall";

const LOGOS: Record<string, ImageSourcePropType> = {
  USYD: require("../../assets/images/USYD-red.png"),
  UNSW: require("../../assets/images/UNSW-green.png"),
  UTS: require("../../assets/images/UTS-blue.png"),
  MACQ: require("../../assets/images/MQU-yellow.png"),
  WSU: require("../../assets/images/WSU-crimson.png"),
};

export const sowLogo = (darkTheme: boolean): ImageSourcePropType =>
  darkTheme
    ? require("../../assets/images/mark-cream.png")
    : require("../../assets/images/mark-dark.png");

export const universityLogo = (name: string): ImageSourcePropType | null =>
  LOGOS[acronym(name)] ?? null;

export const subgroupLogo = (
  subgroup: string,
  darkTheme = false
): ImageSourcePropType | null =>
  subgroup === SOW_SUBGROUP || subgroup === "ALL"
    ? sowLogo(darkTheme)
    : universityLogo(subgroup);

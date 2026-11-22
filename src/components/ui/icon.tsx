import Ionicons from "@expo/vector-icons/Ionicons";
import { MaterialSubsetIcons } from "./subsetIcons";

export type AppIconName =
  | keyof typeof Ionicons.glyphMap
  | { material: keyof typeof MaterialSubsetIcons.glyphMap };

export const AppIcon = ({
  name,
  size,
  color,
}: {
  name: AppIconName;
  size: number;
  color: string;
}) =>
  typeof name === "string" ? (
    <Ionicons name={name} size={size} color={color} />
  ) : (
    <MaterialSubsetIcons name={name.material} size={size} color={color} />
  );

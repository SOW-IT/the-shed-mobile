import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export type AppIconName =
  | keyof typeof Ionicons.glyphMap
  | { material: keyof typeof MaterialCommunityIcons.glyphMap };

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
    <MaterialCommunityIcons name={name.material} size={size} color={color} />
  );

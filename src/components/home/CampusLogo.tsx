import { View, Text, StyleSheet } from "react-native";
import { universityColour } from "../../../shared/flow";
import { contrastingText } from "../../../shared/rollcall";
import { useAppTheme } from "@/theme";

export const CampusLogo = ({ name, size = 40 }: { name: string; size?: number }) => {
  const t = useAppTheme();
  const colour = universityColour(name) ?? t.primary;
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colour },
      ]}
    >
      <Text
        style={{ color: contrastingText(colour), fontWeight: "800", fontSize: Math.max(10, size * 0.26) }}
        numberOfLines={1}
      >
        {shorten(name)}
      </Text>
    </View>
  );
};

const shorten = (name: string) => {
  const tokens = name.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean);
  if (tokens.length <= 2) return tokens.map(w => w[0]?.toUpperCase()).join("");
  return tokens.map(w => w[0]?.toUpperCase()).slice(0, 2).join("");
};

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center" },
});

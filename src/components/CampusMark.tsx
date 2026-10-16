import { Image, StyleSheet, Text, View } from "react-native";
import { subgroupColour, subgroupLabel, contrastingText } from "../../shared/rollcall";
import { subgroupLogo, universityLogo } from "@/lib/universityLogos";
import { useAppTheme } from "@/theme";

type CampusMarkProps = {
  campus: string;
  logoSource?: "subgroup" | "university";
  circleDiameter?: number;
};

export function CampusMark({
  campus,
  logoSource = "subgroup",
  circleDiameter = 40,
}: CampusMarkProps) {
  const t = useAppTheme();
  const colour = subgroupColour(campus);
  const label = subgroupLabel(campus);
  const logo =
    logoSource === "university"
      ? universityLogo(campus)
      : subgroupLogo(campus, t.dark);
  const r = circleDiameter / 2;

  if (logo) {
    return (
      <View
        style={[
          styles.circle,
          {
            width: circleDiameter,
            height: circleDiameter,
            borderRadius: r,
          },
        ]}
      >
        <Image
          source={logo}
          style={{ width: circleDiameter - 6, height: circleDiameter - 6 }}
          resizeMode="contain"
        />
      </View>
    );
  }
  const fontSize = label.length > 4 ? 9 : label.length > 3 ? 10 : 11;
  return (
    <View
      style={[
        styles.circle,
        {
          width: circleDiameter,
          height: circleDiameter,
          borderRadius: r,
          backgroundColor: colour,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: contrastingText(colour), fontSize, textAlign: "center" },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

import { StyleSheet, Text, View } from "react-native";
import { contrastingText, subgroupColour, subgroupLabel } from "../../../shared/rollcall";
import { radius, typography } from "@/theme";

export const SubgroupPill = ({ subgroup }: { subgroup: string }) => {
  const colour = subgroupColour(subgroup);
  return (
    <View style={[styles.pill, { backgroundColor: colour }]}>
      <Text
        style={[
          typography.caption,
          styles.text,
          { color: contrastingText(colour) },
        ]}
      >
        {subgroupLabel(subgroup)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

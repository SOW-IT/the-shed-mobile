import { StyleSheet, Text, View } from "react-native";
import { roleNeedsUniversity, universityColour } from "../../../shared/flow";
import { contrastingText, subgroupLabel } from "../../../shared/rollcall";
import { radius, typography } from "@/theme";

export const campusPill = (
  university: string | undefined,
  roles: readonly string[],
  theme: { ghost: string; ghostText: string }
): { label: string; background: string; text: string; colour?: string } => {
  const colour = university ? universityColour(university) : undefined;
  const hasStaffRole = roles.some((role) => !roleNeedsUniversity(role));
  return {
    label: university ? subgroupLabel(university) : hasStaffRole ? "STAFF" : "OTHER",
    background: colour ?? theme.ghost,
    text: colour ? contrastingText(colour) : theme.ghostText,
    colour,
  };
};

export const CampusPill = ({ pill }: { pill: ReturnType<typeof campusPill> }) => (
  <View style={[styles.pill, { backgroundColor: pill.background }]}>
    <Text
      style={[typography.caption, styles.text, { color: pill.text }]}
      numberOfLines={1}
    >
      {pill.label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  pill: {
    maxWidth: 92,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
});

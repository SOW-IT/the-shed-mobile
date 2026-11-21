import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { isOrgWideSubgroup, subgroupColour } from "../../../shared/rollcall";
import { CampusMark } from "@/components/CampusMark";
import { FadeInView, stagger } from "@/components/ui";
import { useAppTheme } from "@/theme";

const CAMPUS_MARK = 40;

export function CampusSelector({
  subgroups,
  selected,
  onSelect,
  labelOf,
  style,
}: {
  subgroups: string[];
  selected: string | null;
  onSelect: (subgroup: string) => void;
  labelOf: (subgroup: string) => string;
  style?: ViewStyle;
}) {
  const t = useAppTheme();
  return (
    <View style={[styles.row, style]}>
      {subgroups.map((sg, i) => {
        const active = sg === selected;
        const ringColour =
          isOrgWideSubgroup(sg) && t.dark ? t.text : subgroupColour(sg);
        return (
          <FadeInView key={sg} delay={stagger(i)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labelOf(sg)}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(sg)}
              style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.ring, active && { borderColor: ringColour }]}>
                <CampusMark campus={sg} circleDiameter={CAMPUS_MARK} />
              </View>
            </Pressable>
          </FadeInView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slot: { flex: 1, alignItems: "center", minWidth: 0 },
  ring: {
    borderRadius: 999,
    padding: 0,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
});

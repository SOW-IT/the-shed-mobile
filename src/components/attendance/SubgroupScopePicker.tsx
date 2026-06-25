import { Pressable, StyleSheet, Text, View } from "react-native";
import { subgroupColour, subgroupLabel } from "../../../shared/rollcall";
import { CampusMark } from "@/components/CampusMark";
import { spacing, useAppTheme } from "@/theme";

const MARK = 40;

/**
 * Group scope selector that mirrors the Events tab's group picker: each group
 * shows its branded logo circle and an "All" circle sits first. Selection draws
 * a ring around the mark. Works for both multi-select (tags) and single-select
 * (metadata) — the caller decides what "selected" means per group.
 */
export function SubgroupScopePicker({
  subgroups,
  allSelected,
  isSelected,
  onSelectAll,
  onToggle,
}: {
  subgroups: string[];
  allSelected: boolean;
  isSelected: (subgroup: string) => boolean;
  onSelectAll: () => void;
  onToggle: (subgroup: string) => void;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="All groups"
        accessibilityState={{ selected: allSelected }}
        onPress={onSelectAll}
        style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
      >
        <View
          style={[
            styles.ring,
            { borderColor: allSelected ? t.primary : "transparent" },
          ]}
        >
          <View
            style={[
              styles.allCircle,
              { backgroundColor: t.ghost, borderColor: t.separator },
            ]}
          >
            <Text style={[styles.allText, { color: t.ghostText }]}>All</Text>
          </View>
        </View>
      </Pressable>
      {subgroups.map((sg) => {
        const selected = isSelected(sg);
        const colour = subgroupColour(sg);
        return (
          <Pressable
            key={sg}
            accessibilityRole="button"
            accessibilityLabel={subgroupLabel(sg)}
            accessibilityState={{ selected }}
            onPress={() => onToggle(sg)}
            style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
          >
            <View
              style={[
                styles.ring,
                { borderColor: selected ? colour : "transparent" },
              ]}
            >
              <CampusMark campus={sg} variant="circle" circleDiameter={MARK} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  slot: {
    alignItems: "center",
  },
  /**
   * Selection ring hugging the circular mark. The border is always present so
   * selecting/deselecting only toggles its colour — keeps the layout stable.
   */
  ring: {
    borderRadius: 999,
    borderWidth: 2.5,
    padding: 0,
  },
  allCircle: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  allText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

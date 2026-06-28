import { Pressable, StyleSheet, Text, View } from "react-native";
import { subgroupColour, subgroupLabel } from "../../../shared/rollcall";
import { CampusMark } from "@/components/CampusMark";
import { FadeInView, stagger } from "@/components/ui";
import { spacing, useAppTheme } from "@/theme";

const MARK = 40;
/** Unselected marks fade back so the selected groups read as active. */
const FADED_OPACITY = 0.35;

/**
 * Group scope selector that mirrors the Events tab's group picker: each group
 * shows its branded logo circle. Selected groups draw a coloured ring and sit
 * at full opacity; unselected groups are dimmed. An optional leading "All"
 * circle is shown for single-select callers (metadata); the Tags picker omits
 * it and instead selects every group by default.
 */
export function SubgroupScopePicker({
  subgroups,
  isSelected,
  onToggle,
  allOption,
}: {
  subgroups: string[];
  isSelected: (subgroup: string) => boolean;
  onToggle: (subgroup: string) => void;
  /** When provided, render a leading "All groups" circle (single-select). */
  allOption?: { selected: boolean; onSelect: () => void };
}) {
  const t = useAppTheme();
  return (
    <View style={styles.row}>
      {allOption ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All groups"
          accessibilityState={{ selected: allOption.selected }}
          onPress={allOption.onSelect}
          style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
        >
          <View
            style={[
              styles.ring,
              { borderColor: allOption.selected ? t.primary : "transparent" },
              !allOption.selected && { opacity: FADED_OPACITY },
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
      ) : null}
      {subgroups.map((sg, i) => {
        const selected = isSelected(sg);
        const colour = subgroupColour(sg);
        return (
          <FadeInView key={sg} delay={stagger(i)}>
            <Pressable
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
                  !selected && { opacity: FADED_OPACITY },
                ]}
              >
                <CampusMark campus={sg} variant="circle" circleDiameter={MARK} />
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
